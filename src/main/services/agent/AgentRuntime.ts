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

import { EventEmitter } from 'events';
import { IAgentService, AgentRunOptions, AgentRunResult, AgentStep } from './IAgent';
import { ITool } from '../../../common/types/tool';
import { ToolRegistry } from '../tools/ToolRegistry';
import { AppSettings, DEFAULT_PROVIDER_CONFIGS } from '../../../common/types/settings';
import { PromptBuilder } from './PromptBuilder';
import { AgentState, AgentStateManager, AgentStateEvent } from './state/AgentState';
import { ToolGuard, ToolExecutionRequest, AuthorizationDecision, UserApprovalContext } from './ToolGuard';
import { ContextManager } from './ContextManager';
import { TokenCounter } from './TokenCounter';
import { Summarizer } from './Summarizer';
import { withRetry, DEFAULT_LLM_RETRY, DEFAULT_TOOL_RETRY } from './RetryPolicy';
import { classifyError, ErrorCategory } from './ErrorClassifier';
import { MemoryStore } from '../memory/MemoryStore';
import { UsageManager } from '../usage/UsageManager';

// Phase 2: 认知层抽象
import {
    IChatModel,
    ChatMessage,
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
    /** Session identifier for tracking */
    sessionId?: string;
}

export class AgentRuntime implements IAgentService {
    private settings: AppSettings;
    private toolRegistry: ToolRegistry;
    private promptBuilder: PromptBuilder;
    private stateManager: AgentStateManager;
    private toolGuard: ToolGuard;
    private contextManager: ContextManager;
    private summarizer: Summarizer;
    private memoryStore: MemoryStore;
    private usageManager: UsageManager;
    private stateChangeCallback?: (event: AgentStateEvent) => void;

    constructor(settings: AppSettings, toolRegistry: ToolRegistry, memoryStore: MemoryStore, usageManager: UsageManager) {
        this.settings = settings;
        this.toolRegistry = toolRegistry;
        this.memoryStore = memoryStore;
        this.usageManager = usageManager;
        this.promptBuilder = new PromptBuilder({
            defaultBasePrompt: settings.systemPrompt
        });
        this.stateManager = new AgentStateManager();
        this.toolGuard = new ToolGuard(); // Use independent instance instead of global defaultToolGuard
        this.contextManager = new ContextManager({ maxTokens: 32000, preserveRecentMessages: 20 });
        this.summarizer = new Summarizer();
    }

    public updateSettings(settings: AppSettings) {
        this.settings = settings;
        if (settings.systemPrompt) {
            this.promptBuilder.updateConfig({ defaultBasePrompt: settings.systemPrompt });
        }
    }

    /**
     * 设置状态变更回调
     */
    public setStateChangeCallback(callback: (event: AgentStateEvent) => void): void {
        this.stateChangeCallback = callback;
        this.stateManager = new AgentStateManager(callback);
    }

    private authCallback?: (request: ToolExecutionRequest, decision: AuthorizationDecision) => Promise<UserApprovalContext>;

    /**
     * 设置授权请求回调
     */
    public setAuthorizationCallback(
        callback: (request: ToolExecutionRequest, decision: AuthorizationDecision) => Promise<UserApprovalContext>
    ): void {
        this.authCallback = callback;
        this.toolGuard.setAuthorizationCallback(callback);
    }

    /**
     * 获取当前 Agent 状态
     */
    public getState(): AgentState {
        return this.stateManager.getState();
    }

