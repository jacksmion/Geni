export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
/** Alias for backward compatibility with LLM layer */
export type ChatMessageRole = MessageRole;

export interface AgentStep {
    thought?: string;
    tool?: string;
    toolInput?: string;
    observation?: string;
    streamingObservation?: string;
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

// 多模态内容块 - 渐进式扩展
export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

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
    content: string | ContentPart[] | null;
    timestamp?: number;
    // LLM Specific
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    reasoning_content?: string;
    // Agent / UI Specific
    steps?: AgentStep[];
    isError?: boolean;
    usage?: import('./usage').TokenUsage;
}

export interface ChatSession {
    id: string;
    title: string;
    staffId?: string;              // 绑定的数字员工 ID
    modelId?: string;              // 任务级模型，e.g. "OpenAI/gpt-4o"
    workspacePath?: string;        // 任务级工作目录
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
    staffId?: string;
    modelId?: string;
    workspacePath?: string;
}
