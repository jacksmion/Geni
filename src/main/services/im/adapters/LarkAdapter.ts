import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lark = require('@larksuiteoapi/node-sdk');

import type * as LarkType from '@larksuiteoapi/node-sdk';
import { IIMAdapter, IMMessage, SendOptions } from '../IIMAdapter';
import { ToolExecutionRequest, AuthorizationDecision } from '../../agent/ToolGuard';
import { UserApprovalContext } from '../IIMAdapter';
import { LarkConfig } from '../../../../common/types/settings';
import throttle from 'lodash/throttle';

interface LarkSessionContext {
    messageId?: string;
    buffer: string;
    lastSentBuffer: string;
    isComplete?: boolean;
    flushPromise?: Promise<void>;
    nextFlushRequested?: boolean;
}

export class LarkAdapter implements IIMAdapter {
    readonly providerId = 'lark';

    private client: LarkType.Client | null = null;
    private wsClient: any = null;
    private messageHandler?: (msg: IMMessage) => Promise<void>;

    // sessionId -> LarkSessionContext
    private sessionMap: Map<string, LarkSessionContext> = new Map();
    private throttleFns: Map<string, any> = new Map();

    // requestId -> resolve callback
    private pendingAuthPromises: Map<string, (res: UserApprovalContext) => void> = new Map();

    public async start(config: LarkConfig): Promise<void> {
        await this.stop();

        if (!config.enabled || !config.appId || !config.appSecret) {
            return;
        }

        console.log(`[LarkAdapter] Initializing Lark Client with appId: ${config.appId}`);

        try {
            this.client = new lark.Client({
                appId: config.appId,
                appSecret: config.appSecret,
                disableTokenCache: false,
            });

            // Register event handlers via EventDispatcher
            const dispatcher = new lark.EventDispatcher({}).register({
                'im.message.receive_v1': async (data: any) => {
                    if (!this.messageHandler) return;

                    const message = data.message;
                    if (message.message_type !== 'text') return;

                    const content = JSON.parse(message.content).text;
                    const sessionId = `lark_${message.chat_id}`;
                    const userId = data.sender.sender_id.user_id;

                    // Clear context for new round
                    this.sessionMap.delete(sessionId);
                    this.throttleFns.delete(sessionId);

                    const msg: IMMessage = {
                        sessionId,
                        userId,
                        content,
                        providerId: this.providerId
                    };

                    await this.messageHandler(msg).catch(console.error);
                },
                'card.action.trigger': async (data: any) => {
                    const action = data.action;
                    const value = action.value;

                    if (!value || typeof value.authRequestId !== 'string') return;

                    const requestId = value.authRequestId;
                    const status = value.status; // 'approved' or 'denied'

                    const resolve = this.pendingAuthPromises.get(requestId);
                    if (resolve) {
                        this.pendingAuthPromises.delete(requestId);
                        const approved = status === 'approved';
                        resolve({ approved, rememberDecision: false });

                        // Update the card to show result
                        const card = {
                            config: { update_multi: true },
                            header: {
                                title: { content: approved ? '✅ 已授权' : '❌ 已拒绝', tag: 'plain_text' },
                                template: approved ? 'green' : 'red'
                            },
                            elements: [
                                {
                                    tag: 'div',
                                    text: { content: approved ? '您已同意执行该操作。' : '您已拒绝执行该操作。', tag: 'lark_md' }
                                }
                            ]
                        };
                        return { card }; 
                    }
                }
            });

            // Using Lark Long Connection (WebSocket)
            this.wsClient = new lark.WSClient({
                appId: config.appId,
                appSecret: config.appSecret,
            });

            await this.wsClient.start({
                eventDispatcher: dispatcher
            });
            console.log('[LarkAdapter] Successfully started Lark WebSocket connection.');
        } catch (e: any) {
            console.error(`[LarkAdapter] ❌ Failed to start Lark adapter:`, e.message || e);
        }
    }

    public async stop(): Promise<void> {
        if (this.wsClient) {
            console.log('[LarkAdapter] Stopping Lark WebSocket client...');
            // Lark SDK doesn't have a direct stop() sometimes, but if it does:
            try {
                this.wsClient.stop?.();
            } catch (e) {
                console.warn('[LarkAdapter] Error while stopping WebSocket client:', e);
            }
            this.wsClient = null;
        }
        this.client = null;
        this.sessionMap.clear();
        this.throttleFns.clear();
        this.pendingAuthPromises.clear();
    }

