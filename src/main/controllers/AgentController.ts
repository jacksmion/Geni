
import { ipcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { AgentRuntime, AgentRuntimeOptions, AgentStateEvent } from '../services/agent';
import { SessionManager } from '../services/session';
import { AGENT_CHANNELS, AGENT_EVENTS } from '../../common/ipc/channels';
import { AgentStartRequest, AgentStartResponse, AgentEvent } from '../../common/types/agentEvents';

import { ToolRegistry } from '../services/tools/ToolRegistry';
import { AppSettings } from '../../common/types/settings';
import { ToolController } from './ToolController';
import { Skill } from '../../common/types/skill';
import { MemoryStore } from '../services/memory/MemoryStore';
import { UsageManager } from '../services/usage/UsageManager';
import { StaffManager } from '../services/staff/StaffManager';

/**
 * Agent Controller
 * 
 * Handles IPC requests for Agent operations.
 * Bridges Service Layer events to UI.
 */
export class AgentController {
    private agentRuntime: AgentRuntime;
    private sessionManager: SessionManager;
    private toolRegistry: ToolRegistry;
    private toolController: ToolController;
    private staffManager: StaffManager;
    private activeWebContents: WebContents | null = null;
    private currentSessionId: string | null = null;
    private abortControllers = new Map<string, AbortController>();

    // IPC Throttling buffers
    private streamBuffer: string = '';
    private pendingSteps: any[] | null = null;
    private throttleTimer: NodeJS.Timeout | null = null;
    private throttleRef: number = 0;
    private readonly THROTTLE_MS = 120;

    constructor(
        settings: AppSettings,
        toolRegistry: ToolRegistry,
        sessionManager: SessionManager,
        toolController: ToolController,
        memoryStore: MemoryStore,
        usageManager: UsageManager,
        staffManager: StaffManager
    ) {
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.toolController = toolController;
        this.staffManager = staffManager;
        this.agentRuntime = new AgentRuntime(settings, toolRegistry, memoryStore, usageManager);

        this.setupResultListeners();
    }

    public updateSettings(settings: AppSettings) {
        this.agentRuntime.updateSettings(settings);
    }

    /**
     * Bind IPC handlers
     */
    public registerHandlers(): void {
        ipcMain.handle(AGENT_CHANNELS.START, this.handleStart.bind(this));
        ipcMain.handle(AGENT_CHANNELS.STOP, this.handleStop.bind(this));
        ipcMain.handle(AGENT_CHANNELS.GET_STATE, () => this.agentRuntime.getState());
    }

    private setupResultListeners() {
        // Setup Agent event listeners that forward to WebContents
        this.agentRuntime.setStateChangeCallback((event: AgentStateEvent) => {
            console.log(`[AgentController] State changed: ${event.previousState} -> ${event.currentState} (${event.message})`);
            this.broadcast(AGENT_EVENTS.STATE_CHANGE, event);
        });

        // Bridge authorization requests to UI via IPC
        this.agentRuntime.setAuthorizationCallback(async (request, decision) => {
            console.log(`[AgentController] Authorization required for tool: ${request.toolName}`);

            return new Promise((resolve) => {
                const requestId = request.requestId || Math.random().toString(36).substring(7);
                let settled = false;

                const cleanup = () => {
                    ipcMain.removeListener(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, handler);
                };

                const settle = (result: { approved: boolean; rememberDecision?: boolean; message?: string }) => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    resolve(result);
                };

                // Broadcast request to renderer
                this.broadcast(AGENT_EVENTS.AUTHORIZATION_REQUEST, {
                    requestId,
                    toolName: request.toolName,
                    args: request.args,
                    trustLevel: decision.trustLevel,
                    reason: decision.reason
                });

                // Listen for response from UI
                const handler = (_event: any, response: any) => {
                    if (response && response.requestId === requestId) {
                        console.log(`[AgentController] Authorization response received: ${response.approved}`);
                        settle({
                            approved: response.approved,
                            rememberDecision: response.remember
                        });
                    }
                };
                ipcMain.on(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, handler);

                // Listen for abort signal - if user clicks Stop, immediately deny authorization
                if (this.currentSessionId) {
                    const controller = this.abortControllers.get(this.currentSessionId);
                    if (controller?.signal) {
                        if (controller.signal.aborted) {
                            settle({ approved: false, message: 'Aborted by user' });
                            return;
                        }
                        const onAbort = () => {
                            console.log(`[AgentController] Authorization aborted by user for tool: ${request.toolName}`);
                            settle({ approved: false, message: 'Aborted by user' });
                        };
                        controller.signal.addEventListener('abort', onAbort, { once: true });
                    }
                }

                // Timeout fallback to avoid hanging forever
                setTimeout(() => {
                    console.warn(`[AgentController] Authorization timed out for tool: ${request.toolName}`);
                    settle({ approved: false, message: 'Authorization timed out' });
                }, 5 * 60 * 1000); // 5 minutes timeout (reduced from 10)
            });
        });
    }

    private broadcast(channel: string, payload: any) {
        if (this.activeWebContents && !this.activeWebContents.isDestroyed()) {
            this.activeWebContents.send(channel, payload);
        }
    }

    private startThrottling() {
        this.throttleRef++;
        if (this.throttleTimer) return;
        this.throttleTimer = setInterval(() => this.flushThrottledEvents(), this.THROTTLE_MS);
    }

    private stopThrottling() {
        this.throttleRef = Math.max(0, this.throttleRef - 1);
        if (this.throttleRef === 0 && this.throttleTimer) {
            clearInterval(this.throttleTimer);
            this.throttleTimer = null;
        }
        // Final flush to ensure no data is left in buffers
        this.flushThrottledEvents();
    }

    private flushThrottledEvents() {
        if (!this.activeWebContents || this.activeWebContents.isDestroyed()) return;

        // Flush Stream
        if (this.streamBuffer) {
            this.activeWebContents.send(AGENT_EVENTS.STREAM, { content: this.streamBuffer, isReset: false });
            this.streamBuffer = '';
        }

        // Flush Steps (Only the latest state matters)
        if (this.pendingSteps) {
            this.activeWebContents.send(AGENT_EVENTS.STEP_UPDATE, { steps: this.pendingSteps });
            this.pendingSteps = null;
        }
    }

    private buildEmitFn(_sid: string): (event: AgentEvent) => void {
        return (event: AgentEvent) => {
            // Phase 1: 仅 log，等 Phase 4 再接管 IPC 广播
            // state_change / auth_request / error 已有独立路径，暂不重复
            if (event.type !== 'state_change' && event.type !== 'auth_request') {
                console.log(`[AgentController] emit <- ${event.type}`);
            }
        };
    }

    /**
     * Handle Agent Start Request
     */
    private async handleStart(event: IpcMainInvokeEvent, payload: AgentStartRequest): Promise<AgentStartResponse> {
        const pipelineStartTime = performance.now();
        console.log(`\n[AgentPerf] ===== Pipeline Start (Received Request from UI) =====`);
        this.activeWebContents = event.sender;

        try {
            const { sessionId, prompt, options } = payload;

            // 1. Resolve Session
            let sid = sessionId;
            if (!sid) {
                const newSession = await this.sessionManager.createSession();
                sid = newSession.id;
            }
            this.currentSessionId = sid;

            // 2. Prepare Context from Session
            const history = await this.sessionManager.getHistory(sid);

            // 3. Setup AbortController
            const controller = new AbortController();
            this.abortControllers.set(sid, controller);

            // 4. Prepare Runtime Options
            const enabledSkillObjects = (payload.options?.skills)
                ? this.toolController.getSkillObjectsByIds(payload.options.skills)
                : this.toolController.getEnabledSkillObjects();
            const skillList: Skill[] = enabledSkillObjects.map(obj => ({
                id: obj.id,
                name: obj.name,
                description: obj.description,
                content: obj.instruction,
                path: obj.path || '',
                enabled: true,
                trustLevel: 'Auto'
            }));

            // 4b. Resolve Staff Profile (if staffId present)
            const staffId = payload.options?.staffId;
            let systemPromptOverride: string | undefined;
            let modelOverride: string | undefined;

            if (staffId) {
                const profile = this.staffManager.get(staffId);
                if (profile) {
                    systemPromptOverride = profile.persona;
                    modelOverride = profile.model;
                    // Override skills if staff has specific skillIds configured
                    if (profile.skillIds.length > 0) {
                        const staffSkills = this.toolController.getSkillObjectsByIds(profile.skillIds);
                        skillList.length = 0;
                        staffSkills.forEach(obj => skillList.push({
                            id: obj.id, name: obj.name, description: obj.description,
                            content: obj.instruction, path: obj.path || '',
                            enabled: true, trustLevel: 'Auto'
                        }));
                    }
                }
            }

            const runOptions: AgentRuntimeOptions = {
                signal: controller.signal,
                history: history,
                model: options?.model || modelOverride,
                systemPrompt: systemPromptOverride,
                skills: skillList,
                sessionId: sid,
                emit: this.buildEmitFn(sid)
            };

            const prepTime = performance.now() - pipelineStartTime;
            console.log(`[AgentPerf] Pipeline Preparation (Session & Config Load): ${prepTime.toFixed(2)}ms`);

            // 5. Run Agent with Throttling
            this.startThrottling();
            const result = await this.agentRuntime.run(
                prompt,
                this.toolRegistry.getTools(),
                runOptions,
                (chunk, reset) => {
                    if (reset) {
                        // Resets (like starting a new thought) should be immediate to avoid UI ghosting
                        this.flushThrottledEvents();
                        this.broadcast(AGENT_EVENTS.STREAM, { content: chunk, isReset: true });
                    } else {
                        this.streamBuffer += chunk;
                    }
                },
                (steps) => {
                    this.pendingSteps = steps;
                }
            );
            this.stopThrottling();

            // 6. Cleanup AbortController
            this.abortControllers.delete(sid);

            // 7. Update Session History
            if (result.newMessages) {
                // Inject steps into the last assistant message for persistence
                if (result.steps && result.steps.length > 0) {
                    for (let i = result.newMessages.length - 1; i >= 0; i--) {
                        if (result.newMessages[i].role === 'assistant') {
                            (result.newMessages[i] as any).steps = result.steps;
                            break;
                        }
                    }
                }

                for (const msg of result.newMessages) {
                    await this.sessionManager.addMessage(sid, msg as any);
                }
            }

            console.log(`[AgentPerf] ===== Pipeline End (UI Notified, Database Written): ${(performance.now() - pipelineStartTime).toFixed(2)}ms =====\n`);

            return { success: true, sessionId: sid };

        } catch (error: any) {
            console.error('Agent execution failed:', error);

            // Cleanup on error/abort
            if (this.currentSessionId) {
                this.abortControllers.delete(this.currentSessionId);
            }

            this.broadcast(AGENT_EVENTS.ERROR, { message: error.message });
            return { success: false, error: error.message };
        }
    }

    private handleStop(event: IpcMainInvokeEvent, sessionId?: string) {
        if (sessionId) {
            const controller = this.abortControllers.get(sessionId);
            if (controller) {
                controller.abort();
                this.abortControllers.delete(sessionId);
            }
        } else {
            // Stop all active agents
            for (const [sid, controller] of this.abortControllers.entries()) {
                controller.abort();
            }
            this.abortControllers.clear();
        }
    }
}
