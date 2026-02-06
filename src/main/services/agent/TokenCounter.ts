
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
     * Current strategy: 1 token ~= 4 characters
     */
    static count(text: string | null | undefined): number {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
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
