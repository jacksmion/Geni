import { ContentPart } from './chat';

/**
 * IPC Payload Definitions
 */

export interface AgentStartRequest {
    sessionId?: string;
    prompt: string | ContentPart[];
    options?: {
        model?: string;
        skills?: string[]; // skill IDs
        staffId?: string;  // 绑定的数字员工 ID
        workspacePath?: string;
    };
}

export interface AgentStartResponse {
    success: boolean;
    sessionId?: string;
    runId?: string;
    error?: string;
}

export interface SessionCreateResponse {
    id: string;
    createdAt: number;
}

/** Legacy IPC payloads */
export interface AgentStreamEventPayload {
    content: string;
    isReset?: boolean;
}

export interface AgentStepEventPayload {
    steps: any[];
}

/** Controller → UI 状态变更事件 */
export interface AgentStateEvent {
    previousState: string;
    currentState: string;
    message?: string;
    metadata?: Record<string, any>;
    timestamp: number;
}
