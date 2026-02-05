export type MessageRole = 'user' | 'assistant' | 'system' | 'thought' | 'action' | 'observation';

export interface Message {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: number;
    metadata?: {
        toolName?: string;
        toolArgs?: any;
        status?: 'thinking' | 'acting' | 'complete' | 'error';
    };
}

export interface AgentContext {
    messages: Message[];
    activeTools: string[]; // Enabled skill IDs
}
