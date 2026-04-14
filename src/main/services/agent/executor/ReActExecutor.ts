/**
 * ReActExecutor.ts - Executor 层默认实现
 *
 * 职责：
 * - 推理策略：think → act → observe 循环
 * - LLM 调用、Tool 执行、状态管理、Context 压缩
 * - 使用 AsyncGenerator 向 Runtime 层流式产出事件
 *
 * Phase 5: 内部私有方法全部改为 sub-generator，通过 yield/yield* 传递事件。
 * 不再使用 emit 回调参数。
 *
 * Phase 6: 智能终止 + Token 预算管理
 * - 从 LLM message_end 事件收集真实 token 用量
 * - 基于模型 contextWindow 的绝对余量触发压缩
 * - 多重终止条件：token 预算耗尽 / 重复检测 / 硬上限
 */

import type { Agent } from '../../../../common/types/agent';
import type { AppSettings, ModelInstance } from '../../../../common/types/settings';
import type { ChatMessage, AgentStep, ToolCall } from '../../../../common/types/chat';
import { AgentContext, AgentRunRequest, AgentEvent, AgentRunResult } from '../types';
import { AgentExecutor } from './AgentExecutor';
import { LLMClientFactory, IChatModel, ChatModelToolDefinition, ChatModelOptions } from '../../llm/IChatModel';
import { ToolGuard } from '../ToolGuard';
import { AgentStateManager, AgentState, AgentStateEvent } from '../state/AgentState';
import { ContextManager } from '../ContextManager';
import { Summarizer } from '../Summarizer';
import { withRetry, DEFAULT_TOOL_RETRY } from '../RetryPolicy';
import { classifyError, ErrorCategory } from '../ErrorClassifier';
import { TokenCounter } from '../TokenCounter';

interface ToolCallAccumulator {
    id: string;
    name: string;
    arguments: string;
    type: string;
}

/** LLM turn result with real token usage */
interface LlmTurnResult {
    content: string;
    reasoning: string;
    toolCalls: ToolCall[];
    promptTokens: number;
    completionTokens: number;
}

/** Reason for loop termination */
enum TerminationReason {
    None = 'none',
    MaxSteps = 'max_steps',
    TokenBudgetExhausted = 'token_budget_exhausted',
    StuckDetected = 'stuck_detected',
    NormalEnd = 'normal_end'
}

// Default model config fallback
const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_OUTPUT = 16000;
const MAX_LOOPS = 200;
const STUCK_DETECTION_WINDOW = 3;

export class ReActExecutor implements AgentExecutor {
    private contextManager: ContextManager;
    private summarizer: Summarizer;

    constructor(
        private llmFactory: LLMClientFactory,
        private settings: AppSettings
    ) {
        this.contextManager = new ContextManager({ maxTokens: DEFAULT_CONTEXT_WINDOW, preserveRecentMessages: 20 });
        this.summarizer = new Summarizer();
    }

    /**
     * Resolve model's contextWindow and maxOutput from settings
     */
    private resolveModelConfig(agent: Agent): { contextWindow: number; maxOutput: number } {
        const [provider, ...rest] = agent.modelId.split('/');
        const modelId = rest.join('/') || 'gpt-4o';
        const providers = this.settings.llm.providers || {};
        const config = providers[provider];
        if (!config?.models) {
            return { contextWindow: DEFAULT_CONTEXT_WINDOW, maxOutput: DEFAULT_MAX_OUTPUT };
        }
        const modelInstance = config.models.find(
            (m: ModelInstance) => m.id === modelId || m.model === modelId
        );
        return {
            contextWindow: modelInstance?.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
            maxOutput: modelInstance?.maxOutput ?? DEFAULT_MAX_OUTPUT
        };
    }