    public async run(
        prompt: string,
        tools: ITool[],
        options?: AgentRuntimeOptions,
        onStream?: (chunk: string, reset?: boolean) => void,
        onStepUpdate?: (steps: AgentStep[]) => void
    ): Promise<AgentRunResult> {
        // Create session-specific managers to ensure concurrency safety
        const sessionStateManager = new AgentStateManager(options?.onStateChange || this.stateChangeCallback);
        const sessionToolGuard = new ToolGuard(options?.onAuthorizationRequired || this.authCallback);

        // Update instance properties for potential external getState() calls
        this.stateManager = sessionStateManager;
        this.toolGuard = sessionToolGuard;

        sessionStateManager.transition(AgentState.Thinking, 'Starting agent execution');

        const chatModel = this.createChatModel(options);
        const chatModelTools = this.convertTools(tools);
        let messages = this.prepareMessages(prompt, options);
        const newMessages: ChatMessage[] = [];
        const steps: AgentStep[] = [];

        let loopCount = 0;
        const MAX_LOOPS = 50;

        try {
            while (loopCount++ < MAX_LOOPS) {
                const roundStartTime = performance.now();
                console.log(`\n[AgentPerf] ===== Loop ${loopCount} Start =====`);

                if (options?.signal?.aborted) throw new Error('Agent execution aborted by user.');
                onStream?.('', true);

                // 1. 上下文优化
                const optStartTime = performance.now();
                messages = await this.optimizeContext(messages, chatModel, sessionStateManager, options);
                console.log(`[AgentPerf] Context Optimization: ${(performance.now() - optStartTime).toFixed(2)}ms`);

                // 2. LLM 轮次执行
                sessionStateManager.transition(AgentState.Thinking, `Thinking...`);
                const { currentContent, currentReasoning, toolCalls, usage } = await this.executeLlmTurn(
                    messages, chatModel, chatModelTools, sessionStateManager, { ...options, sessionId: options?.sessionId || 'unknown' }, onStream,
                    (activeToolCalls, content, reasoning) => {
                        if (onStepUpdate) {
                            const tempSteps = [...steps];
                            for (const tc of activeToolCalls) {
                                tempSteps.push({
                                    thought: reasoning || content,
                                    tool: tc.name,
                                    toolInput: tc.arguments,
                                    observation: '',
                                    isComplete: false,
                                    isError: false
                                });
                            }
                            onStepUpdate(tempSteps);
                        }
                    }
                );

                const assistantMsg: ChatMessage = {
                    role: 'assistant',
                    content: currentContent || null,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                    usage: usage
                };
                messages.push(assistantMsg);
                newMessages.push(assistantMsg);

                // 记录 Token 消耗
                if (usage) {
                    this.recordUsageAtEnd(
                        options?.sessionId || 'unknown',
                        chatModel.modelName,
                        chatModel.providerId,
                        usage
                    );
                }

                // 3. 工具处理
                if (toolCalls.length > 0) {
                    await this.handleToolCalls(toolCalls, tools, messages, newMessages, steps, currentReasoning || currentContent, sessionStateManager, sessionToolGuard, options, onStepUpdate);
                } else {
                    console.log(`[AgentPerf] ===== Loop ${loopCount} Total: ${(performance.now() - roundStartTime).toFixed(2)}ms =====`);
                    return { finalAnswer: currentContent, steps, newMessages };
                }
                console.log(`[AgentPerf] ===== Loop ${loopCount} Total: ${(performance.now() - roundStartTime).toFixed(2)}ms =====`);
            }
            return this.handleMaxSteps(steps, newMessages, onStream);
        } catch (error: any) {
            return this.handleError(error, steps, newMessages, sessionStateManager);
        } finally {
            if (sessionStateManager.getState() !== AgentState.Aborted) {
                sessionStateManager.transition(AgentState.Idle, 'Execution finished');
            }
        }
    }

    private createChatModel(options?: AgentRuntimeOptions): IChatModel {
        const activeProvider = this.settings.llm.activeProvider || 'OpenAI';
        const providers = this.settings.llm.providers || {};
        const config = providers[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider] || DEFAULT_PROVIDER_CONFIGS['OpenAI'];

        // 首先尝试从新的多模型结构中获取当前选中的模型
        let modelId = options?.model;
        let temperature = options?.temperature;

        if (!modelId) {
            // 如果存在 activeModelId 且在 models 列表中找到了它
            const activeInstance = config.models?.find(m => m.id === config.activeModelId);
            if (activeInstance) {
                modelId = activeInstance.model;
                temperature = temperature ?? activeInstance.temperature;
            } else {
                // 回退逻辑：使用旧的 model 字段（如果存在）或默认配置
                modelId = config.model || DEFAULT_PROVIDER_CONFIGS[activeProvider]?.activeModelId || 'gpt-3.5-turbo';
                temperature = temperature ?? config.temperature ?? 0.7;
            }
        }

        // Always create a new model instance for each request to avoid cache poisoning/safety issues during concurrent runs
        return createChatModel(activeProvider, {
            apiKey: config.apiKey || '',
            baseUrl: config.baseUrl,
            model: modelId!,
            temperature: temperature ?? 0.7,
        });
    }

    private convertTools(tools: ITool[]): ChatModelToolDefinition[] {
        return tools.map(t => {
            const def = t.getDefinition();
            return {
                type: 'function',
                function: {
                    name: def.name,
                    description: def.description,
                    parameters: def.input_schema
                }
            };
        });
    }

