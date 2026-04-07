import { ChatMessage, ContentPart } from './chat';
import { ErrorCategory } from '../../main/services/agent/ErrorClassifier';
import { AgentStep } from '../../main/services/agent/IAgent';

/**
 * IPC Payload Definitions
 */

export interface AgentStartRequest {
    sessionId?: string;
    prompt: string | ContentPart[];
    options?: {
        model?: string;
        skills?: string[]; // skill IDs
    };
}

export interface AgentStartResponse {
    success: boolean;
    sessionId?: string; // Add this
    error?: string;
}

export interface SessionCreateResponse {
    id: string;
    createdAt: number;
}

/** Legacy IPC payloads - 兼容期保留 */
export interface AgentStreamEventPayload {
    content: string;
    isReset?: boolean;
}

export interface AgentStepEventPayload {
    steps: any[]; // Changed back
}

// ===== 传输信封 =====
export interface AgentEventEnvelope {
    sessionId: string;
    timestamp: number;
    event: AgentEvent;
}

// ===== AgentStateEvent 内联定义（避免循环依赖 common -> main）=====
export interface AgentStateEvent {
    previousState: string;
    currentState: string;
    message?: string;
    metadata?: Record<string, any>;
    timestamp: number;
}

// ===== 语义事件联合类型 =====
export type AgentEvent =
    | { type: 'agent_start';       payload: { taskDescription?: string } }
    | { type: 'turn_start';        payload: { turnIndex: number } }
    | { type: 'message_delta';     payload: { delta: string } }
    | { type: 'reasoning_delta';   payload: { delta: string } }
    | { type: 'tool_start';        payload: { toolCallId: string; toolName: string; args: Record<string, any> } }
    | { type: 'tool_end';          payload: { toolCallId: string; result: string; isError: boolean; duration: number } }
    | { type: 'turn_end';          payload: { turnIndex: number; hadToolCalls: boolean } }
    | { type: 'state_change';      payload: AgentStateEvent }
    | { type: 'auth_request';      payload: { requestId: string; toolName: string; args: Record<string, any>; reason: string } }
    | { type: 'steering_detected'; payload: { newMessage: string; skippedTools: string[] } }
    | { type: 'agent_end';         payload: { totalSteps: number; newMessages: ChatMessage[] } }
    | { type: 'error';             payload: { message: string; category?: ErrorCategory } };

export type AgentEventType = AgentEvent['type'];
