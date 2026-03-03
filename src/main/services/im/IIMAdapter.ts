import { ToolExecutionRequest, AuthorizationDecision, UserApprovalContext } from '../agent/ToolGuard';

export interface IMMessage {
    sessionId: string;
    userId: string;
    content: string;
    providerId: string;
}

export interface SendOptions {
    throttleMs?: number;
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
}
