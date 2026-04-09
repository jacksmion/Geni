/**
 * DefaultAgenticExecutor.ts - Executor 层默认实现
 *
 * 职责：
 * - 推理策略：think → act → observe 循环
 * - LLM 调用、Tool 执行、状态管理、Context 压缩
 * - 使用 AsyncGenerator 向 Runtime 层流式产出事件
 *
 * Phase 5: 内部私有方法全部改为 sub-generator，通过 yield/yield* 传递事件。
 * 不再使用 emit 回调参数。
 */

import type { Agent } from '../../../../common/types/agent';
import type { AppSettings } from '../../../../common/types/settings';
import type { ChatMessage, AgentStep, ToolCall } from '../../../../common/types/chat';
import { AgentContext, AgentRunRequest, AgentEvent, AgentRunResult } from '../types';
import { AgentExecutor } from './AgentExecutor';
import { LLMClientFactory, IChatModel, ChatModelToolDefinition, ChatModelOptions } from '../../llm/IChatModel';
import { ToolGuard } from '../ToolGuard';
import { AgentStateManager, AgentState } from '../state/AgentState';
import { ContextManager } from '../ContextManager';
import { Summarizer } from '../Summarizer';
import { withRetry, DEFAULT_TOOL_RETRY } from '../RetryPolicy';
import { classifyError, ErrorCategory } from '../ErrorClassifier';

interface ToolCallAccumulator {
    id: string;
    name: string;
    arguments: string;
    type: string;
}

export class DefaultAgenticExecutor implements AgentExecutor {
    private contextManager: ContextManager;
    private summarizer: Summarizer;

    constructor(
        private llmFactory: LLMClientFactory,
        private settings: AppSettings
    ) {
        this.contextManager = new ContextManager({ maxTokens: 32000, preserveRecentMessages: 20 });
        this.summarizer = new Summarizer();
    }

    async *execute(
        context: AgentContext,
        request: AgentRunRequest
    ): AsyncGenerator<AgentEvent, AgentRunResult> {
        const { messages, tools, signal, agent } = context;
        const llm = this.llmFactory(agent);
        const toolGuard = new ToolGuard();
        const stateManager = new AgentStateManager();
        const newMessages: ChatMessage[] = [];
        const steps: AgentStep[] = [];
        let loopCount = 0;
        const MAX_LOOPS = 50;

        try {
            while (loopCount++ < MAX_LOOPS) {
                signal?.throwIfAborted();

                yield { type: 'turn_start', payload: { turnIndex: loopCount, resetStream: true } };

                const optimized = await this.optimizeContext(messages, llm, stateManager, signal);
                stateManager.transition(AgentState.Thinking, 'Thinking...');

                const llmResult = yield* this.executeLlmTurn(optimized, tools, llm, stateManager, signal);

                const assistantMsg: ChatMessage = {
                    role: 'assistant',
                    content: llmResult.content || null,
                    tool_calls: llmResult.toolCalls.length > 0 ? llmResult.toolCalls : undefined
                };
                messages.push(assistantMsg);
                newMessages.push(assistantMsg);

                if (llmResult.toolCalls.length === 0) {
                    yield { type: 'agent_end', payload: { totalSteps: steps.length, newMessages } };
                    return { finalAnswer: llmResult.content, steps, newMessages };
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
                    signal
                );

                yield { type: 'turn_end', payload: { turnIndex: loopCount, hadToolCalls: true } };
            }

            return yield* this.handleMaxSteps(steps, newMessages);
        } catch (error: any) {
            return yield* this.handleError(error, steps, newMessages, stateManager);
        }
    }

