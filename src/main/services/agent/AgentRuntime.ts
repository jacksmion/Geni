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

import { IAgentService, AgentRunOptions, AgentRunResult, AgentStep } from './IAgent';
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
    private contextManager: ContextManager;
    private summarizer: Summarizer;
    private stateChangeCallback?: (event: AgentStateEvent) => void;

    constructor(settings: AppSettings, toolRegistry: ToolRegistry) {
        this.settings = settings;
        this.toolRegistry = toolRegistry;
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
                if (options?.signal?.aborted) throw new Error('Agent execution aborted by user.');
                onStream?.('', true);

                // 1. 上下文优化
                messages = await this.optimizeContext(messages, chatModel, sessionStateManager, options);

                // 2. LLM 轮次执行
                sessionStateManager.transition(AgentState.Thinking, `Thinking...`);
                const { currentContent, currentReasoning, toolCalls } = await this.executeLlmTurn(
                    messages, chatModel, chatModelTools, options, onStream
                );

                const assistantMsg: ChatMessage = {
                    role: 'assistant',
                    content: currentContent || null,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                };
                messages.push(assistantMsg);
                newMessages.push(assistantMsg);

                // 3. 工具处理
                if (toolCalls.length > 0) {
                    await this.handleToolCalls(toolCalls, tools, messages, newMessages, steps, currentReasoning || currentContent, sessionStateManager, sessionToolGuard, options, onStepUpdate);
                } else {
                    return { finalAnswer: currentContent, steps, newMessages };
                }
            }
            return this.handleMaxSteps(steps, newMessages, onStream);
        } catch (error: any) {
            return this.handleError(error, steps, newMessages, sessionStateManager);
        } finally {
            sessionStateManager.transition(AgentState.Idle, 'Execution finished');
        }
    }

    private createChatModel(options?: AgentRuntimeOptions): IChatModel {
        const activeProvider = this.settings.llm.activeProvider || 'OpenAI';
        const providers = this.settings.llm.providers || {};
        const config = providers[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider] || DEFAULT_PROVIDER_CONFIGS['OpenAI'];

        // Always create a new model instance for each request to avoid cache poisoning/safety issues during concurrent runs
        return createChatModel(activeProvider, {
            apiKey: config.apiKey || '',
            baseUrl: config.baseUrl,
            model: options?.model || config.model,
            temperature: config.temperature,
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
            skills: options?.skills
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
        options?: AgentRuntimeOptions,
        onStream?: (chunk: string) => void
    ) {
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
        const accumulators = new Map<number, ToolCallAccumulator>();

        for await (const event of chatModel.stream(messages, chatOptions)) {
            switch (event.type) {
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
                case 'tool_call_delta':
                    const acc = accumulators.get(event.index) || { id: '', name: '', arguments: '', type: 'function' };
                    if (event.id) acc.id = event.id;
                    if (event.name) acc.name = event.name;
                    if (event.arguments_delta) acc.arguments += event.arguments_delta;
                    accumulators.set(event.index, acc);
                    break;
                case 'error':
                    throw new Error(event.error.message);
            }
        }

        return {
            currentContent,
            currentReasoning,
            toolCalls: Array.from(accumulators.values()).map(acc => ({
                id: acc.id,
                type: acc.type as 'function',
                function: { name: acc.name, arguments: acc.arguments }
            }))
        };
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
            if (options?.signal) {
                const executePromise = this.toolRegistry.executeTool(fnName, args, options?.signal);
                result = await new Promise<any>((resolve, reject) => {
                    const onAbort = () => reject(new Error('Agent execution aborted by user.'));
                    if (options.signal!.aborted) return onAbort();

                    options.signal!.addEventListener('abort', onAbort);
                    executePromise.then(resolve).catch(reject).finally(() => {
                        options.signal!.removeEventListener('abort', onAbort);
                    });
                });
            } else {
                result = await this.toolRegistry.executeTool(fnName, args);
            }

            const duration = Date.now() - startTime;

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
        const state = error.message?.includes('aborted') ? AgentState.Aborted : AgentState.Error;
        sessionStateManager.transition(state, error.message);
        return { finalAnswer: `Error: ${error.message}`, steps, newMessages };
    }
}
