export type MessageRole = 'user' | 'assistant' | 'system';

export interface AgentStep {
    thought?: string;
    tool?: string;
    toolInput?: string;
    observation?: string;
    isComplete: boolean;
    duration?: number; // 耗时(毫秒)
}

export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string;
    steps?: AgentStep[];
    timestamp: number;
    isError?: boolean;
}

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
}