    /**
     * Detect if the agent is stuck (repeating same tool or consecutive errors)
     */
    private isStuck(steps: AgentStep[]): boolean {
        if (steps.length < STUCK_DETECTION_WINDOW) return false;

        const recent = steps.slice(-STUCK_DETECTION_WINDOW);

        // Detection 1: Same tool with same input (exact repeat)
        const toolNames = recent.map(s => s.tool);
        if (toolNames.length > 0 && new Set(toolNames).size === 1) {
            const inputs = recent.map(s => s.toolInput || '');
            if (new Set(inputs).size === 1) {
                return true;
            }
        }

        // Detection 2: Same tool failing consecutively (different args also triggers)
        if (new Set(toolNames).size === 1 && recent.every(s => s.isError)) {
            return true;
        }

        // Detection 3: All recent steps are errors
        if (recent.every(s => s.isError)) {
            return true;
        }

        // Detection 4: Two tools alternating in a loop (e.g. edit → grep → edit → grep)
        if (steps.length >= 6) {
            const last6 = steps.slice(-6);
            const tools6 = last6.map(s => s.tool);
            const uniqueTools = new Set(tools6);
            if (uniqueTools.size === 2) {
                const [a, b] = uniqueTools;
                const isAlternating = tools6.every((t, i) =>
                    (i % 2 === 0 && t === a) || (i % 2 === 1 && t === b)
                ) || tools6.every((t, i) =>
                    (i % 2 === 0 && t === b) || (i % 2 === 1 && t === a)
                );
                if (isAlternating) return true;
            }
        }

        return false;
    }

    async *execute(
        context: AgentContext,
        request: AgentRunRequest
    ): AsyncGenerator<AgentEvent, AgentRunResult> {
        const { messages, tools, signal, agent } = context;
        const llm = this.llmFactory(agent);
        const toolGuard = new ToolGuard();
        const pendingStateEvents: AgentStateEvent[] = [];
        const stateManager = new AgentStateManager(event => {
            pendingStateEvents.push(event);
        });
        const newMessages: ChatMessage[] = [];
        const steps: AgentStep[] = [];
        let loopCount = 0;
        let lastPromptTokens = 0;
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        // Resolve model config and set up token budget
        const { contextWindow, maxOutput } = this.resolveModelConfig(agent);
        // Reserve maxOutput for current LLM response, use 85% of window as budget
        // Floor ensures small context windows still work (avoid negative budget)
        const tokenBudget = Math.max(
            Math.floor(contextWindow * 0.85),
            contextWindow - maxOutput
        );
        this.contextManager.setMaxTokens(tokenBudget);

        console.log(`[ReActExecutor] Model config: contextWindow=${contextWindow}, maxOutput=${maxOutput}, tokenBudget=${tokenBudget}`);

        let terminationReason = TerminationReason.None;

        try {
            while (loopCount++ < MAX_LOOPS) {
                signal?.throwIfAborted();

                // Stuck detection (before expensive LLM call)
                if (this.isStuck(steps)) {
                    terminationReason = TerminationReason.StuckDetected;
                    console.warn(`[ReActExecutor] Stuck detected: repeating same tool or consecutive errors`);
                    break;
                }

                yield { type: 'turn_start', payload: { turnIndex: loopCount, resetStream: true } };

                // Compress first, then check budget — compression frees space for continued execution
                const optimized = yield* this.optimizeContext(
                    messages, llm, stateManager, pendingStateEvents,
                    contextWindow, lastPromptTokens, signal
                );

                // After compression, check if still over budget
                // Use real tokens if available, otherwise estimate compressed size
                const currentTokens = lastPromptTokens > 0
                    ? lastPromptTokens
                    : 0; // First turn — no real data yet
                if (currentTokens > 0 && currentTokens >= tokenBudget) {
                    terminationReason = TerminationReason.TokenBudgetExhausted;
                    console.warn(`[ReActExecutor] Token budget exhausted after compression: ${currentTokens} >= ${tokenBudget}`);
                    break;
                }

                yield* this.transitionState(pendingStateEvents, stateManager, AgentState.Thinking, 'Thinking...');

                const llmResult = yield* this.executeLlmTurn(optimized, tools, llm, maxOutput, signal);

                // Track real token usage (this reflects the compressed input size)
                if (llmResult.promptTokens > 0) {
                    lastPromptTokens = llmResult.promptTokens;
                    totalPromptTokens += llmResult.promptTokens;
                    totalCompletionTokens += llmResult.completionTokens;
                }

                const assistantMsg: ChatMessage = {
                    role: 'assistant',
                    content: llmResult.content || null,
                    tool_calls: llmResult.toolCalls.length > 0 ? llmResult.toolCalls : undefined
                };
                messages.push(assistantMsg);
                newMessages.push(assistantMsg);

                if (llmResult.toolCalls.length === 0) {
                    terminationReason = TerminationReason.NormalEnd;
                    yield { type: 'agent_end', payload: { totalSteps: steps.length, newMessages } };
                    return { finalAnswer: llmResult.content, steps, newMessages, promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens };
                }

                yield* this.handleToolCalls(
                    llmResult.toolCalls,
                    tools,
                    messages,
                    newMessages,
                    steps,
                    llmResult.reasoning || llmResult.content,
                    stateManager,
                    toolGuard,
                    context.runId,
                    pendingStateEvents,
                    signal
                );

                yield { type: 'turn_end', payload: { turnIndex: loopCount, hadToolCalls: true } };
            }

            // Handle termination based on reason
            if (terminationReason === TerminationReason.None) {
                terminationReason = TerminationReason.MaxSteps;
            }
            return yield* this.handleTermination(terminationReason, steps, newMessages, stateManager, pendingStateEvents, lastPromptTokens, totalPromptTokens, totalCompletionTokens);
        } catch (error: any) {
            return yield* this.handleError(error, steps, newMessages, stateManager, pendingStateEvents, totalPromptTokens, totalCompletionTokens);
        }
    }