    public async testConnection(config: LarkConfig): Promise<{ success: boolean; message: string }> {
        if (!config.appId || !config.appSecret) {
            return { success: false, message: 'App ID and App Secret are required' };
        }
        try {
            const tempClient = new lark.Client({ appId: config.appId, appSecret: config.appSecret });
            await tempClient.tokenManager.getTenantAccessToken();
            return { success: true, message: 'Connection successful (Tenant Access Token obtained)' };
        } catch (e: any) {
            return { success: false, message: `Connection failed: ${e.message}` };
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
        if (!this.client) return { approved: false, message: 'Client not initialized' };

        const chatId = sessionId.replace('lark_', '');
        const requestId = request.requestId || Date.now().toString();

        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { content: '⚠️ 操作授权申请', tag: 'plain_text' },
                template: 'orange'
            },
            elements: [
                {
                    tag: 'div',
                    text: {
                        content: `Agent 正在请求执行以下工具：\n**工具名称**: \`${request.toolName}\`\n**风险级别**: ${decision.trustLevel}\n\n是否允许？`,
                        tag: 'lark_md'
                    }
                },
                {
                    tag: 'action',
                    actions: [
                        {
                            tag: 'button',
                            text: { content: '✅ 同意', tag: 'plain_text' },
                            type: 'primary',
                            value: { authRequestId: requestId, status: 'approved' }
                        },
                        {
                            tag: 'button',
                            text: { content: '❌ 拒绝', tag: 'plain_text' },
                            type: 'danger',
                            value: { authRequestId: requestId, status: 'denied' }
                        }
                    ]
                }
            ]
        };

        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'chat_id' },
                data: {
                    receive_id: chatId,
                    msg_type: 'interactive',
                    content: JSON.stringify(card)
                }
            });
        } catch (e) {
            console.error('[LarkAdapter] Failed to send auth card:', e);
            return { approved: false };
        }

        return new Promise((resolve) => {
            this.pendingAuthPromises.set(requestId, resolve);
            setTimeout(() => {
                if (this.pendingAuthPromises.has(requestId)) {
                    this.pendingAuthPromises.delete(requestId);
                    resolve({ approved: false, message: '授权超时' });
                }
            }, 5 * 60 * 1000);
        });
    }

    public async sendOrUpdateMessage(sessionId: string, content: string, options?: SendOptions): Promise<void> {
        if (!this.client) return;

        let ctx = this.sessionMap.get(sessionId);
        if (!ctx) {
            ctx = { buffer: '', lastSentBuffer: '' };
            this.sessionMap.set(sessionId, ctx);
        }

        ctx.buffer = content;
        if (options?.isComplete !== undefined) {
            ctx.isComplete = options.isComplete;
        }

        const throttleMs = options?.throttleMs !== undefined ? options.throttleMs : 500;

        if (throttleMs === 0 || ctx.isComplete) {
            const throttledFlush = this.throttleFns.get(sessionId);
            if (throttledFlush && typeof throttledFlush.cancel === 'function') {
                throttledFlush.cancel();
            }
            await this.safeFlushMessage(sessionId);
        } else {
            let throttledFlush = this.throttleFns.get(sessionId);
            if (!throttledFlush) {
                throttledFlush = throttle(() => this.safeFlushMessage(sessionId), throttleMs, { leading: true, trailing: true });
                this.throttleFns.set(sessionId, throttledFlush);
            }
            throttledFlush();
        }
    }

    private safeFlushMessage(sessionId: string): Promise<void> {
        const ctx = this.sessionMap.get(sessionId);
        if (!ctx) return Promise.resolve();

        if (ctx.flushPromise) {
            ctx.nextFlushRequested = true;
            return ctx.flushPromise;
        }

        const doFlush = async () => {
            while (true) {
                try {
                    await this.flushMessage(sessionId);
                } catch (e) {
                    console.error('[LarkAdapter] Error in flushMessage queue:', e);
                }
                
                if (ctx.nextFlushRequested) {
                    ctx.nextFlushRequested = false;
                    continue;
                }
                break;
            }
        };

        ctx.flushPromise = doFlush().finally(() => {
            const currentCtx = this.sessionMap.get(sessionId);
            if (currentCtx) currentCtx.flushPromise = undefined;
        });

        return ctx.flushPromise;
    }

    private async flushMessage(sessionId: string) {
        if (!this.client) return;

        const ctx = this.sessionMap.get(sessionId);
        if (!ctx || (ctx.buffer === ctx.lastSentBuffer && !ctx.isComplete && ctx.messageId)) return;
        // 空 buffer 且非最终消息：无内容可显示，跳过
        if (!ctx.buffer.trim() && !ctx.isComplete) return;

        const chatId = sessionId.replace('lark_', '');
        
        // Construct the card
        const card = {
            config: { wide_screen_mode: true },
            header: {
                title: { content: ctx.isComplete ? '💡 Geni 回复' : '⏳ Geni 正在思考...', tag: 'plain_text' },
                template: ctx.isComplete ? 'blue' : 'grey'
            },
            elements: [
                {
                    tag: 'div',
                    text: {
                        content: ctx.buffer,
                        tag: 'lark_md'
                    }
                }
            ]
        };

        try {
            if (!ctx.messageId) {
                // Initial creation
                const res = await this.client.im.message.create({
                    params: { receive_id_type: 'chat_id' },
                    data: {
                        receive_id: chatId,
                        msg_type: 'interactive',
                        content: JSON.stringify(card)
                    }
                });
                ctx.messageId = res.data?.message_id;
            } else {
                // Update existing message
                await this.client.im.message.patch({
                    path: { message_id: ctx.messageId },
                    data: {
                        content: JSON.stringify(card)
                    }
                });
            }
            ctx.lastSentBuffer = ctx.buffer;
        } catch (e: any) {
            console.error(`[LarkAdapter] Failed to send/update card to ${chatId}:`, e.message);
        }
    }

    async sendChatAction(sessionId: string, action: 'typing' | 'upload_document'): Promise<void> {
        // Lark doesn't have a direct "typing" indicator via API like Telegram 
        // We handle this via the card header title "⏳ Geni 正在思考..."
    }

    public clearSession(sessionId: string): void {
        const throttledFlush = this.throttleFns.get(sessionId);
        if (throttledFlush && typeof throttledFlush.cancel === 'function') {
            throttledFlush.cancel();
        }
        this.throttleFns.delete(sessionId);
        this.sessionMap.delete(sessionId);
    }
}
