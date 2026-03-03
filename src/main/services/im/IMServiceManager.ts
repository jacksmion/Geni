import { IIMAdapter, IMMessage } from './IIMAdapter';
import { AppSettings } from '../../../common/types/settings';
import { ToolRegistry } from '../tools/ToolRegistry';
import { SessionManager } from '../session';
import { ToolController } from '../../controllers/ToolController';
import { AgentRuntime, AgentRuntimeOptions } from '../agent';
import { Skill } from '../../../common/types/skill';
import { TelegramAdapter } from './adapters/TelegramAdapter';

export class IMServiceManager {
    private adapters: Map<string, IIMAdapter> = new Map();
    private settings: AppSettings;
    private toolRegistry: ToolRegistry;
    private sessionManager: SessionManager;
    private toolController: ToolController;
    private abortControllers = new Map<string, AbortController>();

    constructor(
        settings: AppSettings,
        toolRegistry: ToolRegistry,
        sessionManager: SessionManager,
        toolController: ToolController
    ) {
        this.settings = settings;
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.toolController = toolController;

        // Register default adapters
        this.registerAdapter(new TelegramAdapter());
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
    }

    private async handleIncomingMessage(msg: IMMessage) {
        const adapter = this.adapters.get(msg.providerId);
        if (!adapter) return;

        console.log(`[IMServiceManager] Received message from ${msg.providerId} user ${msg.userId}`);

        // 1. Abort previous run if exists
        if (this.abortControllers.has(msg.sessionId)) {
            this.abortControllers.get(msg.sessionId)!.abort();
            this.abortControllers.delete(msg.sessionId);
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
        const sessionRuntime = new AgentRuntime(this.settings, this.toolRegistry);

        try {
            await adapter.sendOrUpdateMessage(msg.sessionId, '[System: Processing request...]', { throttleMs: 0 });

            let outputBuffer = '';

            const result = await sessionRuntime.run(
                msg.content,
                this.toolRegistry.getTools(),
                runOptions,
                (chunk, reset) => {
                    if (reset) {
                        outputBuffer = chunk;
                    } else {
                        outputBuffer += chunk;
                    }
                    if (outputBuffer.trim().length > 0) {
                        adapter.sendOrUpdateMessage(msg.sessionId, outputBuffer, { throttleMs: 1500 }).catch(e => console.error(e));
                    }
                },
                (steps) => {
                    // Could format steps to IM if needed, omit to keep simple
                }
            );

            // Ensure final output is sent immediately without throttle
            if (result.finalAnswer) {
                await adapter.sendOrUpdateMessage(msg.sessionId, result.finalAnswer, { throttleMs: 0 });
            }

            // 5. Update Session History
            if (result.newMessages) {
                for (const updatedMsg of result.newMessages) {
                    await this.sessionManager.addMessage(msg.sessionId, updatedMsg as any);
                }
            }
        } catch (error: any) {
            console.error(`[IMServiceManager] Agent execution failed for session ${msg.sessionId}:`, error);
            await adapter.sendOrUpdateMessage(msg.sessionId, `[System Error]: ${error.message}`, { throttleMs: 0 }).catch(e => console.error(e));
        } finally {
            this.abortControllers.delete(msg.sessionId);
        }
    }
}
