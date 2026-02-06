
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
        this.activeWebContents = event.sender;

        try {
            const { sessionId, prompt, options } = payload;

            // 1. Resolve Session
            let sid = sessionId;
            if (!sid) {
                const newSession = this.sessionManager.createSession();
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
                trustLevel: 'Ask' // Default or fetch from config if needed
            }));

            const runOptions: AgentRuntimeOptions = {
                signal: controller.signal,
                history: history,
                model: options?.model,
                skills: skillList
            };

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
                for (const msg of result.newMessages) {
                    await this.sessionManager.addMessage(sid, msg as any);
                }
            }

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