    private prepareMessages(prompt: string, options?: AgentRuntimeOptions): ChatMessage[] {
        const context = {
            basePrompt: options?.systemPrompt,
            workspacePath: this.settings.workspacePath,
            skills: options?.skills,
            language: this.settings.language,
            memory: this.memoryStore.read()
        };
        const systemPrompt = this.promptBuilder.buildSystemPrompt(context);

        const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

        if (options?.history) {
            options.history.forEach((h: any) => {
                messages.push({
                    role: h.role,
                    content: h.content || null,
                    tool_calls: h.tool_calls,
                    tool_call_id: h.tool_call_id,
                });
            });
        }

        const lastMsg = messages[messages.length - 1];
        if (!(lastMsg?.role === 'user' && lastMsg?.content === prompt)) {
            messages.push({ role: 'user', content: prompt });
        }
        return messages;
    }

    private async optimizeContext(messages: ChatMessage[], chatModel: IChatModel, sessionStateManager: AgentStateManager, options?: AgentRuntimeOptions): Promise<ChatMessage[]> {
        const maxTokens = options?.maxContextTokens || 32000;
        let optimized = [...messages];

        if (Summarizer.shouldSummarize(optimized, maxTokens)) {
            sessionStateManager.transition(AgentState.Thinking, 'Summarizing history...');
            try {
                optimized = await this.summarizer.summarize(optimized, chatModel);
            } catch (e) {
                console.warn('[AgentRuntime] Summarization failed:', e);
            }
        }

        return this.contextManager.prune(optimized);
    }

    private async executeLlmTurn(
        messages: ChatMessage[],
        chatModel: IChatModel,
        chatModelTools: ChatModelToolDefinition[],
        sessionStateManager: AgentStateManager,
        options?: AgentRuntimeOptions,
        onStream?: (chunk: string) => void,
        onToolCallDelta?: (toolCalls: any[], currentContent: string, currentReasoning: string) => void
    ) {
        return withRetry(
            async () => {
                const chatOptions: ChatModelOptions = {
                    model: options?.model,
                    temperature: options?.temperature,
                    tools: chatModelTools.length > 0 ? chatModelTools : undefined,
                    tool_choice: chatModelTools.length > 0 ? 'auto' : undefined,
                    signal: options?.signal,
                };

                let currentContent = '';
                let currentReasoning = '';
                let isReasoning = false;
                let usage: any = undefined;
                const accumulators = new Map<number, ToolCallAccumulator>();

                // Optimized Payload Logging: Don't use JSON.stringify for large objects in the main thread log
                try {
                    const messagesTokens = TokenCounter.countMessages(messages);
                    const toolsTokens = chatOptions.tools ? TokenCounter.countMessages([{ role: 'assistant', content: JSON.stringify(chatOptions.tools) }]) : 0;
                    console.log(`[AgentPerf] Sending Payload to LLM -> Messages: ~${messagesTokens} tokens, Tools: ~${toolsTokens} tokens`);
                } catch (e) {
                    console.warn('[AgentPerf] Failed to estimate payload size:', e);
                }

                const llmStartTime = performance.now();
                let firstTokenReceived = false;

                for await (const event of chatModel.stream(messages, chatOptions)) {
                    if (options?.signal?.aborted) {
                        throw new Error('Agent execution aborted by user.');
                    }
                    if (!firstTokenReceived && (event.type === 'content_delta' || event.type === 'tool_call_delta' || event.type === 'reasoning_delta')) {
                        console.log(`[AgentPerf] LLM TTFT (Real Time To First Token): ${(performance.now() - llmStartTime).toFixed(2)}ms`);
                        firstTokenReceived = true;
                    }
                    switch (event.type) {
                        case 'message_end':
                            usage = event.usage;
                            break;
                        case 'content_delta':
                            if (isReasoning) { isReasoning = false; onStream?.('\n```\n\n'); }
                            currentContent += event.delta;
                            onStream?.(event.delta);
                            break;
                        case 'reasoning_delta':
                            if (!isReasoning) { isReasoning = true; onStream?.('```thinking\n'); }
                            currentReasoning += event.delta;
                            onStream?.(event.delta);
                            break;
                        case 'tool_call_delta': {
                            const acc = accumulators.get(event.index) || { id: '', name: '', arguments: '', type: 'function' };
                            if (event.id) acc.id = event.id;
                            if (event.name) acc.name = event.name;
                            if (event.arguments_delta) acc.arguments += event.arguments_delta;
                            accumulators.set(event.index, acc);

                            // Trigger callback to stream tool arguments to UI
                            onToolCallDelta?.(Array.from(accumulators.values()), currentContent, currentReasoning);
                            break;
                        }
                        case 'error':
                            throw new Error(event.error.message);
                    }
                }

                console.log(`[AgentPerf] LLM Total Generation Time: ${(performance.now() - llmStartTime).toFixed(2)}ms`);

                return {
                    currentContent,
                    currentReasoning,
                    toolCalls: Array.from(accumulators.values()).map(acc => ({
                        id: acc.id,
                        type: acc.type as 'function',
                        function: { name: acc.name, arguments: acc.arguments }
                    })),
                    usage: usage || this.estimateUsage(messages, currentContent, Array.from(accumulators.values()))
                };
            },
            DEFAULT_LLM_RETRY,
            (attempt, error) => {
                console.log(`[AgentRuntime] LLM call failed, retry ${attempt}:`, error.message);
                sessionStateManager.transition(
                    AgentState.Thinking,
                    `API 调用失败，正在重试 (${attempt}/${DEFAULT_LLM_RETRY.maxRetries})...`
                );
            },
            options?.signal
        );
    }

