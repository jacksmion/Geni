import { describe, expect, it } from 'vitest';
import { OpenAIAdapter } from '@/main/services/llm/providers/OpenAIAdapter';
import type { ChatMessage } from '@/common/types/chat';

describe('OpenAIAdapter', () => {
    it('should drop malformed assistant tool calls and orphan tool messages before sending requests', () => {
        const adapter = new OpenAIAdapter({
            provider: 'openai',
            model: 'gpt-4o',
            apiKey: 'test-key',
        } as any);

        const messages: ChatMessage[] = [
            {
                role: 'assistant',
                content: null,
                tool_calls: [
                    {
                        id: 'call_bad',
                        type: 'function',
                        function: { name: 'read_file', arguments: '{"path":"foo.txt"' },
                    },
                ],
            },
            {
                role: 'tool',
                tool_call_id: 'call_bad',
                content: 'should not be sent',
            },
            {
                role: 'assistant',
                content: null,
                tool_calls: [
                    {
                        id: 'call_good',
                        type: 'function',
                        function: { name: 'list_dir', arguments: '{"path":"src"}' },
                    },
                ],
            },
            {
                role: 'tool',
                tool_call_id: 'call_good',
                content: 'ok',
            },
        ];

        const converted = (adapter as any).convertMessages(messages);

        expect(converted).toHaveLength(3);
        expect(converted[0]).toEqual({ role: 'assistant', content: '' });
        expect(converted[1]).toMatchObject({
            role: 'assistant',
            tool_calls: [
                {
                    id: 'call_good',
                    function: { name: 'list_dir', arguments: '{"path":"src"}' },
                },
            ],
        });
        expect(converted[2]).toEqual({
            role: 'tool',
            content: 'ok',
            tool_call_id: 'call_good',
        });
    });
});
