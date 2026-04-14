import { describe, it, expect, vi } from 'vitest';
import { ReActExecutor } from '@/main/services/agent/executor/ReActExecutor';
import type { AgentContext, AgentRunRequest, AgentEvent } from '@/main/services/agent/types';
import type { ChatMessage } from '@/common/types/chat';

/**
 * Helper: collect all events and the final result from an AsyncGenerator
 */
async function collectGenerator<T, R>(gen: AsyncGenerator<T, R>): Promise<{ events: T[]; result: R }> {
    const events: T[] = [];
    let result: R;
    while (true) {
        const { value, done } = await gen.next();
        if (done) {
            result = value as R;
            break;
        }
        events.push(value as T);
    }
    return { events, result: result! };
}

describe('ReActExecutor', () => {
    describe('unknown tool handling', () => {
        it('should return error result for unknown tool instead of skipping', async () => {
            // Mock LLM: first call returns tool_call for nonexistent tool,
            // second call returns final answer (no tool calls)
            let callCount = 0;
            const mockStream = async function* () {
                callCount++;
                if (callCount === 1) {
                    // First turn: return tool call for unknown tool
                    yield { type: 'tool_call_delta', index: 0, id: 'call_unknown', name: 'nonexistent_tool', arguments_delta: '{}' };
                    yield { type: 'message_end', usage: { prompt_tokens: 100, completion_tokens: 10 } };
                } else {
                    // Second turn: final answer, no tool calls
                    yield { type: 'content_delta', delta: 'Task completed.' };
                    yield { type: 'message_end', usage: { prompt_tokens: 100, completion_tokens: 5 } };
                }
            };

            const mockChatModel = {
                stream: mockStream,
            };

            const llmFactory = vi.fn().mockReturnValue(mockChatModel);
            const settings = { llm: { providers: {} } } as any;

            const executor = new ReActExecutor(llmFactory, settings);

            // Mock tools registry with no tools
            const mockTools = {
                getTools: vi.fn().mockReturnValue([]),
                getDefinitions: vi.fn().mockReturnValue([]),
                executeTool: vi.fn(),
            };

            const messages: ChatMessage[] = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Test message' },
            ];

            const context: AgentContext = {
                runId: 'test-run',
                agent: {
                    id: 'test-agent',
                    name: 'Test Agent',
                    modelId: 'test-model',
                    systemPrompt: 'You are a helpful assistant.',
                    skillIds: [],
                    allowedTools: [],
                } as any,
                messages,
                tools: mockTools as any,
                signal: undefined,
            };

            const request: AgentRunRequest = {
                prompt: 'Test message',
            };

            const { events, result } = await collectGenerator(executor.execute(context, request));

            // Verify: messages should contain a tool error result for the unknown tool call
            const toolMessages = result.newMessages.filter(m => m.role === 'tool');
            expect(toolMessages.length).toBeGreaterThanOrEqual(1);

            const errorToolMsg = toolMessages.find(m =>
                m.tool_call_id === 'call_unknown' &&
                typeof m.content === 'string' &&
                m.content.includes('not available')
            );
            expect(errorToolMsg).toBeDefined();

            // Verify: steps should contain an error step
            const errorSteps = result.steps.filter(s => s.isError);
            expect(errorSteps.length).toBeGreaterThanOrEqual(1);
            expect(errorSteps[0].tool).toBe('nonexistent_tool');
        });
    });
});