    private async handleToolCalls(
        toolCalls: any[],
        tools: ITool[],
        messages: ChatMessage[],
        newMessages: ChatMessage[],
        steps: AgentStep[],
        thought: string,
        sessionStateManager: AgentStateManager,
        sessionToolGuard: ToolGuard,
        options?: AgentRuntimeOptions,
        onStepUpdate?: (steps: AgentStep[]) => void
    ) {
        sessionStateManager.transition(AgentState.ExecutingTool, `Executing ${toolCalls.length} tools`);

        for (const tc of toolCalls) {
            if (options?.signal?.aborted) break;

            const fnName = tc.function.name;
            let args;
            try {
                args = JSON.parse(tc.function.arguments);
            } catch (e) {
                const error = `[Error] "${fnName}" arguments invalid JSON: ${tc.function.arguments}. 
This is likely caused by output truncation due to context length limits. 
Guidance: If you are trying to write a very large file, please use \`write\` to create the basic structure first, and then use \`edit\` or \`write(append: true)\` to fill in the content step-by-step.`;
                this.recordToolResult(tc.id, error, messages, newMessages);
                steps.push({ thought, tool: fnName, toolInput: tc.function.arguments, observation: error, isComplete: true, isError: true });
                onStepUpdate?.([...steps]);
                continue;
            }

            const tool = tools.find(t => t.getDefinition().name === fnName);
            if (!tool) continue;

            const authorized = await this.checkAuthorization(tc, tool, args, thought, steps, sessionToolGuard, options, onStepUpdate);
            if (options?.signal?.aborted) break;
            if (!authorized) {
                const denial = `[Authorization Denied] User declined tool "${fnName}".`;
                this.recordToolResult(tc.id, denial, messages, newMessages);
                continue;
            }

            const startTime = Date.now();
            sessionStateManager.transition(AgentState.ExecutingTool, `Executing: ${fnName}`, { tool: fnName });

            let step = steps.find(s => s.tool === fnName && !s.isComplete);
            if (!step) {
                step = { thought, tool: fnName, toolInput: JSON.stringify(args), isComplete: false };
                steps.push(step);
            }
            onStepUpdate?.([...steps]);

            let result;
            try {
                result = await withRetry(
                    async () => {
                        let lastStreamUpdate = 0;
                        const toolOnStream = (chunk: string) => {
                            if (!step) return;
                            if (step.streamingObservation === undefined) {
                                step.streamingObservation = '';
                            }
                            step.streamingObservation += chunk;

                            const now = Date.now();
                            if (now - lastStreamUpdate > 100) {
                                onStepUpdate?.([...steps]);
                                lastStreamUpdate = now;
                            }
                        };

                        if (options?.signal) {
                            const executePromise = this.toolRegistry.executeTool(fnName, args, options?.signal, toolOnStream);
                            return await new Promise<any>((resolve, reject) => {
                                const onAbort = () => reject(new Error('Agent execution aborted by user.'));
                                if (options.signal!.aborted) return onAbort();

                                options.signal!.addEventListener('abort', onAbort);
                                executePromise.then(resolve).catch(reject).finally(() => {
                                    options.signal!.removeEventListener('abort', onAbort);
                                });
                            });
                        } else {
                            return await this.toolRegistry.executeTool(fnName, args, undefined, toolOnStream);
                        }
                    },
                    DEFAULT_TOOL_RETRY,
                    (attempt, error) => {
                        console.log(`[AgentRuntime] Tool ${fnName} failed, retry ${attempt}:`, error.message);
                        sessionStateManager.transition(AgentState.ExecutingTool, `Executing: ${fnName} (Retry ${attempt})`, { tool: fnName });
                    },
                    options?.signal
                );
            } catch (err: any) {
                result = { isError: true, result: String(err) };
            }

            const duration = Date.now() - startTime;
            console.log(`[AgentPerf] Tool [${fnName}] Execution Time: ${duration}ms`);

            let obs = result.result;
            obs = ContextManager.truncateToolOutput(fnName, obs);
            if (result.isError) obs += `\n\n[System Note]: Execution failed.`;

            this.recordToolResult(tc.id, obs, messages, newMessages);
            step.observation = obs;
            step.isComplete = true;
            step.duration = duration;
            onStepUpdate?.([...steps]);
        }
    }

