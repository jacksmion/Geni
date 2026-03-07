/**
 * OpenAIAdapter.ts - OpenAI SDK 适配器
 * 
 * Phase 2.2: 认知层抽象
 * 
 * 功能:
 * - 实现 IChatModel 接口
 * - 封装 OpenAI SDK 实例
 * - 将 OpenAI 的 chunk 格式转换为标准的 ChatStreamEvent
 */

import OpenAI from 'openai';
import {
    IChatModel,
    ChatMessage,
    ChatStreamEvent,
    ChatModelOptions,
    ChatModelConfig,
    ChatModelToolDefinition,
    ToolCall,
} from '../IChatModel';

/**
 * OpenAI 适配器
 * 
 * 将 OpenAI SDK 封装为统一的 IChatModel 接口
 */
export class OpenAIAdapter implements IChatModel {
    readonly providerId = 'openai';
    readonly modelName: string;

    private client: OpenAI;
    private config: ChatModelConfig;

    constructor(config: ChatModelConfig) {
        this.config = config;
        this.modelName = config.model;

        this.client = new OpenAI({
            apiKey: config.apiKey || '',
            baseURL: config.baseUrl || 'https://api.openai.com/v1',
            dangerouslyAllowBrowser: true, // Running in Electron Node process
        });
    }

    /**
     * 获取提供商支持的模型列表
     */
    async fetchModels(): Promise<string[]> {
        try {
            const response = await this.client.models.list();
            // 过滤掉一些明显不是聊天模型的（如 whisper, dall-e, embedding 等）
            // 不同的 Provider 返回格式略有不同，这里做一个启发式过滤
            return response.data
                .map(m => m.id)
                .filter(id => {
                    const lowerId = id.toLowerCase();
                    return !lowerId.includes('whisper') && 
                           !lowerId.includes('dall-e') && 
                           !lowerId.includes('tts') && 
                           !lowerId.includes('embedding') &&
                           !lowerId.includes('moderation') &&
                           !lowerId.includes('edit') &&
                           !lowerId.includes('image');
                })
                .sort();
        } catch (error: any) {
            console.error(`[OpenAIAdapter] Failed to fetch models:`, error.message);
            throw error;
        }
    }

