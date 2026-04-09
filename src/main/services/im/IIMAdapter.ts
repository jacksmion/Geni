import { ToolExecutionRequest, AuthorizationDecision } from '../agent/ToolGuard';

export interface IMMessage {
    sessionId: string;
    userId: string;
    content: string;
    providerId: string;
}

export interface SendOptions {
    throttleMs?: number;
    isComplete?: boolean;
}

export interface UserApprovalContext {
    /** 是否批准 */
    approved: boolean;
    /** 用户消息 */
    message?: string;
    /** 是否记住此决定 */
    rememberDecision?: boolean;
}

export interface IIMAdapter {
    readonly providerId: string;

    start(config: any): Promise<void>;
    stop(): Promise<void>;

    onMessage(handler: (message: IMMessage) => Promise<void>): void;

    requestAuthorization(
        sessionId: string,
        request: ToolExecutionRequest,
        decision: AuthorizationDecision
    ): Promise<UserApprovalContext>;

    sendOrUpdateMessage(sessionId: string, content: string, options?: SendOptions): Promise<void>;
    sendChatAction?(sessionId: string, action: 'typing' | 'upload_document'): Promise<void>;
    clearSession?(sessionId: string): void;

    testConnection?(config: any): Promise<{ success: boolean; message: string }>;
}
