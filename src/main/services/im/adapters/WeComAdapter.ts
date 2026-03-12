import { WSClient, MessageType, EventType, TemplateCardType } from '@wecom/aibot-node-sdk';
import { IIMAdapter, IMMessage, SendOptions } from '../IIMAdapter';
import { UserApprovalContext, ToolExecutionRequest, AuthorizationDecision } from '../../agent/ToolGuard';
import { WeComConfig } from '../../../../common/types/settings';

export class WeComAdapter implements IIMAdapter {
    readonly providerId = 'wecom';

    private client: WSClient | null = null;
    private messageHandler?: (msg: IMMessage) => Promise<void>;

    // session ID -> Last received WsFrame (headers needed for reply)
    private sessionFrames = new Map<string, any>();
    // session ID -> streamId (for WeCom streaming)
    private streamIds = new Map<string, string>();

    // Authorization state: requestId -> resolve callback
    private pendingAuthPromises: Map<string, (res: UserApprovalContext) => void> = new Map();

    public async start(config: WeComConfig): Promise<void> {
        await this.stop();

        if (!config.enabled || !config.botId || !config.secret) {
            return;
        }

        console.log(`[WeComAdapter] Initializing WeCom WSClient with botId: ${config.botId}`);

        try {
            this.client = new WSClient({
                botId: config.botId,
                secret: config.secret
            });

            // Set up text message handler
            this.client.on('message.text', async (data) => {
                if (!this.messageHandler) return;

                const body = data.body!;
                // chatid for groups, userid for single chat
                const chatid = body.chatid || body.from.userid;
                const sessionId = `wecom_${chatid}`;

                // Store frame for later replies
                this.sessionFrames.set(sessionId, data);
                // Clear old streamId for a new request
                this.streamIds.delete(sessionId);

                const msg: IMMessage = {
                    sessionId,
                    userId: body.from.userid,
                    content: body.text.content,
                    providerId: this.providerId
                };

                await this.messageHandler(msg).catch(console.error);
            });

            // Set up template card event handler (for authorization)
            this.client.on('event.template_card_event', async (data) => {
                const event = data.body?.event;
                if (!event || event.eventtype !== EventType.TemplateCardEvent) return;

                const eventKey = event.event_key;
                if (!eventKey || !eventKey.startsWith('auth:')) return;

                const parts = eventKey.split(':');
                const action = parts[1]; // 'approve' or 'deny'
                const requestId = parts[2];

                const resolve = this.pendingAuthPromises.get(requestId);
                if (resolve) {
                    this.pendingAuthPromises.delete(requestId);
                    const approved = action === 'approve';
                    resolve({ approved, rememberDecision: false });
                    
                    // Update the card to show it's processed (optional)
                    // Note: updateTemplateCard requires the exact frame headers from the event
                    try {
                        const updatedCard: any = {
                            card_type: 'button_interaction',
                            main_title: { title: approved ? '✅ Operation Authorized' : '❌ Operation Denied' },
                            sub_title_text: approved ? 'You have approved this action.' : 'You have denied this action.',
                            button_list: [] // Clear buttons
                        };
                        await this.client?.updateTemplateCard(data, updatedCard);
                    } catch (e) {
                        console.warn('[WeComAdapter] Failed to update auth card:', e);
                    }
                }
            });

            this.client.on('error', (err) => {
                console.error('[WeComAdapter] WebSocket error:', err);
            });

            this.client.on('authenticated', () => {
                console.log('[WeComAdapter] Authenticated successfully!');
            });

            // Start connection
            this.client.connect();
        } catch (e: any) {
            console.error(`[WeComAdapter] ❌ Failed to connect or initialize:`, e.message || e);
        }
    }

    public async stop(): Promise<void> {
        if (this.client) {
            console.log('[WeComAdapter] Disconnecting WeCom client...');
            this.client.disconnect();
            this.client = null;
        }
        this.sessionFrames.clear();
        this.streamIds.clear();
        this.pendingAuthPromises.clear();
    }

    public async testConnection(config: WeComConfig): Promise<{ success: boolean; message: string }> {
        // Since it's WS, we can only really test by trying to connect
        // But for a simple check, we just check fields
        if (!config.botId || !config.secret) {
            return { success: false, message: 'botId and secret are required' };
        }
        return { success: true, message: 'Configuration provided' };
    }

    public onMessage(handler: (message: IMMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    public async requestAuthorization(
        sessionId: string,
        request: ToolExecutionRequest,
        decision: AuthorizationDecision
    ): Promise<UserApprovalContext> {
        if (!this.client) return { approved: false, message: 'Bot not initialized' };

        const frame = this.sessionFrames.get(sessionId);
        if (!frame) return { approved: false, message: 'No active session frame' };

        const requestId = request.requestId || Date.now().toString();

        const cardTitle = `⚠️ Authorization Required`;
        const cardDesc = `The agent is attempting to run a tool:\n🔧 Tool: **${request.toolName}**\nRisk Level: **${decision.trustLevel}**\n\nAllow this?`;

        try {
            // Use replyTemplateCard to reply to the current message
            await this.client.replyTemplateCard(frame, {
                card_type: 'button_interaction',
                main_title: { title: cardTitle },
                sub_title_text: cardDesc,
                button_list: [
                    {
                        text: '✅ Approve',
                        style: 1, 
                        key: `auth:approve:${requestId}`
                    },
                    {
                        text: '❌ Deny',
                        style: 2,
                        key: `auth:deny:${requestId}`
                    }
                ]
            });
        } catch (e) {
            console.error('[WeComAdapter] Failed to send auth card:', e);
            return { approved: false };
        }

        return new Promise((resolve) => {
            this.pendingAuthPromises.set(requestId, resolve);
            setTimeout(() => {
                if (this.pendingAuthPromises.has(requestId)) {
                    this.pendingAuthPromises.delete(requestId);
                    resolve({ approved: false, message: 'Timed out' });
                }
            }, 5 * 60 * 1000);
        });
    }

    public async sendOrUpdateMessage(sessionId: string, content: string, options?: SendOptions): Promise<void> {
        if (!this.client) return;

        const frame = this.sessionFrames.get(sessionId);
        if (!frame) {
            // If no frame (proactive send), we might need to use sendMessage
            // But usually IM adapters reply to a message
            console.warn(`[WeComAdapter] No session frame for ${sessionId}, attempting proactive send.`);
            const chatid = sessionId.replace('wecom_', '');
            await this.client.sendMessage(chatid, {
                msgtype: 'markdown',
                markdown: { content }
            });
            return;
        }

        try {
            let streamId = this.streamIds.get(sessionId);
            if (!streamId) {
                streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                this.streamIds.set(sessionId, streamId);
            }

            const isFinish = !!options?.isComplete;
            // Use replyStream for the streaming experience
            await this.client.replyStream(
                frame,
                streamId,
                content,
                isFinish
            );

            if (isFinish) {
                // Clear the stream ID and maybe the frame (though keeping frame for multiple rounds might be okay)
                this.streamIds.delete(sessionId);
            }
        } catch (e: any) {
            console.error(`[WeComAdapter] Failed to send/reply message:`, e.message || e);
        }
    }

    async sendChatAction(sessionId: string, action: 'typing' | 'upload_document'): Promise<void> {
        // Not supported in WSClient yet
    }
}
