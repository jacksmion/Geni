
import { ChatMessage } from '../llm/IChatModel';

/**
 * Token counting utility
 * 
 * Phase 4.1: Token Counter
 * 
 * Implements a simple estimation strategy for token counting.
 * Future improvements could integrate `tiktoken` for accurate counts.
 */
export class TokenCounter {
    /**
     * Estimate tokens for a string
     * 
     * Strategy:
     * - ASCII (~1 token per 4 chars): English text, code, JSON
     * - Non-ASCII (~1 token per 1.5 chars): CJK, emoji, etc.
     */
    static count(text: string | null | undefined): number {
        if (!text) return 0;
        const len = text.length;
        // Optimization: Use regex to count non-ASCII characters instead of per-character loop.
        // This is significantly faster for large strings.
        // eslint-disable-next-line no-control-regex
        const nonAsciiCount = (text.match(/[^\x00-\x7F]/g) || []).length;
        const asciiCount = len - nonAsciiCount;
        return Math.ceil(asciiCount / 4 + nonAsciiCount / 1.5);
    }

    /**
     * Estimate total tokens for a list of messages
     */
    static countMessages(messages: ChatMessage[]): number {
        let total = 0;

        for (const msg of messages) {
            // Content tokens
            total += this.count(msg.content);

            // Role overhead (approximate)
            total += 4;

            // Tool calls overhead
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (const call of msg.tool_calls) {
                    total += this.count(call.function.name);
                    total += this.count(call.function.arguments);
                    total += 10; // Overhead for tool call structure
                }
            }

            // Tool call ID overhead
            if (msg.tool_call_id) {
                total += this.count(msg.tool_call_id);
            }
        }

        return total;
    }
}
