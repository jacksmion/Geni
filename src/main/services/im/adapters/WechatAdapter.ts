import { IIMAdapter, IMMessage, SendOptions } from '../IIMAdapter';
import { ToolExecutionRequest, AuthorizationDecision, UserApprovalContext } from '../../agent/ToolGuard';
import { login, start, isLoggedIn, logout, type Agent } from 'weixin-agent-sdk';
import { BrowserWindow } from 'electron';
import { SYSTEM_EVENTS } from '../../../../common/ipc/channels';
import { createRequire } from 'node:module';

// 使用 createRequire 避免在构建时被打包器转换，防止 ESM 和 CommonJS 冲突以及严格模式报错
const customRequire = createRequire(import.meta.url);
const qrcodeTerminal = customRequire('qrcode-terminal');

// 覆盖 generate 方法，拦截 URL 用于前端展示
qrcodeTerminal.generate = (url: string, opts: any, cb: any) => {
    console.log(`\n[WechatAdapter] 截获纯净版二维码链接:\n => ${url}\n`);
    
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send(SYSTEM_EVENTS.WECHAT_QR, url);
        }
    });

    if (cb) cb(''); // 调用回调，传入空字符串，让控制台不再输出乱码区块
};

export class WechatAdapter implements IIMAdapter {
    readonly providerId = 'wechat';
    private isRunning = false;
    private messageHandler?: (message: IMMessage) => Promise<void>;
    private loginPromise: Promise<any> | null = null;
    
    // Wechat agent instance
    private agent: Agent;

    private pendingChats = new Map<string, {
        resolve: (value: any) => void,
        reject: (reason?: any) => void,
        buffer: string,
        lastUpdate: number
    }>();

    constructor() {
        this.agent = {
            chat: (req) => {
                return new Promise((resolve, reject) => {
                    // If the adapter is stopped, ignore incoming messages
                    if (!this.isRunning) {
                        resolve({ text: "" });
                        return;
                    }

                    const sessionId = `wechat_${req.conversationId}`;
                    this.pendingChats.set(sessionId, { resolve, reject, buffer: '', lastUpdate: Date.now() });
                    
                    if (this.messageHandler) {
                        this.messageHandler({
                            sessionId,
                            userId: req.conversationId,
                            content: req.text,
                            providerId: this.providerId
                        }).catch(e => {
                            console.error("[WechatAdapter] Error processing message:", e);
                            reject(e);
                        });
                    } else {
                        resolve({ text: "Geni is not ready." });
                    }
                });
            }
        };
    }

    onMessage(handler: (message: IMMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    async testConnection(config: any): Promise<{ success: boolean; message: string }> {
        if (isLoggedIn()) {
            this.notifyConnected();
            return { success: true, message: 'Already connected' };
        }

        if (!this.loginPromise) {
            console.log(`[WechatAdapter] Triggering login via testConnection`);
            this.loginPromise = login().then(() => {
                console.log(`[WechatAdapter] Login successful via QR scan`);
                this.notifyConnected();
                this.loginPromise = null;
            }).catch(e => {
                console.error(`[WechatAdapter] Login failed:`, e);
                this.loginPromise = null;
            });
        }
        return { success: true, message: 'Generating QR code...' };
    }

    async requestAuthorization(
        sessionId: string,
        request: ToolExecutionRequest,
        decision: AuthorizationDecision
    ): Promise<UserApprovalContext> {
        return new Promise((resolve) => {
            // Because WeChat lacks a UI, we send a text message to ask for permission
            const prompt = `[Tool Execution Request]\nAgent wants to execute: ${request.toolName}\nParams: ${JSON.stringify(request.args)}\n\nPlease reply with 'Y' to allow, or 'N' to deny.`;
            
            // This is non-trivial to implement securely via text without breaking the normal flow.
            // For Phase 1 & 2 MVP, we can just say tool execution is denied by default if UI is required.
            // In Phase 3 we will build a proper text-based intercept.
            console.warn(`[WechatAdapter] Tool execution request for ${request.toolName} requires UI approval. Denying by default for MVP.`);
            resolve({
                approved: false,
                message: 'Tool execution requires UI approval. Denied in WeChat headless mode.'
            });
        });
    }

    async sendOrUpdateMessage(sessionId: string, content: string, options?: SendOptions): Promise<void> {
        const pending = this.pendingChats.get(sessionId);
        if (pending) {
            pending.buffer = content;
            pending.lastUpdate = Date.now();
            
            // WeChat doesn't support streaming like Telegram edits,
            // so we only resolve the agent chat promise when the message is complete.
            if (options?.isComplete) {
                pending.resolve({ text: pending.buffer });
                this.pendingChats.delete(sessionId);
            }
        }
    }

    async start(config: any): Promise<void> {
        if (!config?.enabled || this.isRunning) return;
        
        console.log(`[WechatAdapter] Starting Wechat adapter...`);
        this.isRunning = true;
        
        // Start asynchronously so we don't block the rest of the application
        // if login() waits for QR code scan
        (async () => {
            try {
                if (isLoggedIn()) {
                    // 已有持久化的登录态，直接启动，免扫码
                    console.log(`[WechatAdapter] Found persisted login session, resuming without QR scan.`);
                    this.notifyConnected();
                } else {
                    // 首次登录，需要扫码或者已经触发了扫码
                    if (this.loginPromise) {
                        console.log(`[WechatAdapter] Waiting for pending login...`);
                        await this.loginPromise;
                    } else {
                        console.log(`[WechatAdapter] No persisted session found. Please scan QR code to login.`);
                        this.loginPromise = login();
                        await this.loginPromise;
                        this.loginPromise = null;
                        this.notifyConnected();
                    }
                }

                // Start agent message loop
                start(this.agent).catch(e => {
                    console.error("[WechatAdapter] Agent message loop threw an error:", e);
                });
                console.log(`[WechatAdapter] Started successfully.`);
            } catch (e) {
                this.isRunning = false;
                console.error(`[WechatAdapter] Failed to start Wechat adapter:`, e);
            }
        })();
    }

    private notifyConnected() {
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send(SYSTEM_EVENTS.WECHAT_QR, 'connected');
            }
        });
    }

    async stop(): Promise<void> {
        if (!this.isRunning) return;
        console.log(`[WechatAdapter] Stopping Wechat adapter...`);
        this.isRunning = false;

        // 移除强行 logout()，保护用户缓存，改为仅挂起接管服务
        console.log(`[WechatAdapter] Adapter paused. Persisted session kept intact.`);

        // 清理所有等待中的 chat
        for (const [sessionId, pending] of this.pendingChats) {
            pending.reject(new Error('Adapter stopped'));
        }
        this.pendingChats.clear();

        // 通知 UI 微信已断开
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send(SYSTEM_EVENTS.WECHAT_QR, 'disconnected');
            }
        });
    }
}
