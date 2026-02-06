export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface AgentStep {
    thought?: string;
    tool?: string;
    toolInput?: string;
    observation?: string;
    isComplete: boolean;
    duration?: number; // 耗时(毫秒)
}

/**
 * Enhanced Tool Call for storage and UI
 */
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string | null;
    timestamp: number;
    // LLM Specific
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    // UI Specific
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
