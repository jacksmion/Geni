import { IIMAdapter, IMMessage } from './IIMAdapter';
import { AppSettings } from '../../../common/types/settings';
import { ToolRegistry } from '../tools/ToolRegistry';
import { SessionManager } from '../session';
import { ToolController } from '../../controllers/ToolController';
import { Agent } from '../../../common/types/agent';
import { AgentRuntime } from '../agent/runtime/AgentRuntime';
import { AgentRunRequest, AgentEvent } from '../agent/types';
import { TelegramAdapter } from './adapters/TelegramAdapter';
import { WeComAdapter } from './adapters/WeComAdapter';
import { LarkAdapter } from './adapters/LarkAdapter';
import { WechatAdapter } from './adapters/WechatAdapter';

export class IMServiceManager {
    private adapters: Map<string, IIMAdapter> = new Map();
    private settings: AppSettings;
    private toolRegistry: ToolRegistry;
    private sessionManager: SessionManager;
    private toolController: ToolController;
    private abortControllers = new Map<string, AbortController>();
    private runtime: AgentRuntime;

    constructor(
        settings: AppSettings,
        toolRegistry: ToolRegistry,
        sessionManager: SessionManager,
        toolController: ToolController,
        runtime: AgentRuntime
    ) {
        this.settings = settings;
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.toolController = toolController;
        this.runtime = runtime;

        // Register default adapters
        this.registerAdapter(new TelegramAdapter());
        this.registerAdapter(new WeComAdapter());
        this.registerAdapter(new LarkAdapter());
        this.registerAdapter(new WechatAdapter());
    }

    private registerAdapter(adapter: IIMAdapter) {
        this.adapters.set(adapter.providerId, adapter);
        adapter.onMessage(this.handleIncomingMessage.bind(this));
    }

    public async start() {
        // Start adapters based on current settings
        await this.syncAdaptersWithSettings();
    }

    public async stop() {
        console.log(`[IMServiceManager] Stopping IM Service Manager and all adapters...`);
        for (const [sessionId, controller] of this.abortControllers.entries()) {
            controller.abort();
        }
        this.abortControllers.clear();

        const stopPromises = Array.from(this.adapters.values()).map(a => a.stop());
        await Promise.all(stopPromises);
    }

    public async updateSettings(newSettings: AppSettings) {
        console.log(`[IMServiceManager] Updating settings. Telegram enabled: ${newSettings.telegram?.enabled}, hasToken: ${!!newSettings.telegram?.token}`);
        this.settings = newSettings;
        await this.syncAdaptersWithSettings();
    }

    private async syncAdaptersWithSettings() {
        // Telegram
        const telegramAdapter = this.adapters.get('telegram');
        if (telegramAdapter) {
            const config = this.settings.telegram;
            if (config?.enabled && config?.token) {
                console.log(`[IMServiceManager] Syncing Telegram adapter...`);
                await telegramAdapter.start(config).catch(e => console.error(`[IMServiceManager] Failed to start telegram adapter:`, e));
            } else {
                await telegramAdapter.stop().catch(e => console.error(`[IMServiceManager] Failed to stop telegram adapter:`, e));
            }
        } else {
            console.warn(`[IMServiceManager] Telegram adapter not found in registered adapters!`);
        }

        // WeCom
        const wecomAdapter = this.adapters.get('wecom');
        if (wecomAdapter) {
            const config = this.settings.wecom;
            if (config?.enabled && config?.botId && config?.secret) {
                console.log(`[IMServiceManager] Syncing WeCom adapter...`);
                await wecomAdapter.start(config).catch(e => console.error(`[IMServiceManager] Failed to start wecom adapter:`, e));
            } else {
                await wecomAdapter.stop().catch(e => console.error(`[IMServiceManager] Failed to stop wecom adapter:`, e));
            }
        } else {
            console.warn(`[IMServiceManager] WeCom adapter not found in registered adapters!`);
        }

        // Lark
        const larkAdapter = this.adapters.get('lark');
        if (larkAdapter) {
            const config = this.settings.lark;
            if (config?.enabled && config?.appId && config?.appSecret) {
                console.log(`[IMServiceManager] Syncing Lark adapter...`);
                await larkAdapter.start(config).catch(e => console.error(`[IMServiceManager] Failed to start lark adapter:`, e));
            } else {
                await larkAdapter.stop().catch(e => console.error(`[IMServiceManager] Failed to stop lark adapter:`, e));
            }
        } else {
            console.warn(`[IMServiceManager] Lark adapter not found in registered adapters!`);
        }

        // Wechat
        const wechatAdapter = this.adapters.get('wechat');
        if (wechatAdapter) {
            const config = this.settings.wechat;
            if (config?.enabled) {
                console.log(`[IMServiceManager] Syncing Wechat adapter...`);
                await wechatAdapter.start(config).catch(e => console.error(`[IMServiceManager] Failed to start wechat adapter:`, e));
            } else {
                await wechatAdapter.stop().catch(e => console.error(`[IMServiceManager] Failed to stop wechat adapter:`, e));
            }
        } else {
            console.warn(`[IMServiceManager] Wechat adapter not found in registered adapters!`);
        }
    }

