/**
 * Agent - 纯配置对象（不可变，可序列化）
 *
 * Agent 是三层架构的最顶层：
 * Agent（是什么）→ Runtime（怎么跑）→ Executor（怎么想）
 */

export interface Agent {
    id: string;
    name: string;

    // Brain
    modelId: string;             // 格式: 'provider/model'，如 'openai/gpt-4o'
    systemPrompt?: string;
    temperature?: number;

    // Capabilities
    skillIds?: string[];
    allowedTools?: string[];     // undefined = 全部工具；支持通配符：'github/*'
}

export enum ErrorCategory {
    Network = 'network',
    RateLimit = 'rate_limit',
    Authentication = 'auth',
    ToolExecution = 'tool',
    TokenLimit = 'token_limit',
    Unknown = 'unknown',
    Aborted = 'aborted'
}
