
import { ipcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { AGENT_CHANNELS, AGENT_EVENTS } from '../../common/ipc/channels';
import { AgentStartRequest, AgentStartResponse } from '../../common/types/agentEvents';
import { DefaultAgentRuntime } from '../services/agent/runtime/DefaultAgentRuntime';
import { AgentRunRequest, AgentEvent as InternalAgentEvent } from '../services/agent/types';
import { SessionManager } from '../services/session';
import { AppSettings } from '../../common/types/settings';
import { StaffManager } from '../services/staff/StaffManager';
import { Agent } from '../../common/types/agent';
import { AgentStep } from '../../common/types/chat';

/**
 * AgentController — IPC 薄壳层
 *
 * Phase 5: 纯协议转换，不含业务逻辑。
 * 职责：接收 IPC 请求 → 构建 Agent/Request → 调用 Runtime → 转发事件到 UI
 * 授权路径：auth_request 经 emit 转发到 UI，用户响应通过 IPC 回到 Controller，
 * Controller 通过 runtime.resolveAuth() 通知 Runtime 内部的 pending resolver。
 */
export class AgentController {
    private activeWebContents: WebContents | null = null;
    private abortControllers = new Map<string, AbortController>();
    private settings: AppSettings;
    private staffManager: StaffManager;
    private sessionManager: SessionManager;

    // Throttling (stream only)
    private streamBuffer: string = '';
    private throttleTimer: NodeJS.Timeout | null = null;
    private throttleRef: number = 0;
    private readonly THROTTLE_MS = 120;

    // Active steps accumulator (per session)
    private activeSteps: AgentStep[] = [];
    private activeRunId: string | null = null;

    constructor(
        private runtime: DefaultAgentRuntime,
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
        this.runtime.updateSettings(settings);
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

    private buildEmitFn(runId: string): (event: InternalAgentEvent) => void {
        return (event: InternalAgentEvent) => {
            switch (event.type) {
                case 'turn_start':
                    if (event.payload.resetStream) {
                        this.flushThrottledEvents();
                        this.broadcast(AGENT_EVENTS.STREAM, { content: '', isReset: true });
                    }
                    // Derive state_change
                    this.broadcast(AGENT_EVENTS.STATE_CHANGE, {
                        previousState: 'Idle',
                        currentState: 'Thinking',
                        message: `Turn ${event.payload.turnIndex}`,
                        timestamp: Date.now()
                    });
                    break;
                case 'message_delta':
                case 'reasoning_delta':
                    this.streamBuffer += event.payload.delta;
                    break;
                case 'tool_start':
                    this.activeSteps.push(event.payload);
                    this.broadcast(AGENT_EVENTS.STEP_UPDATE, { steps: [...this.activeSteps] });
                    this.broadcast(AGENT_EVENTS.STATE_CHANGE, {
                        previousState: 'Thinking',
                        currentState: 'ExecutingTool',
                        message: `Executing: ${event.payload.tool}`,
                        metadata: { tool: event.payload.tool },
                        timestamp: Date.now()
                    });
                    break;
                case 'tool_end': {
                    // Replace matching incomplete step
                    const idx = this.activeSteps.findIndex(
                        s => s.tool === event.payload.tool && !s.isComplete
                    );
                    if (idx >= 0) {
                        this.activeSteps[idx] = event.payload;
                    } else {
                        this.activeSteps.push(event.payload);
                    }
                    this.broadcast(AGENT_EVENTS.STEP_UPDATE, { steps: [...this.activeSteps] });
                    break;
                }
                case 'auth_request': {
                    // Add auth step to activeSteps so ThoughtTrace shows inline auth UI
                    const { requestId, toolName, args, reason } = event.payload;
                    const authStep: AgentStep = {
                        tool: toolName,
                        toolInput: JSON.stringify(args),
                        isComplete: false,
                        isWaitingAuthorization: true,
                        authRequestId: requestId,
                        authReason: reason
                    };
                    this.activeSteps.push(authStep);
                    this.broadcast(AGENT_EVENTS.STEP_UPDATE, { steps: [...this.activeSteps] });
                    this.broadcast(AGENT_EVENTS.AUTHORIZATION_REQUEST, {
                        ...event.payload,
                        runId
                    });
                    break;
                }
                case 'agent_end':
                    this.flushThrottledEvents();
                    this.broadcast(AGENT_EVENTS.STATE_CHANGE, {
                        previousState: 'Thinking',
                        currentState: 'Idle',
                        message: 'Done',
                        timestamp: Date.now()
                    });
                    break;
                case 'error':
                    this.broadcast(AGENT_EVENTS.ERROR, event.payload);
                    break;
                case 'turn_end':
                    // No special handling needed
                    break;
            }
        };
    }

    // ========== Handlers ==========

    private async handleStart(event: IpcMainInvokeEvent, payload: AgentStartRequest): Promise<AgentStartResponse> {
        this.activeWebContents = event.sender;

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

            // 3. Reset step accumulator
            this.activeSteps = [];
            const runId = crypto.randomUUID();
            this.activeRunId = runId;

            // 4. Build Agent from payload
            const agent = this.resolveAgent(payload);

            // 5. Build request — emit forwards events from Runtime to Controller's IPC layer
            const request: AgentRunRequest = {
                sessionId: sid,
                prompt,
                signal: controller.signal,
                emit: this.buildEmitFn(runId),
                skillIds: options?.skills
            };

            // 6. Run with throttling
            this.startThrottling();
            await this.runtime.run(agent, request);
            this.stopThrottling();

            // 7. Cleanup
            this.abortControllers.delete(sid);
            this.activeRunId = null;

            return { success: true, sessionId: sid };

        } catch (error: any) {
            console.error('[AgentController] Agent execution failed:', error);
            this.stopThrottling();
            this.broadcast(AGENT_EVENTS.ERROR, { message: error.message });
            return { success: false, error: error.message };
        }
    }

    private handleStop(_event: IpcMainInvokeEvent, sessionId?: string) {
        if (sessionId) {
            const controller = this.abortControllers.get(sessionId);
            if (controller) {
                controller.abort();
                this.abortControllers.delete(sessionId);
            }
        } else {
            for (const [, controller] of this.abortControllers.entries()) {
                controller.abort();
            }
            this.abortControllers.clear();
        }
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

        // Staff profile overrides base agent config
        const staffId = payload.options?.staffId;
        if (staffId) {
            const profile = this.staffManager.get(staffId);
            if (profile) return profile; // StaffProfile extends Agent
        }

        // Model override from payload
        if (payload.options?.model) {
            base.modelId = payload.options.model.includes('/')
                ? payload.options.model
                : `${this.settings.llm.activeProvider || 'OpenAI'}/${payload.options.model}`;
        }

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

    // ========== Throttling ==========

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
        this.flushThrottledEvents();
    }

    private flushThrottledEvents() {
        if (!this.activeWebContents || this.activeWebContents.isDestroyed()) return;
        if (this.streamBuffer) {
            this.activeWebContents.send(AGENT_EVENTS.STREAM, { content: this.streamBuffer, isReset: false });
            this.streamBuffer = '';
        }
    }

    private broadcast(channel: string, payload: any) {
        if (this.activeWebContents && !this.activeWebContents.isDestroyed()) {
            this.activeWebContents.send(channel, payload);
        }
    }
}