    private async optimizeContext(
        messages: ChatMessage[],
        chatModel: IChatModel,
        stateManager: AgentStateManager,
        signal?: AbortSignal
    ): Promise<ChatMessage[]> {
        let optimized = [...messages];

        if (signal?.aborted) return optimized;

        if (Summarizer.shouldSummarize(optimized, 32000)) {
            stateManager.transition(AgentState.Thinking, 'Summarizing history...');
            try {
                optimized = await this.summarizer.summarize(optimized, chatModel);
            } catch (e) {
                console.warn('[DefaultAgenticExecutor] Summarization failed:', e);
            }
        }

        return this.contextManager.prune(optimized);
    }

    private async *executeLlmTurn(
        messages: ChatMessage[],
        tools: any,
        chatModel: IChatModel,
        stateManager: AgentStateManager,
        signal?: AbortSignal
    ): AsyncGenerator<AgentEvent, { content: string; reasoning: string; toolCalls: ToolCall[] }> {
        const chatModelTools = this.convertTools(tools.getTools ? tools.getTools() : []);
        const chatOptions: ChatModelOptions = {
            max_tokens: 16000,
            tools: chatModelTools.length > 0 ? chatModelTools : undefined,
            tool_choice: chatModelTools.length > 0 ? 'auto' : undefined,
            signal
        };

        let currentContent = '';
        let currentReasoning = '';
        let isReasoning = false;
        const accumulators = new Map<number, ToolCallAccumulator>();

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
                case 'error':
                    throw new Error(event.error.message);
            }
        }

        return {
            content: currentContent,
            reasoning: currentReasoning,
            toolCalls: Array.from(accumulators.values()).map(acc => ({
                id: acc.id,
                type: acc.type as 'function',
                function: { name: acc.name, arguments: acc.arguments }
            }))
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
        signal?: AbortSignal
    ): AsyncGenerator<AgentEvent, void> {
        stateManager.transition(AgentState.ExecutingTool, `Executing ${toolCalls.length} tools`);

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
            if (!tool) continue;

            const authorized = yield* this.checkAuth(tc, tool, args, thought, steps, toolGuard, runId, signal);
            if (signal?.aborted) break;
            if (!authorized) {
                const denial = `[Authorization Denied] User declined tool "${fnName}".`;
                this.recordToolResult(tc.id, denial, messages, newMessages);
                continue;
            }

            const startTime = Date.now();
            stateManager.transition(AgentState.ExecutingTool, `Executing: ${fnName}`, { tool: fnName });

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
                        console.log(`[DefaultAgenticExecutor] Tool ${fnName} failed, retry ${attempt}:`, error.message);
                        stateManager.transition(AgentState.ExecutingTool, `Executing: ${fnName} (Retry ${attempt})`, { tool: fnName });
                    },
                    signal
                );
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
        runId: string,
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

            // yield auth_request 事件；Runtime 通过 iterator.next(approved) 回传用户决策
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

    private async *handleMaxSteps(steps: AgentStep[], newMessages: ChatMessage[]): AsyncGenerator<AgentEvent, AgentRunResult> {
        const warning = `\n\n---\n⚠️ **Max steps reached (50)**\nSend a message to continue.`;
        yield { type: 'agent_end', payload: { totalSteps: steps.length, newMessages } };
        return { finalAnswer: (newMessages[newMessages.length - 1]?.content || '') + warning, steps, newMessages };
    }

    private async *handleError(error: any, steps: AgentStep[], newMessages: ChatMessage[], stateManager: AgentStateManager): AsyncGenerator<AgentEvent, AgentRunResult> {
        console.error('[DefaultAgenticExecutor] Error:', error);
        const classified = classifyError(error);
        const state = classified.category === ErrorCategory.Aborted ? AgentState.Aborted : AgentState.Error;
        let finalMessage = `Error: ${classified.message}`;
        if (classified.suggestedAction) {
            finalMessage += `\n\n💡 建议: ${classified.suggestedAction}`;
        }
        stateManager.transition(state, finalMessage);
        yield { type: 'error', payload: { message: classified.message, code: classified.category } };
        return { finalAnswer: finalMessage, steps, newMessages };
    }
}
