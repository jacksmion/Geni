/**
 * LLM 服务模块导出
 * 
 * Phase 2: 认知层抽象
 */

// 核心接口和类型
export type {
    IChatModel,
    ChatMessage,
    ChatMessageRole,
    ChatStreamEvent,
    ChatStreamEventType,
    ChatModelOptions,
    ChatModelConfig,
    ChatModelToolDefinition,
    ToolCall,
    ContentDeltaEvent,
    ToolCallDeltaEvent,
    MessageStartEvent,
    MessageEndEvent,
    ErrorEvent,
} from './IChatModel';

// 工厂
export { createChatModel, ChatModelManager, chatModelManager } from './ChatModelFactory';
export type { SupportedProvider } from './ChatModelFactory';

// 适配器 (通常不需要直接使用，通过工厂创建)
export { OpenAIAdapter, createOpenAIAdapter } from './providers/OpenAIAdapter';
export { AnthropicAdapter, createAnthropicAdapter } from './providers/AnthropicAdapter';
