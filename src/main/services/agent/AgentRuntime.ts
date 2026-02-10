/**
 * AgentRuntime.ts - Agent 运行时核心实现
 * 
 * 重构说明:
 * - 原文件: OpenAIAgentService.ts
 * - 此文件实现 Agent 的核心执行循环 (Agentic Loop)
 * 
 * Phase 1 重构完成:
 *  ✅ 1.1 修复并行工具调用 (toolCallBuffer -> Map<number, ToolCallAccumulator>)
 *  ✅ 1.2 提取 PromptBuilder (解耦上下文构建)
 *  ✅ 1.3 引入显式状态机
 *  ✅ 1.4 实现工具执行拦截
 * 
 * Phase 2 重构完成:
 *  ✅ 2.1 定义 IChatModel 接口
 *  ✅ 2.2 实现 OpenAIAdapter
 *  ✅ 2.3 实现 AnthropicAdapter
 *  ✅ 集成 IChatModel 到 AgentRuntime
 */

import { IAgentService, AgentRunOptions, AgentRunResult } from './IAgent';
import { ITool } from '../../../common/types/tool';
import { ToolRegistry } from '../tools/ToolRegistry';
import { AppSettings, DEFAULT_PROVIDER_CONFIGS } from '../../../common/types/settings';
import { PromptBuilder, AgentContext } from './PromptBuilder';
import { AgentState, AgentStateManager, AgentStateEvent } from './state/AgentState';
import { ToolGuard, defaultToolGuard, ToolExecutionRequest, AuthorizationDecision, UserApprovalContext } from './ToolGuard';
import { ContextManager } from './ContextManager';
import { Summarizer } from './Summarizer';

// Phase 2: 认知层抽象
import {
    IChatModel,
    ChatMessage,
    ChatStreamEvent,
    ChatModelOptions,
    ChatModelToolDefinition,
    createChatModel,
} from '../llm';

/**
 * 工具调用累加器 - 用于处理流式传输中的并行工具调用
 * 
 * Phase 1.1: 解决 OpenAI 流式返回交叉多工具调用的问题
 * 例如: index 0 chunk, index 1 chunk, index 0 chunk...
 */
interface ToolCallAccumulator {
    id: string;
    name: string;
    arguments: string;
    type: string;
}

/**
 * Agent 运行时扩展选项
 */
export interface AgentRuntimeOptions extends AgentRunOptions {
    /** 状态变更回调 */
    onStateChange?: (event: AgentStateEvent) => void;
    /** 授权请求回调（用于敏感工具操作） */
    onAuthorizationRequired?: (
        request: ToolExecutionRequest,
        decision: AuthorizationDecision
    ) => Promise<UserApprovalContext>;
    /** Max tokens for context (Phase 4) */
    maxContextTokens?: number;
}

export class AgentRuntime implements IAgentService {
    private settings: AppSettings;
    private toolRegistry: ToolRegistry;
    private promptBuilder: PromptBuilder;
    private stateManager: AgentStateManager;
    private toolGuard: ToolGuard;

    constructor(settings: AppSettings, toolRegistry: ToolRegistry) {
        this.settings = settings;
        this.toolRegistry = toolRegistry;
        this.promptBuilder = new PromptBuilder();
        this.stateManager = new AgentStateManager();
        this.toolGuard = defaultToolGuard;
    }

    public updateSettings(settings: AppSettings) {
        this.settings = settings;
    }

    /**
     * 设置状态变更回调
     */
    public setStateChangeCallback(callback: (event: AgentStateEvent) => void): void {
        this.stateManager = new AgentStateManager(callback);
    }

    /**
     * 设置授权请求回调
     */
    public setAuthorizationCallback(
        callback: (request: ToolExecutionRequest, decision: AuthorizationDecision) => Promise<UserApprovalContext>
    ): void {
        this.toolGuard.setAuthorizationCallback(callback);
    }

    /**
     * 获取当前 Agent 状态
     */
    public getState(): AgentState {
        return this.stateManager.getState();
    }