    private async *optimizeContext(
        messages: ChatMessage[],
        chatModel: IChatModel,
        stateManager: AgentStateManager,
        pendingStateEvents: AgentStateEvent[],
        contextWindow: number,
        lastPromptTokens: number,
        signal?: AbortSignal
    ): AsyncGenerator<AgentEvent, ChatMessage[]> {
        let optimized = [...messages];

        if (signal?.aborted) return optimized;

        // First turn: no real token data, prune is sufficient
        if (lastPromptTokens <= 0) {
            optimized = this.contextManager.prune(optimized);
            return optimized;
        }

        // Step 1: Fast prune first (millisecond-level, no LLM call)
        optimized = this.contextManager.prune(optimized);

        // Step 2: Check if still over budget after pruning
        // Use real tokens from API + estimated tokens of pruned result for better accuracy
        const estimatedTokens = TokenCounter.countMessages(optimized);
        const stillOverBudget = lastPromptTokens >= contextWindow * 0.8 || estimatedTokens >= contextWindow * 0.8;

        // Step 3: Only summarize if pruning wasn't enough (slow, requires LLM call)
        if (stillOverBudget && optimized.length > 2) {
            yield* this.transitionState(pendingStateEvents, stateManager, AgentState.Thinking, 'Compressing history...');
            try {
                optimized = await this.summarizer.summarize(optimized, chatModel);
                console.log('[ReActExecutor] Context summarized after pruning was insufficient');
            } catch (e) {
                console.warn('[ReActExecutor] Summarization failed:', e);
            }
        }

        return optimized;
    }

    private async *flushStateEvents(events: AgentStateEvent[]): AsyncGenerator<AgentEvent, void> {
        while (events.length > 0) {
            yield { type: 'state_change', payload: events.shift()! };
        }
    }

    private async *transitionState(
        events: AgentStateEvent[],
        stateManager: AgentStateManager,
        newState: AgentState,
        message?: string,
        metadata?: Record<string, any>
    ): AsyncGenerator<AgentEvent, void> {
        stateManager.transition(newState, message, metadata);
        yield* this.flushStateEvents(events);
    }

