
import { ChatMessage } from '../llm/IChatModel';
import { TokenCounter } from './TokenCounter';

/**
 * Configuration options for ContextManager
 */
export interface ContextManagerOptions {
    /** Maximum allowed tokens in the context window */
    maxTokens: number;
    /** Number of recent messages to always preserve (sliding window tail) */
    preserveRecentMessages: number;
}

/**
 * Context Manager
 * 
 * Phase 4.2: Context Engine
 * 
 * Manages the message history to ensure it fits within the token budget.
 * Implements a "System + Sliding Window" strategy.
 */
export class ContextManager {
    private maxTokens: number;
    private preserveRecentMessages: number;

    constructor(options: ContextManagerOptions = { maxTokens: 12000, preserveRecentMessages: 10 }) {
        this.maxTokens = options.maxTokens;
        this.preserveRecentMessages = options.preserveRecentMessages;
    }

    /**
     * Prune messages to fit within token limit
     * 
     * Strategy:
     * 1. Always keep System Prompts
     * 2. Always keep the last N messages (defined by preserveRecentMessages)
     * 3. Remove from the "middle" (oldest non-system, non-recent messages)
     */
    prune(messages: ChatMessage[]): ChatMessage[] {
        const totalTokens = TokenCounter.countMessages(messages);

        if (totalTokens <= this.maxTokens) {
            return messages;
        }

        // Identify indices required to keep
        const immutableIndices = new Set<number>();

        // 1. Keep System Prompts
        messages.forEach((m, i) => {
            if (m.role === 'system') immutableIndices.add(i);
        });

        // 2. Keep Recents
        const startIndexToKeep = Math.max(0, messages.length - this.preserveRecentMessages);
        for (let i = startIndexToKeep; i < messages.length; i++) {
            immutableIndices.add(i);
        }

        // Identify candidates for removal (sorted by index ASC -> oldest first)
        const mutableIndices: number[] = [];
        for (let i = 0; i < messages.length; i++) {
            if (!immutableIndices.has(i)) {
                mutableIndices.push(i);
            }
        }

        const indicesToRemove = new Set<number>();
        let currentEstimatedTokens = totalTokens;

        // Remove oldest mutable messages until we fit
        for (const idx of mutableIndices) {
            if (currentEstimatedTokens <= this.maxTokens) break;

            const msg = messages[idx];
            // Calculate tokens for this single message to subtract
            const count = TokenCounter.countMessages([msg]);

            currentEstimatedTokens -= count;
            indicesToRemove.add(idx);
        }

        return messages.filter((_, i) => !indicesToRemove.has(i));
    }
}
