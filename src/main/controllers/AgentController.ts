
import { ipcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { AgentRuntime, AgentRuntimeOptions, AgentStateEvent } from '../services/agent';
import { SessionManager } from '../services/session';
import { AGENT_CHANNELS, AGENT_EVENTS } from '../../common/ipc/channels';
import { AgentStartRequest, AgentStartResponse } from '../../common/types/agentEvents';

import { ToolRegistry } from '../services/tools/ToolRegistry';
import { AppSettings } from '../../common/types/settings';
import { ToolController } from './ToolController';
import { Skill } from '../../common/types/skill';

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
    private activeWebContents: WebContents | null = null;
    private currentSessionId: string | null = null;
    private abortControllers = new Map<string, AbortController>();

    constructor(
        settings: AppSettings,
        toolRegistry: ToolRegistry,
        sessionManager: SessionManager,
        toolController: ToolController
    ) {
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.toolController = toolController;
        this.agentRuntime = new AgentRuntime(settings, toolRegistry);

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

                // Broadcast request to renderer (could be used for notifications)
                this.broadcast(AGENT_EVENTS.AUTHORIZATION_REQUEST, {
                    requestId,
                    toolName: request.toolName,
                    args: request.args,
                    trustLevel: decision.trustLevel,
                    reason: decision.reason
                });

                // Listen for response
                const handler = (_event: any, response: any) => {
                    if (response && response.requestId === requestId) {
                        console.log(`[AgentController] Authorization response received: ${response.approved}`);
                        ipcMain.removeListener(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, handler);
                        resolve({
                            approved: response.approved,
                            rememberDecision: response.remember
                        });
                    }
                };

                ipcMain.on(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, handler);

                // Optional: Add a timeout to avoid hanging forever
                setTimeout(() => {
                    ipcMain.removeListener(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, handler);
                    resolve({ approved: false, message: 'Authorization timed out' });
                }, 10 * 60 * 1000); // 10 minutes timeout
            });
        });
    }

    private broadcast(channel: string, payload: any) {
        if (this.activeWebContents && !this.activeWebContents.isDestroyed()) {
            this.activeWebContents.send(channel, payload);
        }
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
            const enabledSkillObjects = this.toolController.getEnabledSkillObjects();
            const skillList: Skill[] = enabledSkillObjects.map(obj => ({
                id: obj.id,
                name: obj.name,
                description: obj.description,
                content: obj.instruction,
                path: obj.path || '',
                enabled: true, // Known because coming from getEnabledSkillObjects
                trustLevel: 'Auto' // Skills are prompt-instructions, inherently safe to load
            }));

            const runOptions: AgentRuntimeOptions = {
                signal: controller.signal,
                history: history,
                model: options?.model,
                skills: skillList
            };

            const prepTime = performance.now() - pipelineStartTime;
            console.log(`[AgentPerf] Pipeline Preparation (Session & Config Load): ${prepTime.toFixed(2)}ms`);

            // 5. Run Agent
            const result = await this.agentRuntime.run(
                prompt,
                this.toolRegistry.getTools(),
                runOptions,
                (chunk, reset) => {
                    this.broadcast(AGENT_EVENTS.STREAM, { content: chunk, isReset: reset });
                },
                (steps) => {
                    this.broadcast(AGENT_EVENTS.STEP_UPDATE, { steps });
                }
            );

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