    /**
     * 流式调用 OpenAI API
     */
    async *stream(
        messages: ChatMessage[],
        options?: ChatModelOptions
    ): AsyncGenerator<ChatStreamEvent> {
        // 转换消息格式为 OpenAI 格式
        const openaiMessages = this.convertMessages(messages);

        // 转换工具定义为 OpenAI 格式
        const openaiTools = options?.tools?.map(t => ({
            type: 'function' as const,
            function: {
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
            },
        }));

        // 构建请求参数
        const requestParams: OpenAI.ChatCompletionCreateParamsStreaming = {
            model: options?.model || this.config.model,
            messages: openaiMessages as any,
            stream: true,
            ...(options?.temperature !== undefined && { temperature: options.temperature }),
            ...(options?.max_tokens !== undefined && { max_tokens: options.max_tokens }),
            ...(openaiTools && openaiTools.length > 0 && {
                tools: openaiTools,
                tool_choice: this.convertToolChoice(options?.tool_choice),
            }),
        };

        try {
            // 发送消息开始事件
            yield { type: 'message_start' };

            // 创建流式请求
            const stream = await this.client.chat.completions.create(requestParams, {
                signal: options?.signal,
            });

            // 处理流式响应
            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                const finishReason = chunk.choices[0]?.finish_reason;

                if (delta?.content) {
                    yield {
                        type: 'content_delta',
                        delta: delta.content,
                    };
                }

                // 处理推理内容 (DeepSeek R1 等)
                if ((delta as any)?.reasoning_content) {
                    yield {
                        type: 'reasoning_delta',
                        delta: (delta as any).reasoning_content,
                    };
                }

                // 处理工具调用
                if (delta?.tool_calls) {
                    for (const toolCallDelta of delta.tool_calls) {
                        yield {
                            type: 'tool_call_delta',
                            index: toolCallDelta.index,
                            id: toolCallDelta.id,
                            name: toolCallDelta.function?.name,
                            arguments_delta: toolCallDelta.function?.arguments,
                        };
                    }
                }

                // 检查是否结束
                if (finishReason) {
                    const usage = chunk.usage;
                    yield {
                        type: 'message_end',
                        stop_reason: this.mapFinishReason(finishReason),
                        usage: usage ? {
                            prompt_tokens: usage.prompt_tokens,
                            completion_tokens: usage.completion_tokens,
                            total_tokens: usage.total_tokens,
                        } : undefined,
                    };
                }
            }
        } catch (error: any) {
            // 处理中断
            if (error.name === 'AbortError') {
                yield {
                    type: 'error',
                    error: {
                        message: 'Request was aborted',
                        code: 'ABORTED',
                    },
                };
                return;
            }

            // 处理其他错误
            yield {
                type: 'error',
                error: {
                    message: error.message || 'Unknown error',
                    code: error.code || error.status?.toString(),
                },
            };
        }
    }

    /**
     * 非流式调用 (通过收集流式事件实现)
     */
    async invoke(
        messages: ChatMessage[],
        options?: ChatModelOptions
    ): Promise<ChatMessage> {
        let content = '';
        let reasoning_content = '';
        const toolCalls: ToolCall[] = [];
        const toolCallAccumulators = new Map<number, {
            id: string;
            name: string;
            arguments: string;
        }>();

        for await (const event of this.stream(messages, options)) {
            switch (event.type) {
                case 'content_delta':
                    content += event.delta;
                    break;
                case 'reasoning_delta':
                    reasoning_content += event.delta;
                    break;
                case 'tool_call_delta': {
                    if (!toolCallAccumulators.has(event.index)) {
                        toolCallAccumulators.set(event.index, {
                            id: event.id || '',
                            name: event.name || '',
                            arguments: '',
                        });
                    }
                    const acc = toolCallAccumulators.get(event.index)!;
                    if (event.id) acc.id = event.id;
                    if (event.name) acc.name = event.name;
                    if (event.arguments_delta) acc.arguments += event.arguments_delta;
                    break;
                }
                case 'error':
                    throw new Error(event.error.message);
            }
        }

        // 转换累积的工具调用
        for (const [_, acc] of toolCallAccumulators) {
            toolCalls.push({
                id: acc.id,
                type: 'function',
                function: {
                    name: acc.name,
                    arguments: acc.arguments,
                },
            });
        }

        return {
            role: 'assistant',
            content: content || null,
            reasoning_content: reasoning_content || undefined,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        };
    }

    /**
     * 转换消息格式
     */
    private convertMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
        return messages.map(msg => {
            const base: any = {
                role: msg.role,
                content: msg.content || '',
            };

            // 处理工具调用 (assistant 消息)
            if (msg.role === 'assistant' && msg.tool_calls) {
                base.tool_calls = msg.tool_calls.map(tc => ({
                    id: tc.id,
                    type: tc.type,
                    function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    },
                }));
            }

            // 处理工具结果 (tool 消息)
            if (msg.role === 'tool' && msg.tool_call_id) {
                base.tool_call_id = msg.tool_call_id;
            }

            return base;
        });
    }

    /**
     * 转换工具选择策略
     */
    private convertToolChoice(
        choice?: ChatModelOptions['tool_choice']
    ): OpenAI.ChatCompletionToolChoiceOption | undefined {
        if (!choice) return 'auto';
        if (typeof choice === 'string') return choice as any;
        return choice;
    }

    /**
     * 映射完成原因
     */
    private mapFinishReason(
        reason: string
    ): 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | undefined {
        switch (reason) {
            case 'stop':
                return 'end_turn';
            case 'tool_calls':
                return 'tool_use';
            case 'length':
                return 'max_tokens';
            case 'content_filter':
                return 'stop_sequence';
            default:
                return undefined;
        }
    }
}

/**
 * 创建 OpenAI 适配器的工厂函数
 */
export function createOpenAIAdapter(config: ChatModelConfig): IChatModel {
    return new OpenAIAdapter(config);
}