    private async *executeLlmTurn(
        messages: ChatMessage[],
        tools: any,
        chatModel: IChatModel,
        maxOutput: number,
        signal?: AbortSignal
    ): AsyncGenerator<AgentEvent, LlmTurnResult> {
        const chatModelTools = this.convertTools(tools.getTools ? tools.getTools() : []);
        const chatOptions: ChatModelOptions = {
            max_tokens: maxOutput,
            tools: chatModelTools.length > 0 ? chatModelTools : undefined,
            tool_choice: chatModelTools.length > 0 ? 'auto' : undefined,
            signal
        };

        let currentContent = '';
        let currentReasoning = '';
        let isReasoning = false;
        const accumulators = new Map<number, ToolCallAccumulator>();
        let promptTokens = 0;
        let completionTokens = 0;

        // Stream directly from LLM — no retry wrapper needed since
        // yield cannot be used inside withRetry's async callback.
        // LLM providers handle their own connection-level retries.
        for await (const event of chatModel.stream(messages, chatOptions)) {
            if (signal?.aborted) {
                throw new Error('Agent execution aborted by user.');
            }

            switch (event.type) {
                case 'content_delta':
                    if (isReasoning) {
                        isReasoning = false;
                    }
                    currentContent += event.delta;
                    yield { type: 'message_delta', payload: { delta: event.delta } };
                    break;
                case 'reasoning_delta':
                    if (!isReasoning) {
                        isReasoning = true;
                    }
                    currentReasoning += event.delta;
                    yield { type: 'reasoning_delta', payload: { delta: event.delta } };
                    break;
                case 'tool_call_delta': {
                    const acc = accumulators.get(event.index) || { id: '', name: '', arguments: '', type: 'function' };
                    if (event.id) acc.id = event.id;
                    if (event.name) acc.name = event.name;
                    if (event.arguments_delta) acc.arguments += event.arguments_delta;
                    accumulators.set(event.index, acc);
                    break;
                }
                case 'message_end':
                    if (event.usage) {
                        promptTokens = event.usage.prompt_tokens ?? 0;
                        completionTokens = event.usage.completion_tokens ?? 0;
                    }
                    break;
                case 'error':
                    throw new Error(event.error.message);
            }
        }

        // Fallback: estimate tokens when API doesn't return usage
        if (promptTokens === 0 && completionTokens === 0) {
            promptTokens = TokenCounter.countMessages(messages);
            completionTokens = TokenCounter.count(currentContent) + TokenCounter.count(currentReasoning);
            for (const acc of accumulators.values()) {
                completionTokens += TokenCounter.count(acc.arguments) + 10;
            }
        }

        if (promptTokens > 0) {
            console.log(`[ReActExecutor] Token usage: prompt=${promptTokens}, completion=${completionTokens} (estimated)`);
        }

        return {
            content: currentContent,
            reasoning: currentReasoning,
            toolCalls: Array.from(accumulators.values()).map(acc => ({
                id: acc.id,
                type: acc.type as 'function',
                function: { name: acc.name, arguments: acc.arguments }
            })),
            promptTokens,
            completionTokens
        };
    }

