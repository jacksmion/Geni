
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
 * Manages the message history to ensure it fits within the token budget.
 * Implements a "System + Sliding Window" strategy with tool-call atomicity.
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
     * 2. Always keep the last N messages (with tool-call atomicity)
     * 3. Group middle messages into atomic units (assistant+tool pairs)
     * 4. Remove oldest groups first until within budget
     */
    prune(messages: ChatMessage[]): ChatMessage[] {
        const totalTokens = TokenCounter.countMessages(messages);

        if (totalTokens <= this.maxTokens) {
            return messages;
        }

        // Identify immutable indices
        const immutableIndices = new Set<number>();

        // 1. Keep System Prompts
        messages.forEach((m, i) => {
            if (m.role === 'system') immutableIndices.add(i);
        });

        // 2. Keep Recents (with tool-call atomicity)
        let startIndexToKeep = Math.max(0, messages.length - this.preserveRecentMessages);
        startIndexToKeep = this.ensureToolCallAtomicity(messages, startIndexToKeep);

        for (let i = startIndexToKeep; i < messages.length; i++) {
            immutableIndices.add(i);
        }

        // 3. Group mutable messages into atomic units
        const groups = this.buildAtomicGroups(messages, immutableIndices);

        // 4. Remove oldest groups first until we fit
        const indicesToRemove = new Set<number>();
        let currentTokens = totalTokens;

        for (const group of groups) {
            if (currentTokens <= this.maxTokens) break;

            const groupTokens = group.reduce(
                (sum, idx) => sum + TokenCounter.countMessages([messages[idx]]),
                0
            );
            for (const idx of group) {
                indicesToRemove.add(idx);
            }
            currentTokens -= groupTokens;
        }

        if (indicesToRemove.size > 0) {
            console.log(
                `[ContextManager] Pruned ${indicesToRemove.size} messages ` +
                `(${totalTokens - currentTokens} tokens freed, ` +
                `${currentTokens} tokens remaining, limit: ${this.maxTokens})`
            );
        }

        return messages.filter((_, i) => !indicesToRemove.has(i));
    }

    /**
     * Build atomic groups from mutable messages
     *
     * Groups assistant(tool_calls) + subsequent tool messages together,
     * so they are always removed as a unit, never split.
     *
     * Returns groups in order (oldest first) for sequential removal.
     */
    private buildAtomicGroups(messages: ChatMessage[], immutableIndices: Set<number>): number[][] {
        const groups: number[][] = [];
        let i = 0;

        while (i < messages.length) {
            if (immutableIndices.has(i)) {
                i++;
                continue;
            }

            const msg = messages[i];

            // If this is an assistant with tool_calls, group it with subsequent tool messages
            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                const group = [i];
                let j = i + 1;
                while (j < messages.length && messages[j].role === 'tool' && !immutableIndices.has(j)) {
                    group.push(j);
                    j++;
                }
                groups.push(group);
                i = j;
                continue;
            }

            // Standalone tool message without preceding assistant (orphan) — group alone
            // Or standalone user/assistant message — group alone
            groups.push([i]);
            i++;
        }

        return groups;
    }

    /**
     * Ensure the split point doesn't break assistant/tool pairs
     */
    private ensureToolCallAtomicity(messages: ChatMessage[], startIdx: number): number {
        while (startIdx > 0) {
            const currentMsg = messages[startIdx];
            const prevMsg = messages[startIdx - 1];

            if (currentMsg.role === 'tool') {
                startIdx--;
                continue;
            }

            if (prevMsg && prevMsg.role === 'assistant' && prevMsg.tool_calls) {
                startIdx--;
                continue;
            }

            break;
        }
        return startIdx;
    }

    // ========================================================================
    // Tool Output Management
    // ========================================================================

    /** Truncation limits per tool category */
    private static readonly LIMITS: Record<string, number> = {
        'load_skill': 32000,
        'read': 32000,
    };
    private static readonly DEFAULT_LIMIT = 2000;

    /**
     * Truncate tool execution output to prevent context bloat
     *
     * @param toolName Name of the tool that produced the output
     * @param output Raw tool output
     * @returns Truncated output
     */
    static truncateToolOutput(toolName: string, output: string): string {
        if (!output) return output;
        const limit = ContextManager.LIMITS[toolName] ?? ContextManager.DEFAULT_LIMIT;
        if (output.length <= limit) return output;
        return output.substring(0, limit) + `\n... [Truncated ${output.length} chars]`;
    }

    /**
     * Dehydrate tool call arguments in-place after execution
     *
     * For write/edit tools, the arguments contain the full file content
     * which is no longer needed after execution. Replace with placeholder.
     *
     * @param toolName Name of the executed tool
     * @param toolCallId ID of the tool call
     * @param messages Current message history (mutated in-place)
     */
    static dehydrateToolCall(toolName: string, toolCallId: string, messages: ChatMessage[]): void {
        if (!['write', 'edit'].includes(toolName)) return;

        const assistantMsg = messages.find(
            m => m.role === 'assistant' && m.tool_calls?.some(tc => tc.id === toolCallId)
        );
        if (!assistantMsg?.tool_calls) return;

        const tc = assistantMsg.tool_calls.find(tc => tc.id === toolCallId);
        if (!tc) return;

        try {
            const args = JSON.parse(tc.function.arguments);
            let modified = false;
            if (args.content?.length > 1000) { args.content = `[FILE_CONTENT_DEHYDRATED: ${args.content.length} chars written to disk — do not reuse this placeholder]`; modified = true; }
            if (args.target?.length > 500) { args.target = `[MATCH_TARGET_DEHYDRATED: ${args.target.length} chars — do not reuse this placeholder]`; modified = true; }
            if (args.replacement?.length > 500) { args.replacement = `[REPLACEMENT_DEHYDRATED: ${args.replacement.length} chars — do not reuse this placeholder]`; modified = true; }
            if (modified) tc.function.arguments = JSON.stringify(args);
        } catch { }
    }
}