    private async checkAuthorization(tc: any, tool: ITool, args: any, thought: string, steps: AgentStep[], sessionToolGuard: ToolGuard, options?: AgentRuntimeOptions, onStepUpdate?: (steps: AgentStep[]) => void): Promise<boolean> {
        const requestId = Math.random().toString(36).substring(7);
        const req: ToolExecutionRequest = { requestId, toolName: tc.function.name, definition: tool.getDefinition(), args, tool };
        const decision = sessionToolGuard.evaluateRequest(req);

        if (decision.requiresUserConfirmation) {
            steps.push({ thought, tool: tc.function.name, toolInput: JSON.stringify(args), isComplete: false, isWaitingAuthorization: true, authRequestId: req.requestId, authReason: decision.reason });
            onStepUpdate?.([...steps]);

            const authorized = await sessionToolGuard.checkAuthorization(req);
            if (options?.signal?.aborted) return false;

            const step = steps[steps.length - 1];
            step.isWaitingAuthorization = false;
            if (!authorized) {
                step.observation = '[Authorization Denied]';
                step.isComplete = true;
                onStepUpdate?.([...steps]);
                return false;
            }
        }
        return true;
    }

    private recordToolResult(id: string, content: string, messages: ChatMessage[], newMessages: ChatMessage[]) {
        const msg: ChatMessage = { role: 'tool', tool_call_id: id, content };
        messages.push(msg);
        newMessages.push(msg);
    }



    private handleMaxSteps(steps: AgentStep[], newMessages: ChatMessage[], onStream?: (c: string) => void) {
        const warning = `\n\n---\n⚠️ **Max steps reached (50)**\nSend a message to continue.`;
        onStream?.(warning);
        return { finalAnswer: (newMessages[newMessages.length - 1]?.content || '') + warning, steps, newMessages };
    }

    private handleError(error: any, steps: AgentStep[], newMessages: ChatMessage[], sessionStateManager: AgentStateManager) {
        console.error('[AgentRuntime] Error:', error);
        const classified = classifyError(error);
        const state = classified.category === ErrorCategory.Aborted ? AgentState.Aborted : AgentState.Error;
        let finalMessage = `Error: ${classified.message}`;
        if (classified.suggestedAction) {
            finalMessage += `\n\n💡 建议: ${classified.suggestedAction}`;
        }
        sessionStateManager.transition(state, finalMessage);
        return { finalAnswer: finalMessage, steps, newMessages };
    }

    private estimateUsage(messages: ChatMessage[], completion: string, toolCalls: any[]): any {
        const promptTokens = TokenCounter.countMessages(messages);
        const completionTokens = TokenCounter.count(completion) + toolCalls.reduce((acc, tc) => acc + TokenCounter.count(tc.name) + TokenCounter.count(tc.arguments) + 10, 0);

        return {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            isEstimated: true
        };
    }

    private async recordUsageAtEnd(sessionId: string, modelId: string, providerId: string, usage: any) {
        if (!usage) return;
        this.usageManager.recordUsage({
            sessionId,
            modelId,
            providerId,
            ...usage
        });
    }
}
