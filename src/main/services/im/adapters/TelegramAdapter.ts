import { Bot, Context, InlineKeyboard } from 'grammy';
import { run, RunnerHandle } from '@grammyjs/runner';
import { ProxyAgent } from 'undici';
import { IIMAdapter, IMMessage, SendOptions } from '../IIMAdapter';
import { UserApprovalContext, ToolExecutionRequest, AuthorizationDecision } from '../../agent/ToolGuard';
import { TelegramConfig } from '../../../../common/types/settings';
import throttle from 'lodash/throttle';

interface ThrottleContext {
    buffer: string;
    messageId?: number;
    lastSentBuffer: string;
}

export class TelegramAdapter implements IIMAdapter {
    readonly providerId = 'telegram';

    private bot: Bot | null = null;
    private runner: RunnerHandle | null = null;
    private messageHandler?: (msg: IMMessage) => Promise<void>;

    // Map sessionId -> ThrottleContext
    private sessionMap: Map<string, ThrottleContext> = new Map();
    // Use a local throttled function map per session
    private throttleFns: Map<string, any> = new Map();

    // Auth waiting state: authRequestId -> resolve callback
    private pendingAuthPromises: Map<string, (res: UserApprovalContext) => void> = new Map();

    public async start(config: TelegramConfig): Promise<void> {
        await this.stop();

        if (!config.enabled || !config.token) {
            return;
        }

        const actualProxyUrl = config.proxyUrl || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
        console.log(`[TelegramAdapter] Initializing bot with proxy: ${actualProxyUrl || 'None'}`);

        try {
            if (actualProxyUrl) {
                // Grammy uses standard fetch API. 
                // Native fetch in Node uses dispatcher, not agent.
                this.bot = new Bot(config.token, {
                    client: {
                        baseFetchConfig: {
                            // @ts-ignore: custom dispatcher for underlying native fetch / undici
                            dispatcher: new ProxyAgent({ uri: actualProxyUrl }),
                            compress: true,
                        }
                    }
                });
            } else {
                this.bot = new Bot(config.token);
            }

            // Test the bot token by calling getMe
            const me = await this.bot.api.getMe();
            console.log(`[TelegramAdapter] Successfully connected! Bot username: @${me.username}`);
        } catch (e: any) {
            console.error(`[TelegramAdapter] Failed to initialize bot or test connection. Error details:`, e.message);
            // We DO NOT return here, sometimes getMe fails momentarily. We can still try starting the runner.
        }

        if (!this.bot) {
            console.error('[TelegramAdapter] Bot instance creation failed.');
            return;
        }

        // Command handler
        this.bot.command('start', async (ctx) => {
            await ctx.reply('Geni AI Agent is ready. How can I help you today?');
        });

        // Message handler
        this.bot.on('message:text', async (ctx) => {
            if (!this.messageHandler) return;
            const userId = ctx.from.id.toString();

            // In Telegram, chat.id is usually map to sessionId to separate context
            const sessionId = `tg_${ctx.chat.id}`;

            // Clear message map for this session
            this.sessionMap.delete(sessionId);
            this.throttleFns.delete(sessionId);

            const msg: IMMessage = {
                sessionId,
                userId,
                content: ctx.message.text,
                providerId: this.providerId
            };

            // Non-blocking call to standard message processing
            this.messageHandler(msg).catch(console.error);
        });

        // Auth Callback Query handler
        this.bot.on('callback_query:data', async (ctx) => {
            const data = ctx.callbackQuery.data;
            if (!data.startsWith('auth:')) {
                return;
            }

            const parts = data.split(':');
            const action = parts[1]; // 'approve' or 'deny'
            const requestId = parts[2];

            const resolve = this.pendingAuthPromises.get(requestId);
            if (resolve) {
                this.pendingAuthPromises.delete(requestId);
                const approved = action === 'approve';
                resolve({ approved, rememberDecision: false });

                await ctx.answerCallbackQuery({ text: approved ? 'Operation Authorized' : 'Operation Denied' });
                await ctx.editMessageReplyMarkup({ reply_markup: undefined }); // Remove keyboard
            } else {
                await ctx.answerCallbackQuery({ text: 'Authorization request expired or invalid.', show_alert: true });
                await ctx.editMessageReplyMarkup({ reply_markup: undefined });
            }
        });

        this.bot.catch((err) => {
            console.error('[TelegramAdapter] Polling Error:', err.message);
        });

        // Start polling via grammy runner
        console.log('[TelegramAdapter] Attempting to start grammy runner...');
        this.runner = run(this.bot);
        console.log('[TelegramAdapter] Started via grammyjs/runner. Polling for updates...');
    }

