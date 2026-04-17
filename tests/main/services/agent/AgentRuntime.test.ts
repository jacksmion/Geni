import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRuntime } from '@/main/services/agent/runtime/AgentRuntime';
import { ToolRegistry } from '@/main/services/tools/ToolRegistry';
import type { AgentExecutor } from '@/main/services/agent/executor/AgentExecutor';
import type { AgentEvent, AgentRunResult } from '@/main/services/agent/types';
import type { Agent } from '@/common/types/agent';

function createAgent(): Agent {
    return {
        id: 'agent-1',
        name: 'Test Agent',
        modelId: 'openai/test-model',
    };
}

function createRuntime(executor: AgentExecutor) {
    return new AgentRuntime(
        new ToolRegistry(),
        { getHistory: vi.fn().mockResolvedValue([]), addMessage: vi.fn().mockResolvedValue(undefined) } as any,
        { get: vi.fn(), getAll: vi.fn().mockReturnValue([]), getSource: vi.fn() } as any,
        { load: vi.fn().mockReturnValue({ skillSettings: {} }) } as any,
        { readByCategory: vi.fn().mockReturnValue(''), listTitles: vi.fn().mockReturnValue([]) } as any,
        { recordUsage: vi.fn() } as any,
        executor
    );
}

function createAuthExecutor(onDecision?: (approved: boolean) => void): AgentExecutor {
    return {
        async *execute(): AsyncGenerator<AgentEvent, AgentRunResult> {
            const approved: boolean = yield {
                type: 'auth_request',
                payload: {
                    runId: 'run-1',
                    requestId: 'req-1',
                    toolName: 'bash',
                    args: { command: 'echo ok' },
                    reason: 'needs approval'
                }
            };

            onDecision?.(approved);

            return {
                finalAnswer: approved ? 'approved' : 'denied',
                steps: [],
                newMessages: [],
                promptTokens: 0,
                completionTokens: 0
            };
        }
    };
}

describe('AgentRuntime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should resolve a pending auth request as denied when the run is aborted', async () => {
        const onDecision = vi.fn();
        const runtime = createRuntime(createAuthExecutor(onDecision));
        const controller = new AbortController();

        const runPromise = runtime.run(createAgent(), {
            prompt: 'test',
            signal: controller.signal,
            emit: vi.fn(),
        });

        await Promise.resolve();
        controller.abort();

        const result = await runPromise;
        expect(result.finalAnswer).toBe('denied');
        expect(onDecision).toHaveBeenCalledWith(false);
    });

    it('should deny and resume when an auth request times out', async () => {
        const onDecision = vi.fn();
        const runtime = createRuntime(createAuthExecutor(onDecision));

        const runPromise = runtime.run(createAgent(), {
            prompt: 'test',
            emit: vi.fn(),
        });

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 10);

        const result = await runPromise;
        expect(result.finalAnswer).toBe('denied');
        expect(onDecision).toHaveBeenCalledWith(false);
    });
});
