import { IIMAdapter, IMMessage } from './IIMAdapter';
import { AppSettings } from '../../../common/types/settings';
import { ToolRegistry } from '../tools/ToolRegistry';
import { SessionManager } from '../session';
import { ToolController } from '../../controllers/ToolController';
import { AgentRuntime, AgentRuntimeOptions } from '../agent';
import { Skill } from '../../../common/types/skill';
import { TelegramAdapter } from './adapters/TelegramAdapter';
import { WeComAdapter } from './adapters/WeComAdapter';
import { LarkAdapter } from './adapters/LarkAdapter';
import { WechatAdapter } from './adapters/WechatAdapter';
import { MemoryStore } from '../memory/MemoryStore';
import { UsageManager } from '../usage/UsageManager';

export class IMServiceManager {
    private adapters: Map<string, IIMAdapter> = new Map();
    private settings: AppSettings;
    private toolRegistry: ToolRegistry;
    private sessionManager: SessionManager;
    private toolController: ToolController;
    private abortControllers = new Map<string, AbortController>();
    private memoryStore: MemoryStore;

    constructor(
        settings: AppSettings,
        toolRegistry: ToolRegistry,
        sessionManager: SessionManager,
        toolController: ToolController,
        memoryStore: MemoryStore,
        private usageManager: UsageManager
    ) {
        this.settings = settings;
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.toolController = toolController;
        this.memoryStore = memoryStore;

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

        // 2. Prepare Context from Session
        const history = await this.sessionManager.getHistory(msg.sessionId);

        // 3. Prepare Runtime Options
        const enabledSkillObjects = this.toolController.getEnabledSkillObjects();
        const skillList: Skill[] = enabledSkillObjects.map(obj => ({
            id: obj.id,
            name: obj.name,
            description: obj.description,
            content: obj.instruction,
            path: obj.path || '',
            enabled: true,
            trustLevel: 'Auto'
        }));

        const runOptions: AgentRuntimeOptions = {
            signal: controller.signal,
            history: history,
            model: this.settings.llm.providers[this.settings.llm.activeProvider]?.model,
            skills: skillList,
            onAuthorizationRequired: async (request, decision) => {
                return await adapter.requestAuthorization(msg.sessionId, request, decision);
            }
        };

        // 4. Create stateless AgentRuntime for this execution
        const sessionRuntime = new AgentRuntime(this.settings, this.toolRegistry, this.memoryStore, this.usageManager);

        try {
            // Use native typing status if supported, otherwise fallback to friendly text
            if (adapter.sendChatAction) {
                await adapter.sendChatAction(msg.sessionId, 'typing');
            } else {
                await adapter.sendOrUpdateMessage(msg.sessionId, '正在处理请求...', { throttleMs: 0, isComplete: false });
            }

            let outputBuffer = '';
            let isNewRound = false; // 新一轮思考标志，避免 trailing throttle 发送空内容
            const result = await sessionRuntime.run(
                msg.content,
                this.toolRegistry.getTools(),
                runOptions,
                (chunk, reset) => {
                    if (reset) {
                        // 标记新轮次开始，不清空 buffer（防止 trailing throttle 用空内容覆盖已显示的消息）
                        isNewRound = true;
                        return;
                    }
                    if (isNewRound) {
                        // 新轮次第一个 chunk 到来时替换旧内容
                        outputBuffer = chunk;
                        isNewRound = false;
                    } else {
                        outputBuffer += chunk;
                    }
                    if (outputBuffer.trim().length > 0) {
                        adapter.sendOrUpdateMessage(msg.sessionId, outputBuffer, { throttleMs: 100, isComplete: false }).catch(e => console.error(e));
                    }
                },
                (steps) => {
                    // Update typing status periodically for long tasks
                    if (adapter.sendChatAction) {
                        adapter.sendChatAction(msg.sessionId, 'typing').catch(() => {});
                    }
                }
            );

            // Ensure final output is sent immediately without throttle
            if (result.finalAnswer) {
                await adapter.sendOrUpdateMessage(msg.sessionId, result.finalAnswer, { throttleMs: 0, isComplete: true });
            }

            // 5. Update Session History
            if (result.newMessages) {
                for (const updatedMsg of result.newMessages) {
                    await this.sessionManager.addMessage(msg.sessionId, updatedMsg as any);
                }
            }
        } catch (error: any) {
            console.error(`[IMServiceManager] Agent execution failed for session ${msg.sessionId}:`, error);
            await adapter.sendOrUpdateMessage(msg.sessionId, `[系统错误]: ${error.message}`, { throttleMs: 0, isComplete: true }).catch(e => console.error(e));
        } finally {
            this.abortControllers.delete(msg.sessionId);
        }
    }
}