    public async stop(): Promise<void> {
        let wasRunning = false;
        if (this.runner && this.runner.isRunning()) {
            await this.runner.stop();
            wasRunning = true;
        }
        if (this.bot) wasRunning = true;

        this.bot = null;
        this.pendingAuthPromises.clear();
        this.sessionMap.clear();
        this.throttleFns.clear();

        if (wasRunning) {
            console.log('[TelegramAdapter] Stopped.');
        }
    }

    public onMessage(handler: (message: IMMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    public async requestAuthorization(
        sessionId: string,
        request: ToolExecutionRequest,
        decision: AuthorizationDecision
    ): Promise<UserApprovalContext> {
        if (!this.bot) return { approved: false, message: 'Bot not initialized' };

        const chatId = sessionId.replace('tg_', '');
        const requestId = request.requestId || Date.now().toString();

        const messageText = `⚠️ **Authorization Required**\n\n` +
            `The agent is attempting to run a ${decision.trustLevel} risk tool:\n` +
            `🔧 Tool: \`${request.toolName}\`\n\n` +
            `Are you sure you want to allow this?`;

        // Create inline keyboard
        const keyboard = new InlineKeyboard()
            .text('✅ Approve', `auth:approve:${requestId}`)
            .text('❌ Deny', `auth:deny:${requestId}`);

        try {
            await this.bot.api.sendMessage(chatId, messageText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (e) {
            console.error('[TelegramAdapter] Failed to send auth request:', e);
            return { approved: false };
        }

        return new Promise((resolve) => {
            this.pendingAuthPromises.set(requestId, resolve);

            // Optional timeout for 5 minutes
            setTimeout(() => {
                if (this.pendingAuthPromises.has(requestId)) {
                    this.pendingAuthPromises.delete(requestId);
                    resolve({ approved: false, message: 'Timed out' });
                }
            }, 5 * 60 * 1000);
        });
    }

    public async sendOrUpdateMessage(sessionId: string, content: string, options?: SendOptions): Promise<void> {
        if (!this.bot) return;

        let ctx = this.sessionMap.get(sessionId);
        if (!ctx) {
            ctx = { buffer: '', lastSentBuffer: '' };
            this.sessionMap.set(sessionId, ctx);
        }

        ctx.buffer = content;

        const throttleMs = options?.throttleMs !== undefined ? options.throttleMs : 1500;

        if (throttleMs === 0) {
            await this.flushMessage(sessionId);
        } else {
            let throttledFlush = this.throttleFns.get(sessionId);
            if (!throttledFlush) {
                throttledFlush = throttle(() => this.flushMessage(sessionId), throttleMs, { leading: true, trailing: true });
                this.throttleFns.set(sessionId, throttledFlush);
            }
            throttledFlush();
        }
    }

    private async flushMessage(sessionId: string) {
        if (!this.bot) return;

        const ctx = this.sessionMap.get(sessionId);
        if (!ctx || ctx.buffer === ctx.lastSentBuffer) return; // No change

        const chatId = sessionId.replace('tg_', '');
        // Telegram message max limit is 4096. 
        // Truncate if exceeds. (A production impl might split into multiple messages)
        let safeContent = ctx.buffer.length > 4000 ? ctx.buffer.substring(ctx.buffer.length - 4000) : ctx.buffer;

        try {
            if (!ctx.messageId) {
                const msg = await this.bot.api.sendMessage(chatId, safeContent);
                ctx.messageId = msg.message_id;
            } else {
                await this.bot.api.editMessageText(chatId, ctx.messageId, safeContent);
            }
            ctx.lastSentBuffer = ctx.buffer;
        } catch (e: any) {
            // Ignore format errors like "message is not modified"
            if (!e.message?.includes('message is not modified')) {
                console.error(`[TelegramAdapter] Failed to edit/send message to ${chatId}:`, e.message);
            }
        }
    }
}
