export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
/** Alias for backward compatibility with LLM layer */
export type ChatMessageRole = MessageRole;

export interface AgentStep {
    thought?: string;
    tool?: string;
    toolInput?: string;
    observation?: string;
    isComplete: boolean;
    duration?: number; // 耗时(毫秒)
    isError?: boolean;
    // Authorization state
    isWaitingAuthorization?: boolean;
    authRequestId?: string;
    authReason?: string;
}

/**
 * Unified Tool Call format
 */
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

/**
 * Unified ChatMessage format
 *
 * Used across all layers:
 * - LLM layer: wire format for API communication (id/timestamp not needed)
 * - Agent layer: runtime processing
 * - Session layer: persistence (id/timestamp required)
 * - UI layer: display (id/timestamp required)
 */
export interface ChatMessage {
    id?: string;
    role: MessageRole;
    content: string | null;
    timestamp?: number;
    // LLM Specific
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    reasoning_content?: string;
    // Agent / UI Specific
    steps?: AgentStep[];
    isError?: boolean;
}

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
    // Metadata
    activeSkillIds?: string[];
    variables?: Record<string, any>;
}

export interface SessionMeta {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    preview?: string;
}