    async run(
        prompt: string,
        tools: ITool[],
        options?: AgentRuntimeOptions,
        onStream?: (chunk: string, reset?: boolean) => void,
        onStepUpdate?: (steps: any[]) => void
    ): Promise<AgentRunResult> {
        // 初始化状态回调
        if (options?.onStateChange) {
            this.stateManager = new AgentStateManager(options.onStateChange);
        }
        if (options?.onAuthorizationRequired) {
            this.toolGuard.setAuthorizationCallback(options.onAuthorizationRequired);
        }

        // 转换到 Thinking 状态
        this.stateManager.transition(AgentState.Thinking, 'Starting agent execution');

        // 获取当前激活的提供商配置（兼容旧配置结构）
        const activeProvider = this.settings.llm.activeProvider || 'OpenAI';
        const providers = this.settings.llm.providers || {};
        const providerConfig = providers[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider] || DEFAULT_PROVIDER_CONFIGS['OpenAI'];

        // Phase 2: 使用 IChatModel 抽象层替代直接的 OpenAI 调用
        const chatModel: IChatModel = createChatModel(activeProvider, {
            apiKey: providerConfig.apiKey || '',
            baseUrl: providerConfig.baseUrl,
            model: options?.model || providerConfig.model,
            temperature: providerConfig.temperature,
        });

        // 1. Convert ITool[] to ChatModelToolDefinition[] (统一格式)
        const chatModelTools: ChatModelToolDefinition[] = tools.map(t => {
            const def = t.getDefinition();
            return {
                type: 'function' as const,
                function: {
                    name: def.name,
                    description: def.description,
                    parameters: def.input_schema
                }
            };
        });

        // 2. 使用 PromptBuilder 构建 System Prompt (Phase 1.2)
        const agentContext: AgentContext = {
            basePrompt: options?.systemPrompt,
            workspacePath: this.settings.workspacePath,
            skills: options?.skills,
            includeMethodology: true
        };
        const systemPrompt = this.promptBuilder.buildSystemPrompt(agentContext);

        // 使用 ChatMessage 类型的消息数组
        let messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt }
        ];

        // 注入历史记录
        if (options?.history && options.history.length > 0) {
            options.history.forEach((h: any) => {
                messages.push({
                    role: h.role as 'user' | 'assistant' | 'system' | 'tool',
                    content: h.content || null,
                    tool_calls: h.tool_calls,
                    tool_call_id: h.tool_call_id,
                });
            });
        }

        // 添加当前用户输入
        const userMsg: ChatMessage = { role: 'user', content: prompt };

        // 检查历史记录中是否已经包含这个消息（避免重复注入上下文）
        const lastHistoryMsg = messages[messages.length - 1];
        const isDuplicateInContext = lastHistoryMsg &&
            lastHistoryMsg.role === 'user' &&
            lastHistoryMsg.content === prompt;

        if (!isDuplicateInContext) {
            messages.push(userMsg);
        }

        const newMessages: ChatMessage[] = []; // 只追踪本次运行产生的新消息（不包含初始 Prompt，因为它已被调用方自行保存）

        const steps: any[] = [];
        let finalAnswer = '';
        let loopCount = 0;
        const MAX_LOOPS = 50;

        try {
            while (loopCount < MAX_LOOPS) {
                // Check Abort
                if (options?.signal?.aborted) {
                    this.stateManager.transition(AgentState.Aborted, 'Execution aborted by user');
                    throw new Error('Agent execution aborted by user.');
                }

                // 每个回合开始时，通知渲染进程重置内容缓冲区
                onStream?.('', true);

                loopCount++;

                // 转换到 Thinking 状态
                this.stateManager.transition(AgentState.Thinking, `Loop ${loopCount}: Calling LLM`);

                // --- Context Management (Phase 4) ---

                // 1. Auto-Summarization (New Feature)
                // Check if we effectively need to summarize before strict pruning
                const maxTokens = options?.maxContextTokens || 32000;
                if (Summarizer.shouldSummarize(messages, maxTokens)) {
                    this.stateManager.transition(AgentState.Thinking, 'Summarizing conversation history...');
                    const summarizer = new Summarizer();
                    try {
                        // Attempt to summarize using the same ChatModel
                        messages = await summarizer.summarize(messages, chatModel);
                        // Note: We update the local 'messages' working copy. 
                        // The 'newMessages' array still tracks only the *new* turns from this run, 
                        // maintaining the "append-only" contract for the caller.
                    } catch (err) {
                        console.warn('[AgentRuntime] Summarization failed, falling back to pruning:', err);
                    }
                }

                // 2. Strict Window Pruning
                // Ensure we absolutely fit within limits even after (or without) summarization
                const contextManager = new ContextManager({
                    maxTokens: maxTokens,
                    preserveRecentMessages: 20
                });

                // Prune messages to fit context window
                // Note: We use a local variable for the context to send to LLM
                const contextMessages = contextManager.prune(messages);


                // --- Step 1: Call LLM via IChatModel ---
                const chatModelOptions: ChatModelOptions = {
                    model: options?.model || providerConfig.model,
                    temperature: providerConfig.temperature,
                    tools: chatModelTools.length > 0 ? chatModelTools : undefined,
                    tool_choice: chatModelTools.length > 0 ? 'auto' : undefined,
                    signal: options?.signal,
                };

                // 转换到 ExecutingHelper 状态（处理流式输出）
                this.stateManager.transition(AgentState.ExecutingHelper, 'Processing LLM stream');

                const currentLoopSteps: any[] = [];
                let currentContent = '';
                let currentReasoning = '';
                let isReasoning = false;

                /**
                 * Phase 1.1: 修复并行工具调用
                 * 使用 Map<number, ToolCallAccumulator> 替代单个 toolCallBuffer
                 * 以正确处理流式返回的交叉多工具调用
                 */
                const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

                // Phase 2: 使用统一的 IChatModel.stream() 接口
                for await (const event of chatModel.stream(contextMessages, chatModelOptions)) {
                    switch (event.type) {
                        case 'content_delta':
                            // 如果是从推理状态切换回内容状态，添加结束标记
                            if (isReasoning) {
                                isReasoning = false;
                                onStream?.('\n```\n\n');
                            }
                            currentContent += event.delta;
                            onStream?.(event.delta);
                            break;

                        case 'reasoning_delta':
                            // 处理推理内容
                            if (!isReasoning) {
                                isReasoning = true;
                                onStream?.('```thinking\n');
                            }
                            // 为每一行添加引用标记 (简单的处理方式，流式可能不如完整处理完美，但足够好用)
                            // 这里简单直接输出，依靠前端 markdown 渲染或用户理解
                            // 若要完美 markdown blockquote，需处理换行。这里简化处理。
                            // 实际体验：通常 reasoning 是一大段，直接输出即可。
                            currentReasoning += event.delta;
                            onStream?.(event.delta);
                            break;

                        case 'tool_call_delta':
                            // 处理工具调用增量
                            const index = event.index;

                            if (!toolCallAccumulators.has(index)) {
                                toolCallAccumulators.set(index, {
                                    id: event.id || '',
                                    name: event.name || '',
                                    arguments: '',
                                    type: 'function'
                                });
                            }

                            const accumulator = toolCallAccumulators.get(index)!;

                            if (event.id) {
                                accumulator.id = event.id;
                            }
                            if (event.name) {
                                accumulator.name = event.name;
                            }
                            if (event.arguments_delta) {
                                accumulator.arguments += event.arguments_delta;
                            }
                            break;

                        case 'error':
                            throw new Error(event.error.message);
                    }
                }

                // 将 Map 转换为工具调用数组
                const toolCalls = Array.from(toolCallAccumulators.values()).map(acc => ({
                    id: acc.id,
                    type: 'function' as const,
                    function: {
                        name: acc.name,
                        arguments: acc.arguments
                    }
                }));

                const assistantMsg: ChatMessage = {
                    role: 'assistant',
                    content: currentContent || null,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                    steps: currentLoopSteps
                };
                messages.push(assistantMsg);
                newMessages.push(assistantMsg);

                // --- Step 2: Handle Tool Calls ---
                if (toolCalls.length > 0) {
                    // 转换到 ExecutingTool 状态
                    this.stateManager.transition(
                        AgentState.ExecutingTool,
                        `Executing ${toolCalls.length} tool(s)`,
                        { toolCount: toolCalls.length }
                    );

                    for (const tc of toolCalls) {
                        const fnName = tc.function.name;
                        let fnArgs = {};
                        try {
                            fnArgs = JSON.parse(tc.function.arguments);
                        } catch (e) {
                            console.error('Failed to parse tool args JSON:', tc.function.arguments);
                        }

                        // 获取工具实例
                        const tool = tools.find(t => t.getDefinition().name === fnName);

                        // Phase 1.4: 工具执行拦截 - 检查授权
                        if (tool) {
                            const requestId = Math.random().toString(36).substring(7);

                            const executionRequest: ToolExecutionRequest = {
                                requestId,
                                toolName: fnName,
                                definition: tool.getDefinition(),
                                args: fnArgs,
                                tool
                            };

                            // 获取信任级别评估
                            const decision = this.toolGuard.evaluateRequest(executionRequest);

                            // 如果需要授权，先创建一个等待状态的 Step，让前端展示确认界面
                            if (decision.requiresUserConfirmation) {
                                const authStep = {
                                    thought: currentReasoning || currentContent,
                                    tool: fnName,
                                    toolInput: JSON.stringify(fnArgs),
                                    isComplete: false,
                                    isWaitingAuthorization: true,
                                    authRequestId: requestId,
                                    authReason: decision.reason
                                };
                                steps.push(authStep);
                                currentLoopSteps.push(authStep);
                                onStepUpdate?.([...steps]);

                                const isAuthorized = await this.toolGuard.checkAuthorization(executionRequest);

                                if (!isAuthorized) {
                                    // 用户拒绝授权，更新当前 Step 状态
                                    const lastStep = steps[steps.length - 1];
                                    lastStep.isWaitingAuthorization = false;
                                    lastStep.observation = '[Authorization Denied by User]';
                                    lastStep.isComplete = true;
                                    lastStep.duration = 0;
                                    onStepUpdate?.([...steps]);

                                    const toolResultMsg: ChatMessage = {
                                        role: 'tool',
                                        tool_call_id: tc.id,
                                        content: `[Authorization Denied] User declined to execute tool "${fnName}". Please proceed with an alternative approach or ask for permission.`
                                    };
                                    messages.push(toolResultMsg);
                                    newMessages.push(toolResultMsg);
                                    continue;
                                }

                                // 授权通过，将当前等待状态的 Step 更新为执行状态，移除授权标记
                                const currentStep = steps[steps.length - 1];
                                currentStep.isWaitingAuthorization = false;
                                onStepUpdate?.([...steps]);
                            }
                        }

                        const startTime = Date.now();

                        // 转换到 ExecutingTool 状态，并带上当前工具名称
                        this.stateManager.transition(
                            AgentState.ExecutingTool,
                            `Executing tool: ${fnName}`,
                            { tool: fnName }
                        );

                        // 检查是否已经存在当前工具的 Step（如果是刚刚授权通过的，则复用）
                        let step = steps.find(s => s.tool === fnName && !s.isComplete);

                        if (!step) {
                            step = {
                                thought: currentReasoning || currentContent,
                                tool: fnName,
                                toolInput: JSON.stringify(fnArgs),
                                isComplete: false
                            };
                            steps.push(step);
                            currentLoopSteps.push(step);
                        }
                        onStepUpdate?.([...steps]);

                        const result = await this.toolRegistry.executeTool(fnName, fnArgs);
                        const duration = Date.now() - startTime;

                        const MAX_OUTPUT_LENGTH = 2000;
                        let observation = result.result;
                        if (observation && observation.length > MAX_OUTPUT_LENGTH) {
                            observation = observation.substring(0, MAX_OUTPUT_LENGTH) +
                                `\n... [Content truncated (length: ${observation.length}). Output is too large to fit in context.]`;
                        }

                        if (result.isError) {
                            observation += `\n\n[System Note]: The previous tool execution failed. Please analyze the error and try a different approach.`;
                        }

                        const toolResultMsg: ChatMessage = {
                            role: 'tool',
                            tool_call_id: tc.id,
                            content: observation
                        };
                        messages.push(toolResultMsg);
                        newMessages.push(toolResultMsg);

                        const lastStep = steps[steps.length - 1];
                        lastStep.observation = observation;
                        lastStep.isComplete = true;
                        lastStep.duration = duration;
                        onStepUpdate?.([...steps]);
                    }
                } else {
                    // No tool calls -> Done!
                    finalAnswer = currentContent;
                    this.stateManager.transition(AgentState.Idle, 'Execution completed');
                    break;
                }
            }

            if (loopCount >= MAX_LOOPS) {
                const warningMsg = `\n\n---\n⚠️ **Agent 达到最大执行步数限制 (${MAX_LOOPS} 步)**\n请发送消息让 Agent 继续。`;
                finalAnswer = (finalAnswer || '') + warningMsg;
                onStream?.(warningMsg);
                this.stateManager.transition(AgentState.Idle, 'Max loops reached');
            }

        } catch (error: any) {
            console.error('[AgentRuntime] Error:', error);
            this.stateManager.transition(AgentState.Error, error.message);
            return {
                finalAnswer: `Error: ${error.message}`,
                steps,
                newMessages
            };
        }

        return { finalAnswer, steps, newMessages };
    }
}

// 向后兼容: 保留旧类名导出别名
export { AgentRuntime as OpenAIAgentService };
