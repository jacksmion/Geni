
import { ipcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { AGENT_CHANNELS, AGENT_EVENTS } from '../../common/ipc/channels';
import { AgentStartRequest, AgentStartResponse } from '../../common/types/agentEvents';
import { AgentRuntime } from '../services/agent/runtime/AgentRuntime';
import { AgentRunRequest, AgentEvent as InternalAgentEvent } from '../services/agent/types';
import { SessionManager } from '../services/session';
import { AppSettings } from '../../common/types/settings';
import { StaffManager } from '../services/staff/StaffManager';
import { Agent } from '../../common/types/agent';
import { AgentStep } from '../../common/types/chat';

/**
 * Per-session state — one entry per active agent run.
 */
interface SessionState {
    streamBuffer: string;
    reasoningBuffer: string;
    throttleTimer: NodeJS.Timeout | null;
    activeSteps: AgentStep[];
    runId: string;
}

/**
 * AgentController — IPC thin shell (per-session, fire-and-forget)
 *
 * Supports multiple concurrent agent sessions. Each session has fully
 * isolated throttling buffers, step accumulators, and WebContents sender.
 *
 * `handleStart` returns immediately with a `runId`; the actual agent
 * execution happens in the background via `runAgent()`.
 */
export class AgentController {
    private abortControllers = new Map<string, AbortController>();
    private sessionStates = new Map<string, SessionState>();
    private sessionSenders = new Map<string, WebContents>();
    private settings: AppSettings;
    private staffManager: StaffManager;
    private sessionManager: SessionManager;

    private readonly THROTTLE_MS = 16;

    constructor(
        private runtime: AgentRuntime,
        settings: AppSettings,
        staffManager: StaffManager,
        sessionManager: SessionManager
    ) {
        this.settings = settings;
        this.staffManager = staffManager;
        this.sessionManager = sessionManager;
    }

    public updateSettings(settings: AppSettings) {
        this.settings = settings;
    }

    /**
     * Bind IPC handlers
     */
    public registerHandlers(): void {
        ipcMain.handle(AGENT_CHANNELS.START, this.handleStart.bind(this));
        ipcMain.handle(AGENT_CHANNELS.STOP, this.handleStop.bind(this));

        // Auth response: bridge from IPC → Runtime's pending auth resolver
        ipcMain.on(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, (_e, res) => {
            if (res?.requestId) {
                this.runtime.resolveAuth(res.requestId, res.approved);
            }
        });
    }

    // ========== Event Dispatch ==========

    private buildEmitFn(
        sessionId: string,
        sender: WebContents
    ): (event: InternalAgentEvent) => void {
        return (event: InternalAgentEvent) => {
            const state = this.sessionStates.get(sessionId);
            if (!state) return; // session already cleaned up

            switch (event.type) {
                case 'turn_start':
                    if (event.payload.resetStream) {
                        this.flushThrottledEvents(sessionId);
                        state.reasoningBuffer = '';
                        this.sendToSender(sender, AGENT_EVENTS.STREAM, { content: '', isReset: true, sessionId });
                        this.sendToSender(sender, AGENT_EVENTS.REASONING_STREAM, { content: '', isReset: true, sessionId });
                    }
                    break;
                case 'message_delta':
                    state.streamBuffer += event.payload.delta;
                    break;
                case 'reasoning_delta':
                    state.reasoningBuffer += event.payload.delta;
                    break;
                case 'tool_start':
                    state.activeSteps.push(event.payload);
                    this.sendToSender(sender, AGENT_EVENTS.STEP_UPDATE, { steps: [...state.activeSteps], sessionId });
                    break;
                case 'tool_end': {
                    const idx = state.activeSteps.findIndex(
                        s => s.tool === event.payload.tool && !s.isComplete
                    );
                    if (idx >= 0) {
                        state.activeSteps[idx] = event.payload;
                    } else {
                        state.activeSteps.push(event.payload);
                    }
                    this.sendToSender(sender, AGENT_EVENTS.STEP_UPDATE, { steps: [...state.activeSteps], sessionId });
                    break;
                }
                case 'auth_request': {
                    const { requestId, toolName, args, reason } = event.payload;
                    const authStep: AgentStep = {
                        tool: toolName,
                        toolInput: JSON.stringify(args),
                        isComplete: false,
                        isWaitingAuthorization: true,
                        authRequestId: requestId,
                        authReason: reason
                    };
                    state.activeSteps.push(authStep);
                    this.sendToSender(sender, AGENT_EVENTS.STEP_UPDATE, { steps: [...state.activeSteps], sessionId });
                    this.sendToSender(sender, AGENT_EVENTS.AUTHORIZATION_REQUEST, {
                        ...event.payload,
                        runId: state.runId,
                        sessionId
                    });
                    break;
                }
                case 'agent_end':
                    this.flushThrottledEvents(sessionId);
                    break;
                case 'error':
                    this.sendToSender(sender, AGENT_EVENTS.ERROR, { ...event.payload, sessionId });
                    break;
                case 'turn_end':
                    // No special handling needed
                    break;
                case 'state_change':
                    this.sendToSender(sender, AGENT_EVENTS.STATE_CHANGE, { ...event.payload, sessionId });
                    break;
            }
        };
    }

    // ========== Handlers ==========

    private async handleStart(event: IpcMainInvokeEvent, payload: AgentStartRequest): Promise<AgentStartResponse> {
        const sender = event.sender;

        try {
            const { sessionId, prompt, options } = payload;

            // 1. Resolve or create session
            let sid = sessionId;
            if (!sid) {
                const newSession = await this.sessionManager.createSession();
                sid = newSession.id;
            }

            // 2. Setup AbortController
            const controller = new AbortController();
            this.abortControllers.set(sid, controller);

            // 3. Initialize per-session state
            const runId = crypto.randomUUID();
            this.sessionStates.set(sid, {
                streamBuffer: '',
                reasoningBuffer: '',
                throttleTimer: null,
                activeSteps: [],
                runId
            });

            // 4. Store sender for this session
            this.sessionSenders.set(sid, sender);

            // 5. Build Agent from payload
            const agent = this.resolveAgent(payload);

            // 6. Build request
            const request: AgentRunRequest = {
                sessionId: sid,
                prompt,
                signal: controller.signal,
                emit: this.buildEmitFn(sid, sender),
                skillIds: options?.skills,
                workspacePath: options?.workspacePath || this.settings.workspacePath,
                language: this.settings.language
            };

            // 7. Fire-and-forget — return immediately, agent runs in background
            this.runAgent(sid, agent, request);

            return { success: true, sessionId: sid, runId };

        } catch (error: any) {
            console.error('[AgentController] Agent start failed:', error);
            this.sendToSender(sender, AGENT_EVENTS.ERROR, { message: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Background agent execution. Handles errors, cleanup, and
     * sends a state_change to Idle on completion.
     */
    private async runAgent(
        sessionId: string,
        agent: Agent,
        request: AgentRunRequest
    ): Promise<void> {
        const sender = this.sessionSenders.get(sessionId);
        try {
            this.startThrottling(sessionId);
            await this.runtime.run(agent, request);
        } catch (error: any) {
            // AbortError is expected when user cancels — don't log as error
            if (error.name !== 'AbortError') {
                console.error('[AgentController] Agent execution failed:', error);
                if (sender && !sender.isDestroyed()) {
                    this.sendToSender(sender, AGENT_EVENTS.ERROR, { message: error.message, sessionId });
                }
            }
        } finally {
            this.stopThrottling(sessionId);

            // Notify UI that this session has returned to Idle
            if (sender && !sender.isDestroyed()) {
                this.sendToSender(sender, AGENT_EVENTS.STATE_CHANGE, {
                    previousState: 'Thinking',
                    currentState: 'Idle',
                    timestamp: Date.now(),
                    sessionId
                });
            }

            this.cleanupSessionState(sessionId);
        }
    }

    private handleStop(_event: IpcMainInvokeEvent, sessionId?: string) {
        if (sessionId) {
            const controller = this.abortControllers.get(sessionId);
            if (controller) {
                controller.abort();
            }
            this.cleanupSessionState(sessionId);
        } else {
            // Stop all sessions
            for (const [, controller] of this.abortControllers.entries()) {
                controller.abort();
            }
            for (const sid of this.sessionStates.keys()) {
                this.cleanupSessionState(sid);
            }
        }
    }

    /**
     * Clean up all per-session maps for a given sessionId.
     */
    private cleanupSessionState(sessionId: string): void {
        const state = this.sessionStates.get(sessionId);
        if (state?.throttleTimer) {
            clearInterval(state.throttleTimer);
        }
        this.sessionStates.delete(sessionId);
        this.abortControllers.delete(sessionId);
        this.sessionSenders.delete(sessionId);
    }

    // ========== Agent Resolution ==========

    private resolveAgent(payload: AgentStartRequest): Agent {
        const provider = this.settings.llm.activeProvider || 'OpenAI';
        const providerConfig = this.settings.llm.providers?.[provider];
        const base: Agent = {
            id: 'default',
            name: 'Geni',
            modelId: this.buildModelId(),
            systemPrompt: this.settings.systemPrompt,
            temperature: providerConfig?.temperature
        };

        // Resolve effective modelId: user selection > staff profile > global default
        let effectiveModelId = base.modelId;

        // Staff profile overrides base agent config
        const staffId = payload.options?.staffId;
        if (staffId) {
            const profile = this.staffManager.get(staffId);
            if (profile) {
                // Merge: staff fields override base, but fall back to global defaults
                Object.assign(base, {
                    ...profile,
                    modelId: profile.modelId || base.modelId,
                    systemPrompt: profile.systemPrompt || base.systemPrompt,
                });
                effectiveModelId = profile.modelId || base.modelId;
            }
        }

        // User's session-level model selection has highest priority
        if (payload.options?.model) {
            effectiveModelId = payload.options.model.includes('/')
                ? payload.options.model
                : `${this.settings.llm.activeProvider || 'OpenAI'}/${payload.options.model}`;
        }

        base.modelId = effectiveModelId;
        return base;
    }

    private buildModelId(): string {
        const provider = this.settings.llm.activeProvider || 'OpenAI';
        const providers = this.settings.llm.providers || {};
        const config = providers[provider];

        let model = config?.activeModelId || config?.model || 'gpt-4o';
        // If model is an ID reference (not a real model name), resolve it
        if (config?.models) {
            const activeInstance = config.models.find((m: any) => m.id === model);
            if (activeInstance) model = activeInstance.model;
        }

        return `${provider}/${model}`;
    }

    // ========== Per-Session Throttling ==========

    private startThrottling(sessionId: string): void {
        const state = this.sessionStates.get(sessionId);
        if (!state) return;
        if (state.throttleTimer) return; // already running

        state.throttleTimer = setInterval(
            () => this.flushThrottledEvents(sessionId),
            this.THROTTLE_MS
        );
    }

    private stopThrottling(sessionId: string): void {
        const state = this.sessionStates.get(sessionId);
        if (!state) return;

        if (state.throttleTimer) {
            clearInterval(state.throttleTimer);
            state.throttleTimer = null;
        }
        this.flushThrottledEvents(sessionId);
    }

    private flushThrottledEvents(sessionId: string): void {
        const state = this.sessionStates.get(sessionId);
        const sender = this.sessionSenders.get(sessionId);
        if (!state || !sender || sender.isDestroyed()) return;

        if (state.streamBuffer) {
            sender.send(AGENT_EVENTS.STREAM, { content: state.streamBuffer, isReset: false, sessionId });
            state.streamBuffer = '';
        }
        if (state.reasoningBuffer) {
            sender.send(AGENT_EVENTS.REASONING_STREAM, { content: state.reasoningBuffer, isReset: false, sessionId });
            state.reasoningBuffer = '';
        }
    }

    // ========== Send Helper ==========

    /**
     * Send a payload to a specific WebContents sender.
     * Replaces the old single-instance `broadcast` method.
     */
    private sendToSender(sender: WebContents, channel: string, payload: any): void {
        if (!sender.isDestroyed()) {
            sender.send(channel, payload);
        }
    }
}
