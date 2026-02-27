import { describe, it, expect, vi } from 'vitest';
import { Summarizer } from '@/main/services/agent/Summarizer';
import { IChatModel, ChatMessage } from '@/main/services/llm/IChatModel';

describe('Summarizer', () => {
    // Mock token counter to return strings length roughly
    vi.mock('@/main/services/agent/TokenCounter', () => ({
        TokenCounter: {
            countMessages: vi.fn((msgs: ChatMessage[]) => msgs.reduce((acc, m) => acc + (m.content?.length || 0) / 4, 0)),
            count: vi.fn((text: string) => text.length / 4)
        }
    }));

    // Mock IChatModel
    const mockModel: IChatModel = {
        modelId: 'mock-model',
        provider: 'mock',
        invoke: vi.fn().mockResolvedValue({ role: 'assistant', content: 'MOCK SUMMARY OUTPUT' }),
        stream: vi.fn()
    } as unknown as IChatModel;

    it('shouldSummarize should correctly identify threshold crossing', () => {
        const msgs: ChatMessage[] = [
            { role: 'user', content: 'A'.repeat(400) } // ~100 tokens
        ];

        // 100 > 100 * 0.8 (80) -> true
        expect(Summarizer.shouldSummarize(msgs, 100, 0.8)).toBe(true);

        // 100 > 200 * 0.8 (160) -> false
        expect(Summarizer.shouldSummarize(msgs, 200, 0.8)).toBe(false);
    });

    describe('summarize logic', () => {
        it('should group middle messages into a summary and retain system and recent', async () => {
            const summarizer = new Summarizer();

            const messages: ChatMessage[] = [
                { role: 'system', content: 'SysPrompt' },
                { role: 'user', content: 'Old message 1' },
                { role: 'assistant', content: 'Old reply 1' },
                { role: 'user', content: 'Recent msg 1' },
                { role: 'assistant', content: 'Recent msg 2' },
                { role: 'user', content: 'Recent msg 3' }
            ];

            // Keep only the last 3 as recent
            const result = await summarizer.summarize(messages, mockModel, 3);

            expect(result.length).toBe(5); // 1 sys + 1 summary + 3 recent
            expect(result[0].role).toBe('system');

            // The Summary Message
            expect(result[1].role).toBe('system');
            expect(result[1].content).toContain('[Conversation History Summary]');
            expect(result[1].content).toContain('MOCK SUMMARY OUTPUT');

            // The remaining recent messages
            expect(result[2].content).toBe('Recent msg 1');
            expect(result[3].content).toBe('Recent msg 2');
            expect(result[4].content).toBe('Recent msg 3');
        });

        it('should enforce tool atomicity boundaries bridging tool_calls and tools', async () => {
            const summarizer = new Summarizer();
            const messages: ChatMessage[] = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Thinking', tool_calls: [{ id: '1', type: 'function', function: { name: 't', arguments: '{}' } }] },
                { role: 'tool', tool_call_id: '1', content: 'Result' },
                { role: 'assistant', content: 'Finished' },
            ];

            // Try to split right in the middle of a tool call
            // It should push the boundary back so the tool_call and tool response stay in 'recent'
            // keepRecentCount = 2 means keeping 'tool' and 'Finished'
            // Atomicity logic should push boundary to include 'assistant (tool_calls)'
            const result = await summarizer.summarize(messages, mockModel, 2);

            // 1 user -> summarized into 1 system msg
            // 3 tool chain msgs -> retained as recent
            expect(result.length).toBe(4);
            expect(result[1].role).toBe('assistant');
            expect(result[1].tool_calls).toBeDefined();
            expect(result[2].role).toBe('tool');
        });

        it('should format message payload correctly protecting against prompt injections and huge buffers', async () => {
            const summarizer = new Summarizer();

            // Expose private method for testing string builder directly
            const formatMessagesForSummary = (summarizer as any).formatMessagesForSummary.bind(summarizer);

            const messages: ChatMessage[] = [
                { role: 'user', content: 'Hi' },
                { role: 'assistant', content: 'I will run this', tool_calls: [{ id: 't1', type: 'function', function: { name: 'list_dir', arguments: '{"path":"/"}' } }] },
                { role: 'tool', tool_call_id: 't1', content: 'X'.repeat(2000) } // Huge 2k output
            ];

            const stringPayload = formatMessagesForSummary(messages);

            expect(stringPayload).toContain('USER: Hi');
            expect(stringPayload).toContain('ASSISTANT (tool calls):');
            expect(stringPayload).toContain('→ list_dir({"path":"/"})');

            // Tool output truncation safety check (~500 chars limit built into class)
            expect(stringPayload).toContain('TOOL RESULT: ' + 'X'.repeat(500) + '... (truncated)');
            expect(stringPayload.length).toBeLessThan(1500);
        });
    });
});
