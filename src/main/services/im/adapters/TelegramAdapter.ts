import { Bot, Context, InlineKeyboard, GrammyError, HttpError } from 'grammy';
import { run, RunnerHandle } from '@grammyjs/runner';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { IIMAdapter, IMMessage, SendOptions } from '../IIMAdapter';
import { UserApprovalContext, ToolExecutionRequest, AuthorizationDecision } from '../../agent/ToolGuard';
import { TelegramConfig } from '../../../../common/types/settings';
import throttle from 'lodash/throttle';

interface ThrottleContext {
    buffer: string;
    messageId?: number;
    draftId?: number;
    isComplete?: boolean;
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
        console.log(`[TelegramAdapter] Initializing bot with node-fetch and proxy: ${actualProxyUrl || 'None'}`);

        try {
            if (actualProxyUrl) {
                // Use createRequire to support 'require' in ESM environment
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { createRequire } = await import('module');
                const localRequire = createRequire((import.meta as any).url);
                const agent = new HttpsProxyAgent(actualProxyUrl);

                this.bot = new Bot(config.token, {
                    client: {
                        // @ts-expect-error: grammy fetch parameters differ slightly from node-fetch
                        fetch: async (url: any, options: any = {}) => {
                            try {
                                // Dynamically require node-fetch at runtime
                                const nodeFetch = localRequire('node-fetch');
                                
                                // node-fetch@2 might fail with native AbortSignal (instanceof check)
                                // We remove the signal to ensure compatibility with modern grammY options
                                const { signal, ...restOptions } = options;

                                return await nodeFetch(url, {
                                    ...restOptions,
                                    agent: agent,
                                });
                            } catch (err: any) {
                                if (err && typeof err === 'object') {
                                    err.url = url;
                                }
                                throw err;
                            }
                        },
                    }
                });
                console.log(`[TelegramAdapter] Proxy enabled (ESM Safe + Signal Sanitize): ${actualProxyUrl}`);
            } else {
                this.bot = new Bot(config.token);
            }

            // Test the bot token by calling getMe
            const me = await this.bot.api.getMe();
            console.log(`[TelegramAdapter] Successfully connected! Bot username: @${me.username}`);
        } catch (e: any) {
            console.error(`[TelegramAdapter] ❌ Failed to initialize bot or test connection.`);

            if (e instanceof HttpError) {
                console.error(`[TelegramAdapter] HttpError (Network): ${e.message}`);
                const inner = (e as any).error; // Grammy wraps the native fetch error in .error
                if (inner) {
                    console.error(`[TelegramAdapter] Failed URL: ${inner.url || 'N/A'}`);
                    console.error(`[TelegramAdapter] Inner Error: ${inner.message || inner}`);
                    if (inner.code) console.error(`[TelegramAdapter] Error Code: ${inner.code}`);
                }
            } else if (e instanceof GrammyError) {
                console.error(`[TelegramAdapter] GrammyError (API): ${e.description}`);
                console.error(`[TelegramAdapter] Error Code: ${e.error_code}`);
            } else {
                console.error(`[TelegramAdapter] Error: ${e.message || e}`);
            }

            if (e.stack) {
                console.error(`Stack trace:\n${e.stack}`);
            }
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
            const ctx = err.ctx;
            console.error(`[TelegramAdapter] Error while handling update ${ctx.update.update_id}:`);

            const e = err.error;
            if (e instanceof GrammyError) {
                console.error("[TelegramAdapter] Request Error (Telegram API):", e.description);
            } else if (e instanceof HttpError) {
                console.error("[TelegramAdapter] Network Error:", e);
            } else {
                console.error("[TelegramAdapter] Unknown Error:", e);
            }
        });

        // Start polling via grammy runner
        console.log('[TelegramAdapter] Attempting to start grammy runner...');
        this.runner = run(this.bot);
        console.log('[TelegramAdapter] Started via grammyjs/runner. Polling for updates...');
    }

    public async stop(): Promise<void> {
        let wasRunning = false;
        if (this.runner) {
            if (this.runner.isRunning()) {
                console.log('[TelegramAdapter] Stopping existing runner...');
                await this.runner.stop();
                // Add a small delay to allow Telegram servers to recognize the disconnection
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            this.runner = null;
            wasRunning = true;
        }
        
        if (this.bot) {
            this.bot = null;
            wasRunning = true;
        }

        this.pendingAuthPromises.clear();
        this.sessionMap.clear();
        this.throttleFns.clear();

        if (wasRunning) {
            console.log('[TelegramAdapter] Stopped successfully.');
        }
    }

    public async testConnection(config: TelegramConfig): Promise<{ success: boolean; message: string }> {
        if (!config.token) return { success: false, message: 'Token is required' };
        
        const actualProxyUrl = config.proxyUrl || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
        
        try {
            let tempBot: Bot;
            if (actualProxyUrl) {
                const { createRequire } = await import('module');
                const localRequire = createRequire((import.meta as any).url);
                const agent = new HttpsProxyAgent(actualProxyUrl);

                tempBot = new Bot(config.token, {
                    client: {
                        // @ts-expect-error: grammy fetch parameters differ slightly from node-fetch
                        fetch: async (url: any, options: any = {}) => {
                            const nodeFetch = localRequire('node-fetch');
                            const { signal, ...restOptions } = options;
                            return await nodeFetch(url, { ...restOptions, agent: agent });
                        },
                    }
                });
            } else {
                tempBot = new Bot(config.token);
            }

            const me = await tempBot.api.getMe();
            return { 
                success: true, 
                message: `Successfully connected as @${me.username}` 
            };
        } catch (e: any) {
            let errorMsg = e.message || 'Unknown error';
            if (e instanceof GrammyError) {
                errorMsg = `Telegram API Error: ${e.description} (${e.error_code})`;
            } else if (e instanceof HttpError) {
                errorMsg = `Network Error: ${e.message}`;
            }
            return { success: false, message: errorMsg };
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

    async sendChatAction(sessionId: string, action: 'typing' | 'upload_document'): Promise<void> {
        if (!this.bot) return;
        const chatId = sessionId.replace('tg_', '');
        try {
            await this.bot.api.sendChatAction(chatId, action === 'typing' ? 'typing' : 'upload_document');
        } catch (e) {
            console.warn('[TelegramAdapter] Failed to send chat action:', e);
        }
    }

    public async sendOrUpdateMessage(sessionId: string, content: string, options?: SendOptions): Promise<void> {
        if (!this.bot) return;

        let ctx = this.sessionMap.get(sessionId);
        if (!ctx) {
            // Generate a random draftId (must be non-zero, within safe integer limits)
            const draftId = Math.floor(Math.random() * 100000000) + 1;
            ctx = { buffer: '', lastSentBuffer: '', draftId };
            this.sessionMap.set(sessionId, ctx);
        }

        ctx.buffer = content;
        if (options?.isComplete !== undefined) {
            ctx.isComplete = options.isComplete;
        }

        // We can use a lower throttle or dynamic throttle since draft is cheap
        const throttleMs = options?.throttleMs !== undefined ? options.throttleMs : 100;

        if (throttleMs === 0 || ctx.isComplete) {
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
        if (!ctx || (!ctx.isComplete && ctx.buffer === ctx.lastSentBuffer && ctx.buffer !== '')) return; // No change

        const chatIdStr = sessionId.replace('tg_', '');
        const chatId = parseInt(chatIdStr, 10);
        
        if (isNaN(chatId)) {
            console.warn(`[TelegramAdapter] Invalid chat ID for draft/message: ${chatIdStr}`);
            return;
        }

        // Limit total length to 4000
        const rawContent = ctx.buffer.length > 4000 ? ctx.buffer.substring(ctx.buffer.length - 4000) : ctx.buffer;
        
        // Convert Markdown to safe HTML for Telegram
        const safeHtml = this.formatToTelegramHtml(rawContent);

        try {
            const sendOptions: any = {
                parse_mode: 'HTML',
            };

            if (ctx.isComplete) {
                // If it's final, we solidify the message
                if (ctx.messageId) {
                    await this.bot.api.editMessageText(chatId, ctx.messageId, safeHtml, sendOptions);
                } else {
                    const msg = await this.bot.api.sendMessage(chatId, safeHtml, sendOptions);
                    ctx.messageId = msg.message_id;
                }
            } else {
                // Not final, send draft state instead of creating messages
                if (ctx.draftId) {
                    await this.bot.api.sendMessageDraft(
                        chatId,
                        ctx.draftId,
                        safeHtml,
                        { parse_mode: 'HTML' }
                    );
                } else if (!ctx.messageId) {
                    const msg = await this.bot.api.sendMessage(chatId, safeHtml, sendOptions);
                    ctx.messageId = msg.message_id;
                } else {
                    await this.bot.api.editMessageText(chatId, ctx.messageId, safeHtml, sendOptions);
                }
            }
            ctx.lastSentBuffer = ctx.buffer;
        } catch (e: any) {
            // If HTML parsing fails, fallback to plain text to prevent breaking the stream
            if (e.message?.includes('can\'t parse entities')) {
                console.warn('[TelegramAdapter] HTML Parse failed, falling back to plain text.');
                try {
                    if (ctx.isComplete) {
                        if (ctx.messageId) {
                            await this.bot.api.editMessageText(chatId, ctx.messageId, rawContent);
                        } else {
                            await this.bot.api.sendMessage(chatId, rawContent);
                        }
                    } else if (ctx.draftId) {
                        await this.bot.api.sendMessageDraft(
                            chatId,
                            ctx.draftId,
                            rawContent
                        );
                    }
                } catch (innerE) {
                    console.warn('[TelegramAdapter] Fallback edit/draft failed:', innerE);
                }
            } else if (!e.message?.includes('message is not modified')) {
                console.error(`[TelegramAdapter] Failed to edit/send message to ${chatId}:`, e.message);
            }
        }
    }

    /**
     * Converts standard Markdown to Telegram-safe HTML.
     * Includes auto-closing tags for streaming support.
     */
    private formatToTelegramHtml(markdown: string): string {
        let html = markdown
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 1. Headers to Bold (Telegram doesn't support real headers)
        html = html.replace(/^#+ (.*)$/gm, '<b>$1</b>');

        // 2. Bold: **text** -> <b>text</b>
        html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

        // 3. Monospace/Code block: ```language\ncode\n``` -> <pre>code</pre>
        html = html.replace(/```(?:[a-z]*)\n?([\s\S]*?)```/g, '<pre>$1</pre>');

        // 4. Inline code: `code` -> <code>code</code>
        html = html.replace(/`(.*?)`/g, '<code>$1</code>');

        // 5. Links: [text](url) -> <a href="url">text</a>
        html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

        // --- STREAMING SAFETY: Auto-close tags ---
        const openTags: string[] = [];
        
        // Match <b> and <pre> and <code>
        const tagRegex = /<(b|pre|code|a|i)>/g;
        const closeRegex = /<\/(b|pre|code|a|i)>/g;
        
        let match;
        const openMatches = Array.from(html.matchAll(tagRegex));
        const closeMatches = Array.from(html.matchAll(closeRegex)).map(m => m[1]);

        // Simple stack-based repair (for bold, code, etc.)
        // Check for common unclosed tags at the end of partial AI response
        if (html.includes('**') && !html.match(/\*\*(.*?)\*\*/)) {
            // Temporary bold if AI is in the middle of writing **something
            // This is handled by regex above but if it's incomplete it's just raw symbols
        }

        // Specifically handle <pre> and <b> which are common in streaming
        const preCount = (html.match(/<pre>/g) || []).length;
        const preCloseCount = (html.match(/<\/pre>/g) || []).length;
        if (preCount > preCloseCount) html += '</pre>';

        const bCount = (html.match(/<b>/g) || []).length;
        const bCloseCount = (html.match(/<\/b>/g) || []).length;
        if (bCount > bCloseCount) html += '</b>';

        const codeCount = (html.match(/<code>/g) || []).length;
        const codeCloseCount = (html.match(/<\/code>/g) || []).length;
        if (codeCount > codeCloseCount) html += '</code>';

        return html;
    }
}