    private convertTools(tools: any[]): ChatModelToolDefinition[] {
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

    private async *handleToolCalls(
        toolCalls: any[],
        tools: any,
        messages: ChatMessage[],
        newMessages: ChatMessage[],
        steps: AgentStep[],
        thought: string,
        stateManager: AgentStateManager,
        toolGuard: ToolGuard,
        runId: string,
        pendingStateEvents: AgentStateEvent[],
        signal?: AbortSignal
    ): AsyncGenerator<AgentEvent, void> {
        yield* this.transitionState(pendingStateEvents, stateManager, AgentState.ExecutingTool, `Executing ${toolCalls.length} tools`);

        for (const tc of toolCalls) {
            if (signal?.aborted) break;

            const fnName = tc.function.name;
            let args;
            try {
                args = JSON.parse(tc.function.arguments);
            } catch (e) {
                const error = `[Error] "${fnName}" tool call was truncated (output too long, JSON malformed).`;
                this.recordToolResult(tc.id, error, messages, newMessages);
                steps.push({ thought, tool: fnName, toolInput: tc.function.arguments, observation: error, isComplete: true, isError: true });
                continue;
            }

            const tool = tools.getTools().find((t: any) => t.getDefinition().name === fnName);
            if (!tool) {
                const errorResult = `Tool "${fnName}" is not available. Check available tools and try again.`;
                this.recordToolResult(tc.id, errorResult, messages, newMessages);
                steps.push({
                    thought,
                    tool: fnName,
                    toolInput: tc.function.arguments,
                    observation: errorResult,
                    isComplete: true,
                    isError: true,
                    duration: 0,
                });
                continue;
            }

            const authorized = yield* this.checkAuth(tc, tool, args, thought, steps, toolGuard, stateManager, runId, pendingStateEvents, signal);
            if (signal?.aborted) break;
            if (!authorized) {
                const denial = `[Authorization Denied] User declined tool "${fnName}".`;
                this.recordToolResult(tc.id, denial, messages, newMessages);
                continue;
            }

            const startTime = Date.now();
            yield* this.transitionState(pendingStateEvents, stateManager, AgentState.ExecutingTool, `Executing: ${fnName}`, { tool: fnName });

            const startStep: AgentStep = { thought, tool: fnName, toolInput: JSON.stringify(args), isComplete: false };
            yield { type: 'tool_start', payload: startStep };

            let step = steps.find(s => s.tool === fnName && !s.isComplete);
            if (!step) {
                step = startStep;
                steps.push(step);
            }

            let result;
            try {
                result = await withRetry(
                    async () => {
                        if (signal) {
                            const executePromise = tools.executeTool(fnName, args, signal);
                            return await new Promise<any>((resolve, reject) => {
                                const onAbort = () => reject(new Error('Agent execution aborted by user.'));
                                if (signal.aborted) return onAbort();
                                signal.addEventListener('abort', onAbort);
                                executePromise.then(resolve).catch(reject).finally(() => {
                                    signal.removeEventListener('abort', onAbort);
                                });
                            });
                        } else {
                            return await tools.executeTool(fnName, args);
                        }
                    },
                    DEFAULT_TOOL_RETRY,
                    (attempt, error) => {
                        console.log(`[ReActExecutor] Tool ${fnName} failed, retry ${attempt}:`, error.message);
                        stateManager.transition(AgentState.ExecutingTool, `Executing: ${fnName} (Retry ${attempt})`, { tool: fnName });
                    },
                    signal
                );
                yield* this.flushStateEvents(pendingStateEvents);
            } catch (err: any) {
                result = { isError: true, result: String(err) };
            }

            const duration = Date.now() - startTime;
            console.log(`[AgentPerf] Tool [${fnName}] Execution Time: ${duration}ms`);

            let obs = result.result;
            obs = ContextManager.truncateToolOutput(fnName, obs);
            if (result.isError) obs += `\n\n[System Note]: Execution failed.`;

            const endStep: AgentStep = { ...step, observation: obs, isComplete: true, duration, isError: !!result.isError };
            yield { type: 'tool_end', payload: endStep };
            this.recordToolResult(tc.id, obs, messages, newMessages);
            step.observation = obs;
            step.isComplete = true;
            step.duration = duration;
            step.isError = !!result.isError;
        }
    }

    /**
     * Sub-generator: 评估授权需求，必要时 yield auth_request 并等待外部回复。
     *
     * 通过 `const approved = yield event` 接收外部通过 iterator.next(approved) 传回的决策。
     */
    private async *checkAuth(
        tc: any,
        tool: any,
        args: any,
        thought: string,
        steps: AgentStep[],
        toolGuard: ToolGuard,
        stateManager: AgentStateManager,
        runId: string,
        pendingStateEvents: AgentStateEvent[],
        signal?: AbortSignal
    ): AsyncGenerator<AgentEvent, boolean> {
        const requestId = Math.random().toString(36).substring(7);
        const req = { requestId, runId, toolName: tc.function.name, definition: tool.getDefinition(), args, tool };
        const decision = toolGuard.evaluateRequest(req);

        if (decision.requiresUserConfirmation) {
            const authStep: AgentStep = {
                thought,
                tool: tc.function.name,
                toolInput: JSON.stringify(args),
                isComplete: false,
                isWaitingAuthorization: true,
                authRequestId: req.requestId,
                authReason: decision.reason
            };
            steps.push(authStep);

            yield* this.transitionState(pendingStateEvents, stateManager, AgentState.AwaitingInput, `等待工具授权: ${tc.function.name}`);

            const approved: boolean = yield {
                type: 'auth_request',
                payload: {
                    runId,
                    requestId: req.requestId || '',
                    toolName: req.toolName,
                    args: req.args,
                    reason: decision.reason || ''
                }
            };

            if (signal?.aborted) return false;

            const step = steps[steps.length - 1];
            step.isWaitingAuthorization = false;
            if (approved) {
                toolGuard.markApproved(req);
                return true;
            } else {
                step.observation = '[Authorization Denied]';
                step.isComplete = true;
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

    /**
     * Unified termination handler with reason-aware messages
     */
    private async *handleTermination(
        reason: TerminationReason,
        steps: AgentStep[],
        newMessages: ChatMessage[],
        stateManager: AgentStateManager,
        pendingStateEvents: AgentStateEvent[],
        lastPromptTokens: number,
        totalPromptTokens: number,
        totalCompletionTokens: number
    ): AsyncGenerator<AgentEvent, AgentRunResult> {
        let warning: string;
        let stateMsg: string;

        switch (reason) {
            case TerminationReason.TokenBudgetExhausted:
                warning = `\n\n---\nToken budget exhausted (${lastPromptTokens} tokens used). Send a message to continue.`;
                stateMsg = 'Done (Token Budget Exhausted)';
                break;
            case TerminationReason.StuckDetected:
                warning = `\n\n---\nDetected repeated actions without progress. Please review the results and provide new instructions.`;
                stateMsg = 'Done (Stuck Detected)';
                break;
            case TerminationReason.MaxSteps:
            default:
                warning = `\n\n---\nMax steps reached (${MAX_LOOPS}). Send a message to continue.`;
                stateMsg = 'Done (Max Steps)';
                break;
        }

        yield* this.transitionState(pendingStateEvents, stateManager, AgentState.Idle, stateMsg);
        yield { type: 'agent_end', payload: { totalSteps: steps.length, newMessages } };
        return { finalAnswer: (newMessages[newMessages.length - 1]?.content || '') + warning, steps, newMessages, promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens };
    }

    private async *handleError(error: any, steps: AgentStep[], newMessages: ChatMessage[], stateManager: AgentStateManager, pendingStateEvents: AgentStateEvent[], totalPromptTokens: number, totalCompletionTokens: number): AsyncGenerator<AgentEvent, AgentRunResult> {
        console.error('[ReActExecutor] Error:', error);
        const classified = classifyError(error);
        const state = classified.category === ErrorCategory.Aborted ? AgentState.Aborted : AgentState.Error;
        let finalMessage = `Error: ${classified.message}`;
        if (classified.suggestedAction) {
            finalMessage += `\n\n💡 建议: ${classified.suggestedAction}`;
        }
        yield* this.transitionState(pendingStateEvents, stateManager, state, finalMessage);
        yield { type: 'error', payload: { message: classified.message, code: classified.category } };
        return { finalAnswer: finalMessage, steps, newMessages, promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens };
    }
}
