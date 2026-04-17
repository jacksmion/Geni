import { describe, it, expect } from 'vitest';
import { ContextManager } from '@/main/services/agent/ContextManager';
import { ChatMessage } from '@/common/types/chat';

describe('ContextManager', () => {

    const createDummyMessage = (role: 'system' | 'user' | 'assistant' | 'tool', length: number, toolName?: string): ChatMessage => {
        const content = 'a'.repeat(length * 4); // each 4 ascii chars is ~1 token
        if (role === 'tool' && toolName) {
            return { role, content, tool_call_id: 'dummy_id', name: toolName };
        }
        return { role, content };
    };

    describe('truncateToolOutput', () => {
        it('should truncate normal tool output to DEFAULT_LIMIT (2000)', () => {
            const longOutput = 'a'.repeat(3000);
            const truncated = ContextManager.truncateToolOutput('unknown_tool', longOutput);
            expect(truncated.length).toBeLessThan(3000);
            expect(truncated.startsWith('a'.repeat(2000))).toBe(true);
            expect(truncated).toContain('[Truncated 3000 chars]');
        });

        it('should not truncate output within limits', () => {
            const shortOutput = 'a'.repeat(1000);
            const truncated = ContextManager.truncateToolOutput('unknown_tool', shortOutput);
            expect(truncated).toBe(shortOutput);
        });

        it('should use custom limits for specific tools', () => {
            const longOutput = 'a'.repeat(30000); // 30k

            // load_skill has 32000 limit, so 30k should not be truncated
            const truncated = ContextManager.truncateToolOutput('load_skill', longOutput);
            expect(truncated).toBe(longOutput);

            const overLimitOutput = 'a'.repeat(35000);
            const truncatedOver = ContextManager.truncateToolOutput('load_skill', overLimitOutput);
            expect(truncatedOver.length).toBeLessThan(35000);
            expect(truncatedOver.startsWith('a'.repeat(32000))).toBe(true);
        });
    });

    describe('prune', () => {
        it('should return all messages if within budget', () => {
            const cm = new ContextManager({ maxTokens: 100, preserveRecentMessages: 2 });
            const messages: ChatMessage[] = [
                createDummyMessage('system', 10), // ~10 tokens
                createDummyMessage('user', 10)    // ~10 tokens
            ];

            const pruned = cm.prune(messages);
            expect(pruned).toHaveLength(2);
            expect(pruned).toEqual(messages);
        });

        it('should keep system prompt even if budget is exceeded', () => {
            const cm = new ContextManager({ maxTokens: 10, preserveRecentMessages: 1 });
            const messages: ChatMessage[] = [
                createDummyMessage('system', 20), // 20 tokens, over budget!
                createDummyMessage('user', 10)
            ];

            const pruned = cm.prune(messages);

            expect(pruned).toHaveLength(2);
            expect(pruned[0].role).toBe('system');
            expect(pruned[1].role).toBe('system');
            expect(pruned[1].content).toContain('[Earlier Context]');
        });

        it('should remove oldest messages to fit budget', () => {
            const cm = new ContextManager({ maxTokens: 30, preserveRecentMessages: 1 });
            const messages: ChatMessage[] = [
                createDummyMessage('system', 5),
                createDummyMessage('user', 10), // Msg 1 (oldest mutable)
                createDummyMessage('assistant', 10), // Msg 2
                createDummyMessage('user', 10), // Msg 3 (kept because preserveRecent=1)
            ];
            // Total tokens ~ 35 (plus overhead)
            // Should prune Msg 1, maybe Msg 2

            const pruned = cm.prune(messages);
            expect(pruned[0].role).toBe('system');

            // Since preserveRecentMessages=1, the last 'user' is protected.
            // It will remove 'user' (Msg 1) to free ~10 tokens, reaching ~25, which is <= 30.
            expect(pruned).not.toContain(messages[1]);
        });

        it('should preserve tool call atomicity', () => {
            const cm = new ContextManager({ maxTokens: 20, preserveRecentMessages: 1 });

            const messages: ChatMessage[] = [
                createDummyMessage('system', 5),
                {
                    role: 'assistant',
                    content: 'calling tool',
                    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 't', arguments: '{}' } }]
                },
                createDummyMessage('tool', 20, 't'),
                createDummyMessage('user', 5),
            ];

            // Here:
            // - System is immutable
            // - Last user msg is protected (preserve=1)
            // - The assistant + tool pair should be removed together, or kept together.
            // Total tokens ~ 5 + 10 + 20 + 5 = 40.
            // Budget 20. Must remove middle group.

            const pruned = cm.prune(messages);
            expect(pruned).toHaveLength(3);
            expect(pruned[0].role).toBe('system');
            expect(pruned[1].role).toBe('system');
            expect(pruned[1].content).toContain('[Earlier Context]');
            expect(pruned[2].role).toBe('user');
        });

        it('ensureToolCallAtomicity modifies preserveRecentMessages to include assistant', () => {
            const cm = new ContextManager({ maxTokens: 10, preserveRecentMessages: 2 });

            const messages: ChatMessage[] = [
                createDummyMessage('system', 5),
                createDummyMessage('user', 5),
                {
                    role: 'assistant',
                    content: 'calling tool',
                    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 't', arguments: '{}' } }]
                }, // index 2
                createDummyMessage('tool', 5, 't'), // index 3
                createDummyMessage('user', 5), // index 4
            ];

            // Recents=2 means indices 3, 4 are protected.
            // But index 3 is a tool response. Its assistant is index 2.
            // So index 2 must also be protected!
            // Budget is 10.
            // System(5) + Assistant(5) + Tool(5) + User(5) = 20 > 10.
            // It tries to prune. Mutable is index 1 (user msg).
            // It will remove index 1.

            const pruned = cm.prune(messages);

            expect(pruned).toHaveLength(2);
            expect(pruned.map(m => m.role)).toEqual(['system', 'system']);
            expect(pruned[1].content).toContain('[Earlier Context]');
        });
    });
});