    /**
     * Proactively push a message to a specific IM session
     * @param sessionId The targeted IM session ID (e.g. "tg_123456")
     * @param content Message content in Markdown
     */
    public async pushMessage(sessionId: string, content: string): Promise<void> {
        let providerId = sessionId.split('_')[0];

        // Simple mapping to handle shorthand prefixes
        if (providerId === 'tg') providerId = 'telegram';

        const adapter = this.adapters.get(providerId);
        if (!adapter) {
            console.warn(`[IMServiceManager] No adapter found for provider: ${providerId}`);
            return;
        }

        try {
            await adapter.sendOrUpdateMessage(sessionId, content, { isComplete: true, throttleMs: 0 });
        } catch (error) {
            console.error(`[IMServiceManager] Failed to push message to ${sessionId}:`, error);
        }
    }

    public async testConnection(providerId: string, config: any): Promise<{ success: boolean; message: string }> {
        const adapter = this.adapters.get(providerId);
        if (!adapter || !adapter.testConnection) {
            return { success: false, message: `Adapter ${providerId} not found or doesn't support testing` };
        }
        return await adapter.testConnection(config);
    }

    private async handleIncomingMessage(msg: IMMessage) {
        const adapter = this.adapters.get(msg.providerId);
        if (!adapter) return;

        console.log(`[IMServiceManager] Received message from ${msg.providerId} user ${msg.userId}`);

        // 1. Abort previous run if exists
        if (this.abortControllers.has(msg.sessionId)) {
            this.abortControllers.get(msg.sessionId)!.abort();
            this.abortControllers.delete(msg.sessionId);
            // 同步清理 adapter 内部状态，防止 trailing throttle 向 IM 写入旧数据
            adapter.clearSession?.(msg.sessionId);
        }

        const controller = new AbortController();
        this.abortControllers.set(msg.sessionId, controller);

        // 2. Build Agent
        const provider = this.settings.llm.activeProvider || 'OpenAI';
        const providerConfig = this.settings.llm.providers?.[provider];
        let model = providerConfig?.activeModelId || providerConfig?.model || 'gpt-4o';
        if (providerConfig?.models) {
            const activeInstance = providerConfig.models.find((m: any) => m.id === model);
            if (activeInstance) model = activeInstance.model;
        }
        const agent: Agent = {
            id: 'im-agent',
            name: 'Geni',
            modelId: `${provider}/${model}`,
            systemPrompt: this.settings.systemPrompt,
            temperature: providerConfig?.temperature
        };

        // 3. Prepare skill IDs
        const enabledSkillObjects = this.toolController.getEnabledSkillObjects();
        const skillIds = enabledSkillObjects.map(obj => obj.id);

        // 4. Build request with emit callback for IM streaming
        let outputBuffer = '';
        let isNewRound = false;

        const emit = (event: AgentEvent) => {
            switch (event.type) {
                case 'turn_start':
                    isNewRound = true;
                    break;
                case 'message_delta':
                case 'reasoning_delta':
                    if (isNewRound) {
                        outputBuffer = event.payload.delta;
                        isNewRound = false;
                    } else {
                        outputBuffer += event.payload.delta;
                    }
                    if (outputBuffer.trim().length > 0) {
                        adapter.sendOrUpdateMessage(msg.sessionId, outputBuffer, { throttleMs: 100, isComplete: false }).catch(e => console.error(e));
                    }
                    break;
                case 'tool_start':
                    if (adapter.sendChatAction) {
                        adapter.sendChatAction(msg.sessionId, 'typing').catch(() => {});
                    }
                    break;
                case 'auth_request':
                    // IM auth: auto-approve after adapter prompts user
                    adapter.requestAuthorization(
                        msg.sessionId,
                        {
                            requestId: event.payload.requestId,
                            toolName: event.payload.toolName,
                            args: event.payload.args,
                            definition: { name: event.payload.toolName, description: '', input_schema: { type: 'object', properties: {} } },
                            tool: null as any,
                        },
                        {
                            allowed: true,
                            reason: event.payload.reason,
                            requiresUserConfirmation: true,
                            trustLevel: 'High' as any
                        }
                    ).then(ctx => {
                        this.runtime.resolveAuth(event.payload.requestId, ctx.approved);
                    }).catch(() => {
                        this.runtime.resolveAuth(event.payload.requestId, false);
                    });
                    break;
            }
        };

        const request: AgentRunRequest = {
            sessionId: msg.sessionId,
            prompt: msg.content,
            signal: controller.signal,
            emit,
            skillIds: skillIds.length > 0 ? skillIds : undefined
        };

        try {
            // Use native typing status if supported, otherwise fallback to friendly text
            if (adapter.sendChatAction) {
                await adapter.sendChatAction(msg.sessionId, 'typing');
            } else {
                await adapter.sendOrUpdateMessage(msg.sessionId, '正在处理请求...', { throttleMs: 0, isComplete: false });
            }

            const result = await this.runtime.run(agent, request);

            // Ensure final output is sent immediately without throttle
            if (result.finalAnswer) {
                await adapter.sendOrUpdateMessage(msg.sessionId, result.finalAnswer, { throttleMs: 0, isComplete: true });
            }
        } catch (error: any) {
            console.error(`[IMServiceManager] Agent execution failed for session ${msg.sessionId}:`, error);
            await adapter.sendOrUpdateMessage(msg.sessionId, `[系统错误]: ${error.message}`, { throttleMs: 0, isComplete: true }).catch(e => console.error(e));
        } finally {
            this.abortControllers.delete(msg.sessionId);
        }
    }
}
