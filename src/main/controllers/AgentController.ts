
import { ipcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { AgentRuntime, AgentRuntimeOptions, AgentStateEvent } from '../services/agent';
import { SessionManager } from '../services/session';
import { AGENT_CHANNELS, AGENT_EVENTS } from '../../common/ipc/channels';
import { AgentStartRequest, AgentStartResponse } from '../../common/types/agentEvents';

import { ToolRegistry } from '../services/tools/ToolRegistry';
import { AppSettings } from '../../common/types/settings';

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
    private activeWebContents: WebContents | null = null;
    private currentSessionId: string | null = null;

    constructor(
        settings: AppSettings,
        toolRegistry: ToolRegistry,
        sessionManager: SessionManager
    ) {
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.agentRuntime = new AgentRuntime(settings, toolRegistry);

        this.setupResultListeners();
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
            const history = this.sessionManager.getHistory(sid);

            // 3. Prepare Runtime Options
            const runOptions: AgentRuntimeOptions = {
                signal: undefined, // TODO: Manage AbortController for cancellation
                history: history,
                model: options?.model,
                skills: options?.skills ? [] : undefined // TODO: Load actual Skill objects if IDs provided
            };

            // 4. Run Agent (Non-blocking usually, but run() is async and returns final result)
            // We want to run it "background" effectively but await it to return success/fail?
            // Actually, usually we await execution so the 'Start' call returns when done?
            // Or we treat 'Start' as 'Kickoff' and it returns immediately?
            // Given IAgentService.run returns a Promise<Result>, we likely want to await it 
            // OR we fire-and-forget and let events drive the UI.
            // Let's await it to capture immediate errors, but streams handle progress.

            // Note: We need to set up stream handlers per run

            const result = await this.agentRuntime.run(
                prompt,
                this.toolRegistry.getTools(), // Access tools
                runOptions,
                (chunk, reset) => {
                    this.broadcast(AGENT_EVENTS.STREAM, { content: chunk, isReset: reset });
                },
                (steps) => {
                    this.broadcast(AGENT_EVENTS.STEP_UPDATE, { steps });
                }
            );

            // 5. Update Session History with new interactions
            // The agent currently returns finalAnswer and steps.
            // Use the updated messages from the context.
            // Wait, AgentRuntime 'run' doesn't return the *full new* history easily.
            // We need to capture the *new* messages (User + Assistant + Tools).
            // For now, let's just append the user prompt and the final answer.
            // Ideally AgentRuntime should return the 'messages' array or we capture them via events.

            this.sessionManager.addMessage(sid, { role: 'user', content: prompt });
            this.sessionManager.addMessage(sid, { role: 'assistant', content: result.finalAnswer });

            return { success: true };

        } catch (error: any) {
            console.error('Agent execution failed:', error);
            this.broadcast(AGENT_EVENTS.ERROR, { message: error.message });
            return { success: false, error: error.message };
        }
    }

    private handleStop() {
        // Implement AbortController logic here
        // TODO: Map sessionId to AbortController
    }
}
