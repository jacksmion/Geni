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

function createMockContext(mockTools: any): AgentContext {
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Test message' },
    ];

    return {
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
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        void rej;
    });
    return { promise, resolve };
}

describe('ReActExecutor', () => {
    describe('unknown tool handling', () => {
        it('should return error result for unknown tool instead of skipping', async () => {
            let callCount = 0;
            const mockStream = async function* () {
                callCount++;
                if (callCount === 1) {
                    yield { type: 'tool_call_delta', index: 0, id: 'call_unknown', name: 'nonexistent_tool', arguments_delta: '{}' };
                    yield { type: 'message_end', usage: { prompt_tokens: 100, completion_tokens: 10 } };
                } else {
                    yield { type: 'content_delta', delta: 'Task completed.' };
                    yield { type: 'message_end', usage: { prompt_tokens: 100, completion_tokens: 5 } };
                }
            };

            const mockChatModel = { stream: mockStream };
            const llmFactory = vi.fn().mockReturnValue(mockChatModel);
            const settings = { llm: { providers: {} } } as any;
            const executor = new ReActExecutor(llmFactory, settings);

            const mockTools = {
                getTools: vi.fn().mockReturnValue([]),
                getDefinitions: vi.fn().mockReturnValue([]),
                executeTool: vi.fn(),
            };

            const context = createMockContext(mockTools);
            const request: AgentRunRequest = { prompt: 'Test message' };

            const { result } = await collectGenerator(executor.execute(context, request));

            const toolMessages = result.newMessages.filter(m => m.role === 'tool');
            expect(toolMessages.length).toBeGreaterThanOrEqual(1);

            const errorToolMsg = toolMessages.find(m =>
                m.tool_call_id === 'call_unknown' &&
                typeof m.content === 'string' &&
                m.content.includes('not available')
            );
            expect(errorToolMsg).toBeDefined();

            const errorSteps = result.steps.filter(s => s.isError);
            expect(errorSteps.length).toBeGreaterThanOrEqual(1);
            expect(errorSteps[0].tool).toBe('nonexistent_tool');
        });
    });

    describe('stuck detection', () => {
        it('should detect stuck when same tool fails consecutively with different args', async () => {
            let turn = 0;
            const mockStream = async function* () {
                turn++;
                // Turns 1-3: call 'failing_tool' with different args each time
                // Turn 4+ should not be reached due to stuck detection
                yield { type: 'tool_call_delta', index: 0, id: `call_${turn}`, name: 'failing_tool', arguments_delta: `{"arg":"value${turn}"}` };
                yield { type: 'message_end', usage: { prompt_tokens: 100, completion_tokens: 10 } };
            };

            const mockChatModel = { stream: mockStream };
            const llmFactory = vi.fn().mockReturnValue(mockChatModel);
            const settings = { llm: { providers: {} } } as any;
            const executor = new ReActExecutor(llmFactory, settings);

            const mockToolDef = { name: 'failing_tool', description: 'test', input_schema: {} };
            const mockTool = {
                getDefinition: vi.fn().mockReturnValue(mockToolDef),
                execute: vi.fn().mockResolvedValue({ toolName: 'failing_tool', isError: true, result: 'Error: something failed' }),
            };

            const mockTools = {
                getTools: vi.fn().mockReturnValue([mockTool]),
                getDefinitions: vi.fn().mockReturnValue([mockToolDef]),
                executeTool: vi.fn().mockResolvedValue({ toolName: 'failing_tool', isError: true, result: 'Error: something failed' }),
            };

            const context = createMockContext(mockTools);
            const request: AgentRunRequest = { prompt: 'Test message' };

            const { result } = await collectGenerator(executor.execute(context, request));

            // Should have exactly 3 steps (stuck detected after 3 consecutive failures of same tool)
            expect(result.steps.length).toBe(3);
            // All steps should be errors
            expect(result.steps.every(s => s.isError)).toBe(true);
            // All steps should be the same tool
            expect(result.steps.every(s => s.tool === 'failing_tool')).toBe(true);
        });

        it('should detect stuck when two tools alternate in a loop', async () => {
            let turn = 0;
            const mockStream = async function* () {
                turn++;
                // Alternate between tool_a and tool_b
                const toolName = turn % 2 === 1 ? 'tool_a' : 'tool_b';
                yield { type: 'tool_call_delta', index: 0, id: `call_${turn}`, name: toolName, arguments_delta: '{"x":1}' };
                yield { type: 'message_end', usage: { prompt_tokens: 100, completion_tokens: 10 } };
            };

            const mockChatModel = { stream: mockStream };
            const llmFactory = vi.fn().mockReturnValue(mockChatModel);
            const settings = { llm: { providers: {} } } as any;
            const executor = new ReActExecutor(llmFactory, settings);

            const createTool = (name: string) => ({
                getDefinition: vi.fn().mockReturnValue({ name, description: 'test', input_schema: {} }),
                execute: vi.fn().mockResolvedValue({ toolName: name, result: 'ok' }),
            });

            const mockTools = {
                getTools: vi.fn().mockReturnValue([createTool('tool_a'), createTool('tool_b')]),
                getDefinitions: vi.fn().mockReturnValue([
                    { name: 'tool_a', description: 'test', input_schema: {} },
                    { name: 'tool_b', description: 'test', input_schema: {} },
                ]),
                executeTool: vi.fn().mockImplementation((name: string) =>
                    Promise.resolve({ toolName: name, result: 'ok' })
                ),
            };

            const context = createMockContext(mockTools);
            const request: AgentRunRequest = { prompt: 'Test message' };

            const { result } = await collectGenerator(executor.execute(context, request));

            // Should stop at 6 steps (alternating pattern detected)
            expect(result.steps.length).toBe(6);
        });
    });

    describe('parallel-safe tool execution', () => {
        it('should execute parallel-safe read tools concurrently within the same turn', async () => {
            let turn = 0;
            const mockStream = async function* () {
                turn++;
                if (turn === 1) {
                    yield { type: 'tool_call_delta', index: 0, id: 'call_read', name: 'read', arguments_delta: '{"path":"a.txt"}' };
                    yield { type: 'tool_call_delta', index: 1, id: 'call_glob', name: 'glob', arguments_delta: '{"pattern":"**/*.ts"}' };
                    yield { type: 'message_end', usage: { prompt_tokens: 100, completion_tokens: 10 } };
                } else {
                    yield { type: 'content_delta', delta: 'done' };
                    yield { type: 'message_end', usage: { prompt_tokens: 100, completion_tokens: 5 } };
                }
            };

            const mockChatModel = { stream: mockStream };
            const llmFactory = vi.fn().mockReturnValue(mockChatModel);
            const settings = { llm: { providers: {} } } as any;
            const executor = new ReActExecutor(llmFactory, settings);

            const readDeferred = createDeferred<any>();
            const globDeferred = createDeferred<any>();
            const executeTool = vi.fn().mockImplementation((name: string) => {
                if (name === 'read') return readDeferred.promise;
                if (name === 'glob') return globDeferred.promise;
                return Promise.resolve({ toolName: name, result: 'ok' });
            });

            const mockTools = {
                getTools: vi.fn().mockReturnValue([
                    { parallelSafe: true, getDefinition: vi.fn().mockReturnValue({ name: 'read', description: 'read', input_schema: {} }) },
                    { parallelSafe: true, getDefinition: vi.fn().mockReturnValue({ name: 'glob', description: 'glob', input_schema: {} }) },
                ]),
                getDefinitions: vi.fn().mockReturnValue([]),
                executeTool,
            };

            const context = createMockContext(mockTools);
            const request: AgentRunRequest = { prompt: 'Test message' };

            const runPromise = collectGenerator(executor.execute(context, request));

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(executeTool).toHaveBeenCalledTimes(2);
            expect(executeTool.mock.calls.map(call => call[0])).toEqual(['read', 'glob']);

            readDeferred.resolve({ toolName: 'read', isError: false, result: 'read ok' });
            globDeferred.resolve({ toolName: 'glob', isError: false, result: 'glob ok' });

            const { result } = await runPromise;

            expect(result.finalAnswer).toBe('done');
            expect(result.steps.map(step => step.tool)).toEqual(['read', 'glob']);
        });
    });
});
