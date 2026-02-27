import { describe, it, expect } from 'vitest';
import { TokenCounter } from '@/main/services/agent/TokenCounter';
import { ChatMessage } from '@/common/types/chat';

describe('TokenCounter', () => {
    describe('count string tokens', () => {
        it('should return 0 for undefined, null, or empty string', () => {
            expect(TokenCounter.count(undefined)).toBe(0);
            expect(TokenCounter.count(null)).toBe(0);
            expect(TokenCounter.count('')).toBe(0);
        });

        it('should correctly count ASCII characters', () => {
            // ASCII ~ 1 token per 4 chars
            expect(TokenCounter.count('a')).toBe(1); // 1 / 4 -> Math.ceil(0.25) -> 1
            expect(TokenCounter.count('abcd')).toBe(1); // 4 / 4 -> 1
            expect(TokenCounter.count('abcde')).toBe(2); // 5 / 4 -> 2

            const longString = 'a'.repeat(400);
            expect(TokenCounter.count(longString)).toBe(100);
        });

        it('should correctly count non-ASCII characters', () => {
            // Non-ASCII ~ 1 token per 1.5 chars
            expect(TokenCounter.count('中')).toBe(1); // 1 / 1.5 -> Math.ceil(0.66) -> 1
            expect(TokenCounter.count('中文')).toBe(2); // 2 / 1.5 -> Math.ceil(1.33) -> 2
            expect(TokenCounter.count('こんにちは')).toBe(4); // 5 / 1.5 -> Math.ceil(3.33) -> 4
            expect(TokenCounter.count('😊')).toBe(2); // Emojis are typically 2 code units in JS strings, 2 / 1.5 -> 2
        });

        it('should count mixed strings correctly', () => {
            // "Hello世界" -> 5 ASCII + 2 Non-ASCII -> Math.ceil(1.25 + 1.33) = Math.ceil(2.58) = 3
            expect(TokenCounter.count('Hello世界')).toBe(3);
        });
    });

    describe('count messages tokens', () => {
        it('should return 0 for empty array', () => {
            expect(TokenCounter.countMessages([])).toBe(0);
        });

        it('should count simple user message with overhead', () => {
            const message: ChatMessage = { role: 'user', content: 'hello' }; // content: 'hello' is 5 ascii -> 2 tokens
            // base overhead per msg -> 4
            // 2 + 4 = 6
            expect(TokenCounter.countMessages([message])).toBe(6);
        });

        it('should count multiple messages', () => {
            const messages: ChatMessage[] = [
                { role: 'user', content: 'hi' }, // 'hi' -> 2 ascii -> 1 token + 4 = 5
                { role: 'assistant', content: 'hello there' } // 'hello there' -> 11 ascii -> 3 tokens + 4 = 7
            ];
            expect(TokenCounter.countMessages(messages)).toBe(12);
        });

        it('should add tool call overhead', () => {
            const message: ChatMessage = {
                role: 'assistant',
                content: 'I will call a tool', // 18 ascii -> 5 tokens + 4 = 9
                tool_calls: [
                    {
                        id: 'call_1',
                        type: 'function',
                        function: {
                            name: 'myTool', // 6 ascii -> 2 tokens
                            arguments: '{"arg":"val"}' // 13 ascii -> 4 tokens
                        }
                    }
                ]
            };
            // Tool call overhead: 10
            // Content + msg overhead: 9
            // Tool parts: 2 (name) + 4 (args) + 10 (call overhead) = 16
            // Total: 9 + 16 = 25
            expect(TokenCounter.countMessages([message])).toBe(25);
        });

        it('should count msg.tool_call_id', () => {
            const message: ChatMessage = {
                role: 'tool',
                content: 'tool result', // 11 ascii -> 3 tokens + 4 = 7
                tool_call_id: 'call_1', // 6 ascii -> 2 tokens
                name: 'myTool'
            };
            // 7 + 2 = 9
            expect(TokenCounter.countMessages([message])).toBe(9);
        });
    });
});
