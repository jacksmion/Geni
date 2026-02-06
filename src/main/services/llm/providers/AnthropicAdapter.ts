/**
 * AnthropicAdapter.ts - Anthropic SDK 适配器
 * 
 * Phase 2.3: 认知层抽象
 * 
 * 功能:
 * - 实现 IChatModel 接口
 * - 集成 @anthropic-ai/sdk
 * - 适配 Claude 3.5 Sonnet 的 Tool Use 格式
 * - 确保 stream 输出与 OpenAI Adapter 保持一致
 * 
 * 注意: 需要安装依赖: npm install @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
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
 * Anthropic 适配器
 * 
 * 将 Anthropic SDK 封装为统一的 IChatModel 接口
 */
export class AnthropicAdapter implements IChatModel {
    readonly providerId = 'anthropic';
    readonly modelName: string;

    private client: Anthropic;
    private config: ChatModelConfig;

    constructor(config: ChatModelConfig) {
        this.config = config;
        this.modelName = config.model;

        this.client = new Anthropic({
            apiKey: config.apiKey || '',
            baseURL: config.baseUrl, // Anthropic SDK 也支持自定义 baseURL
        });
    }

    /**
     * 流式调用 Anthropic API
     */
    async *stream(
        messages: ChatMessage[],
        options?: ChatModelOptions
    ): AsyncGenerator<ChatStreamEvent> {
        // 分离 system 消息和其他消息
        const { systemPrompt, anthropicMessages } = this.convertMessages(messages);

        // 转换工具定义为 Anthropic 格式
        const anthropicTools = options?.tools?.map(t => this.convertToolDefinition(t));

        try {
            // 发送消息开始事件
            yield { type: 'message_start' };

            // 创建流式请求
            const stream = await this.client.messages.stream({
                model: options?.model || this.config.model,
                max_tokens: options?.max_tokens || 4096,
                system: systemPrompt || undefined,
                messages: anthropicMessages,
                ...(options?.temperature !== undefined && { temperature: options.temperature }),
                ...(anthropicTools && anthropicTools.length > 0 && {
                    tools: anthropicTools,
                    tool_choice: this.convertToolChoice(options?.tool_choice),
                }),
            }, {
                signal: options?.signal,
            });

            // 用于跟踪当前工具调用的状态
            let currentToolCallIndex = -1;
            const toolCallMap = new Map<string, number>(); // tool_use_id -> index

            // 处理流式事件
            for await (const event of stream) {
                switch (event.type) {
                    case 'content_block_start':
                        if (event.content_block.type === 'tool_use') {
                            currentToolCallIndex++;
                            toolCallMap.set(event.content_block.id, currentToolCallIndex);

                            // 发送工具调用开始事件
                            yield {
                                type: 'tool_call_delta',
                                index: currentToolCallIndex,
                                id: event.content_block.id,
                                name: event.content_block.name,
                            };
                        }
                        break;

                    case 'content_block_delta':
                        if (event.delta.type === 'text_delta') {
                            yield {
                                type: 'content_delta',
                                delta: event.delta.text,
                            };
                        } else if (event.delta.type === 'input_json_delta') {
                            // Anthropic 的工具调用参数增量
                            // 需要找到对应的工具调用索引
                            const index = currentToolCallIndex;
                            if (index >= 0) {
                                yield {
                                    type: 'tool_call_delta',
                                    index,
                                    arguments_delta: event.delta.partial_json,
                                };
                            }
                        }
                        break;

                    case 'message_delta':
                        // 消息结束
                        yield {
                            type: 'message_end',
                            stop_reason: this.mapStopReason(event.delta.stop_reason),
                            usage: event.usage ? {
                                prompt_tokens: 0, // Anthropic 在 message_start 中提供
                                completion_tokens: event.usage.output_tokens,
                                total_tokens: event.usage.output_tokens,
                            } : undefined,
                        };
                        break;

                    case 'message_start':
                        // 可以从这里获取 usage.input_tokens
                        // 但为了简化，我们在 message_end 中处理
                        break;
                }
            }
        } catch (error: any) {
            // 处理中断
            if (error.name === 'AbortError' || error.message?.includes('abort')) {
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
                    code: error.status?.toString() || error.error?.type,
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
                case 'tool_call_delta':
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
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        };
    }

    /**
     * 转换消息格式
     * 
     * Anthropic API 的消息格式与 OpenAI 不同:
     * - system 消息需要单独传递
     * - tool 消息需要转换为 tool_result 格式
     * - assistant 消息中的工具调用需要转换为 tool_use content block
     */
    private convertMessages(messages: ChatMessage[]): {
        systemPrompt: string | null;
        anthropicMessages: Anthropic.Messages.MessageParam[];
    } {
        let systemPrompt: string | null = null;
        const anthropicMessages: Anthropic.Messages.MessageParam[] = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                // 累积所有 system 消息
                systemPrompt = systemPrompt
                    ? `${systemPrompt}\n\n${msg.content}`
                    : (msg.content || '');
                continue;
            }

            if (msg.role === 'user') {
                anthropicMessages.push({
                    role: 'user',
                    content: msg.content || '',
                });
            } else if (msg.role === 'assistant') {
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                    // Assistant 消息包含工具调用
                    const content: Anthropic.Messages.ContentBlockParam[] = [];

                    // 如果有文本内容，先添加
                    if (msg.content) {
                        content.push({
                            type: 'text',
                            text: msg.content,
                        });
                    }

                    // 添加工具调用
                    for (const tc of msg.tool_calls) {
                        let parsedInput = {};
                        try {
                            parsedInput = JSON.parse(tc.function.arguments);
                        } catch {
                            // 如果解析失败，保持空对象
                        }

                        content.push({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.function.name,
                            input: parsedInput,
                        });
                    }

                    anthropicMessages.push({
                        role: 'assistant',
                        content,
                    });
                } else {
                    anthropicMessages.push({
                        role: 'assistant',
                        content: msg.content || '',
                    });
                }
            } else if (msg.role === 'tool') {
                // Tool 消息需要作为 user 消息，包含 tool_result 块
                // 但需要合并连续的 tool 结果
                const lastMsg = anthropicMessages[anthropicMessages.length - 1];

                const toolResultBlock: Anthropic.Messages.ToolResultBlockParam = {
                    type: 'tool_result',
                    tool_use_id: msg.tool_call_id || '',
                    content: msg.content || '',
                };

                if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
                    // 合并到上一个 user 消息
                    (lastMsg.content as Anthropic.Messages.ContentBlockParam[]).push(toolResultBlock);
                } else {
                    // 创建新的 user 消息
                    anthropicMessages.push({
                        role: 'user',
                        content: [toolResultBlock],
                    });
                }
            }
        }

        return { systemPrompt, anthropicMessages };
    }

    /**
     * 转换工具定义为 Anthropic 格式
     */
    private convertToolDefinition(tool: ChatModelToolDefinition): Anthropic.Messages.Tool {
        return {
            name: tool.function.name,
            description: tool.function.description,
            input_schema: {
                type: 'object',
                properties: tool.function.parameters.properties,
                required: tool.function.parameters.required,
            },
        };
    }

    /**
     * 转换工具选择策略
     */
    private convertToolChoice(
        choice?: ChatModelOptions['tool_choice']
    ): Anthropic.Messages.ToolChoice | undefined {
        if (!choice) return { type: 'auto' };

        if (typeof choice === 'string') {
            switch (choice) {
                case 'auto':
                    return { type: 'auto' };
                case 'none':
                    // Anthropic 没有直接的 'none' 选项，可以通过不传工具实现
                    return undefined;
                case 'required':
                    return { type: 'any' };
                default:
                    return { type: 'auto' };
            }
        }

        // 指定特定工具
        if (choice.type === 'function' && choice.function?.name) {
            return {
                type: 'tool',
                name: choice.function.name,
            };
        }

        return { type: 'auto' };
    }

    /**
     * 映射停止原因
     */
    private mapStopReason(
        reason?: Anthropic.Messages.MessageDeltaEvent['delta']['stop_reason']
    ): 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | undefined {
        switch (reason) {
            case 'end_turn':
                return 'end_turn';
            case 'tool_use':
                return 'tool_use';
            case 'max_tokens':
                return 'max_tokens';
            case 'stop_sequence':
                return 'stop_sequence';
            default:
                return undefined;
        }
    }
}

/**
 * 创建 Anthropic 适配器的工厂函数
 */
export function createAnthropicAdapter(config: ChatModelConfig): IChatModel {
    return new AnthropicAdapter(config);
}
