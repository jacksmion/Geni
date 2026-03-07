/**
 * IChatModel.ts - 统一的 LLM 交互接口
 * 
 * Phase 2.1: 认知层抽象
 * 
 * 设计目标:
 * - 提供统一的 LLM 交互接口，支持无缝切换模型提供商
 * - 规范化消息格式 (ChatMessage) 和流式事件 (ChatStreamEvent)
 * - 支持 User/Assistant/System/Tool 四种消息角色
 */

// Re-export unified types from common (Single Source of Truth)
import type { ChatMessageRole, ChatMessage, ToolCall } from '../../../common/types/chat';
export type { ChatMessageRole, ChatMessage, ToolCall };

// ============================================================================
// 流式事件类型定义
// ============================================================================

/**
 * 流式事件类型枚举
 */
export type ChatStreamEventType =
    | 'content_delta'      // 文本内容增量
    | 'reasoning_delta'    // 推理内容增量
    | 'tool_call_delta'    // 工具调用增量
    | 'message_start'      // 消息开始
    | 'message_end'        // 消息结束
    | 'error';             // 错误

/**
 * 文本内容增量事件
 */
export interface ContentDeltaEvent {
    type: 'content_delta';
    /** 增量文本内容 */
    delta: string;
}

/**
 * 推理内容增量事件
 */
export interface ReasoningDeltaEvent {
    type: 'reasoning_delta';
    /** 增量推理内容 */
    delta: string;
}

/**
 * 工具调用增量事件
 */
export interface ToolCallDeltaEvent {
    type: 'tool_call_delta';
    /** 工具调用索引 (用于并行工具调用) */
    index: number;
    /** 工具调用 ID (可能只在第一个 chunk 中出现) */
    id?: string;
    /** 函数名称 (可能只在第一个 chunk 中出现) */
    name?: string;
    /** 参数增量 (JSON 字符串片段) */
    arguments_delta?: string;
}

/**
 * 消息开始事件
 */
export interface MessageStartEvent {
    type: 'message_start';
    /** 消息 ID (如果提供商支持) */
    message_id?: string;
}

/**
 * 消息结束事件
 */
export interface MessageEndEvent {
    type: 'message_end';
    /** 停止原因 */
    stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
    /** Token 使用统计 */
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * 错误事件
 */
export interface ErrorEvent {
    type: 'error';
    /** 错误信息 */
    error: {
        message: string;
        code?: string;
    };
}

/**
 * 统一流式事件类型
 */
export type ChatStreamEvent =
    | ContentDeltaEvent
    | ReasoningDeltaEvent
    | ToolCallDeltaEvent
    | MessageStartEvent
    | MessageEndEvent
    | ErrorEvent;

// ============================================================================
// 工具定义类型
// ============================================================================

/**
 * 工具定义 (用于 LLM)
 */
export interface ChatModelToolDefinition {
    /** 工具类型 */
    type: 'function';
    function: {
        /** 函数名称 */
        name: string;
        /** 函数描述 */
        description: string;
        /** 参数 Schema (JSON Schema 格式) */
        parameters: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
            [key: string]: any;
        };
    };
}

// ============================================================================
// 模型选项
// ============================================================================

/**
 * ChatModel 调用选项
 */
export interface ChatModelOptions {
    /** 模型名称 (覆盖默认配置) */
    model?: string;
    /** 温度参数 */
    temperature?: number;
    /** 最大输出 Token 数 */
    max_tokens?: number;
    /** 可用工具列表 */
    tools?: ChatModelToolDefinition[];
    /** 工具选择策略 */
    tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
    /** 中断信号 */
    signal?: AbortSignal;
}

// ============================================================================
// 核心接口
// ============================================================================

/**
 * 统一的 LLM 交互接口
 * 
 * 所有 LLM 提供商适配器都必须实现此接口。
 * 这允许 AgentRuntime 无缝切换不同的模型提供商。
 */
export interface IChatModel {
    /**
     * 提供商标识符
     * 例如: 'openai', 'anthropic', 'deepseek'
     */
    readonly providerId: string;

    /**
     * 获取当前配置的模型名称
     */
    readonly modelName: string;

    /**
     * 流式调用 LLM
     * 
     * @param messages - 消息列表
     * @param options - 可选参数
     * @returns 异步生成器，产出 ChatStreamEvent
     */
    stream(
        messages: ChatMessage[],
        options?: ChatModelOptions
    ): AsyncGenerator<ChatStreamEvent>;

    /**
     * 获取提供商支持的模型列表 (可选)
     * 
     * @returns 模型名称列表
     */
    fetchModels?(): Promise<string[]>;

    /**
     * 非流式调用 LLM (可选实现)
     * 
     * 默认实现可以通过收集 stream() 的所有事件来完成。
     * 某些提供商可能有更高效的非流式 API。
     * 
     * @param messages - 消息列表
     * @param options - 可选参数
     * @returns 完整的助手消息
     */
    invoke?(
        messages: ChatMessage[],
        options?: ChatModelOptions
    ): Promise<ChatMessage>;
}

// ============================================================================
// 工厂函数类型
// ============================================================================

/**
 * ChatModel 配置
 */
export interface ChatModelConfig {
    /** API Key */
    apiKey: string;
    /** Base URL (可选，用于自定义端点) */
    baseUrl?: string;
    /** 默认模型名称 */
    model: string;
    /** 默认温度 */
    temperature?: number;
}

/**
 * ChatModel 工厂函数类型
 */
export type ChatModelFactory = (config: ChatModelConfig) => IChatModel;
