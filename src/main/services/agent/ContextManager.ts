
import { ChatMessage } from '../llm/IChatModel';
import { TokenCounter } from './TokenCounter';

/**
 * Configuration options for ContextManager
 */
export interface ContextManagerOptions {
    /** Maximum allowed tokens in the context window */
    maxTokens: number;
    /** Max messages to preserve in recent window (fallback upper bound) */
    preserveRecentMessages: number;
    /** Token budget for the preserved recent window (default: 50% of maxTokens) */
    preserveRecentTokens?: number;
}

/**
 * Summary extracted from pruned messages — no LLM call needed
 */
interface PrunedSummary {
    userIntents: string[];
    toolHistory: Map<string, number>;
    removedCount: number;
}

/**
 * Context Manager
 *
 * Manages the message history to ensure it fits within the token budget.
 * Implements "System + Token-budget Window" strategy with:
 * - Token-based preservation (not fixed count)
 * - Lightweight placeholders for pruned context
 * - Tool-call atomicity protection
 * - Oversized preserved region truncation
 */
export class ContextManager {
    private maxTokens: number;
    private preserveRecentMessages: number;
    private preserveRecentTokens: number;

    constructor(options: ContextManagerOptions = { maxTokens: 12000, preserveRecentMessages: 10 }) {
        this.maxTokens = options.maxTokens;
        this.preserveRecentMessages = options.preserveRecentMessages;
        this.preserveRecentTokens = options.preserveRecentTokens ?? Math.floor(options.maxTokens * 0.5);
    }

    /**
     * Update maxTokens for the current model's context window
     */
    setMaxTokens(maxTokens: number): void {
        this.maxTokens = maxTokens;
        // Re-scale the preserved token budget
        this.preserveRecentTokens = Math.floor(maxTokens * 0.5);
    }

    /**
     * Prune messages to fit within token limit
     *
     * Strategy:
     * 1. Always keep System Prompts
     * 2. Preserve recent messages by TOKEN budget (not fixed count)
     * 3. Group removable messages into atomic units (assistant+tool pairs)
     * 4. Remove oldest groups first, generating a lightweight placeholder
     * 5. If preserved region itself exceeds budget, truncate tool outputs
     */
    prune(messages: ChatMessage[]): ChatMessage[] {
        const totalTokens = TokenCounter.countMessages(messages);

        if (totalTokens <= this.maxTokens) {
            return messages;
        }

        // Phase 1: Identify immutable regions
        const systemIndices = new Set<number>();
        const preservedIndices = new Set<number>();

        // 1a. System messages are always immutable
        messages.forEach((m, i) => {
            if (m.role === 'system') {
                systemIndices.add(i);
                preservedIndices.add(i);
            }
        });

        // 1b. Recent messages preserved by token budget
        const preservedStart = this.findPreservedStartByTokens(messages, preservedIndices);
        for (let i = preservedStart; i < messages.length; i++) {
            preservedIndices.add(i);
        }

        // Phase 2: Build atomic groups from removable messages
        const groups = this.buildAtomicGroups(messages, preservedIndices);

        // Phase 3: Remove oldest groups until within budget
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

        if (indicesToRemove.size === 0) {
            // Nothing to remove — preserved region itself is too large
            return this.truncatePreservedRegion(messages, preservedIndices);
        }

        // Phase 4: Generate placeholder from removed messages
        const summary = this.extractSummary(messages, indicesToRemove);

        // Phase 5: Build result
        const result = messages.filter((_, i) => !indicesToRemove.has(i));

        if (summary) {
            const placeholder = this.buildPlaceholder(summary);
            // Insert placeholder after system messages, before preserved content
            const firstNonSystem = result.findIndex(m => m.role !== 'system');
            if (firstNonSystem === -1) {
                result.push(placeholder);
            } else {
                result.splice(firstNonSystem, 0, placeholder);
            }
        }

        // Phase 6: Check if still over budget after placeholder insertion
        const finalTokens = TokenCounter.countMessages(result);
        if (finalTokens > this.maxTokens) {
            return this.truncatePreservedRegion(result, new Set<number>());
        }

        if (indicesToRemove.size > 0) {
            console.log(
                `[ContextManager] Pruned ${indicesToRemove.size} messages ` +
                `(${totalTokens - currentTokens} tokens freed, ` +
                `placeholder: ${summary ? 'yes' : 'no'})`
            );
        }

        return result;
    }

    /**
     * Find the start index of the preserved region by walking backwards
     * and respecting token budget + tool-call atomicity.
     */
    private findPreservedStartByTokens(messages: ChatMessage[], systemIndices: Set<number>): number {
        let tokenSum = 0;
        let count = 0;
        let startIdx = messages.length;

        while (startIdx > 0) {
            const prevIdx = startIdx - 1;
            const msg = messages[prevIdx];

            // Never include system messages in the walk
            if (systemIndices.has(prevIdx)) break;

            const msgTokens = TokenCounter.countMessages([msg]);

            // Check if including this message would exceed token budget
            if (tokenSum + msgTokens > this.preserveRecentTokens) break;

            // Check message count limit (safety upper bound)
            if (count + 1 > this.preserveRecentMessages) break;

            tokenSum += msgTokens;
            count++;
            startIdx = prevIdx;
        }

        // Ensure tool-call atomicity — walk back to include the assistant message
        // that initiated the first tool call in the preserved region
        startIdx = this.ensureToolCallAtomicity(messages, startIdx);

        return startIdx;
    }

    /**
     * Build atomic groups from removable messages
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

            // Standalone message — group alone
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

    /**
     * Extract a lightweight summary from messages being removed.
     * No LLM call — pure string operations.
     */
    private extractSummary(messages: ChatMessage[], removedIndices: Set<number>): PrunedSummary | null {
        const userIntents: string[] = [];
        const toolHistory = new Map<string, number>();
        let removedCount = 0;

        for (const idx of removedIndices) {
            const msg = messages[idx];
            removedCount++;

            if (msg.role === 'user') {
                const text = this.extractText(msg.content);
                if (text) {
                    userIntents.push(text.length > 100 ? text.slice(0, 100) + '...' : text);
                }
            } else if (msg.role === 'assistant' && msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                    const name = tc.function?.name || 'unknown';
                    toolHistory.set(name, (toolHistory.get(name) || 0) + 1);
                }
            }
        }

        if (removedCount === 0) return null;

        // Keep only last 3 user intents to limit placeholder size
        const recentIntents = userIntents.slice(-3);

        return {
            userIntents: recentIntents,
            toolHistory,
            removedCount
        };
    }

    /**
     * Build a lightweight placeholder system message from the summary.
     */
    private buildPlaceholder(summary: PrunedSummary): ChatMessage {
        const parts: string[] = ['[Earlier Context]'];

        if (summary.userIntents.length > 0) {
            parts.push(`User: ${summary.userIntents.join('; ')}`);
        }

        if (summary.toolHistory.size > 0) {
            const toolList = Array.from(summary.toolHistory.entries())
                .map(([name, count]) => `${name}(${count})`)
                .join(', ');
            parts.push(`Tools: ${toolList}`);
        }

        parts.push(`${summary.removedCount} messages omitted.`);

        return {
            role: 'system',
            content: parts.join('\n')
        };
    }

    /**
     * Truncate tool outputs in the preserved region when it exceeds budget.
     * Processes oldest tool messages first.
     */
    private truncatePreservedRegion(messages: ChatMessage[], protectedIndices: Set<number>): ChatMessage[] {
        const result = [...messages];
        const maxToolChars = 500; // Aggressive truncation for preserved region overflow

        // Calculate current tokens
        let currentTokens = TokenCounter.countMessages(result);

        if (currentTokens <= this.maxTokens) return result;

        // Find and truncate large tool messages, oldest first
        for (let i = 0; i < result.length && currentTokens > this.maxTokens; i++) {
            if (protectedIndices.has(i)) continue;

            const msg = result[i];
            if (msg.role !== 'tool') continue;

            const text = this.extractText(msg.content);
            if (text && text.length > maxToolChars) {
                const originalTokens = TokenCounter.countMessages([msg]);
                const truncated = text.slice(0, maxToolChars) + `\n... [Truncated for context management]`;
                result[i] = { ...msg, content: truncated };
                const newTokens = TokenCounter.countMessages([result[i]]);
                currentTokens -= (originalTokens - newTokens);
            }
        }

        console.log(`[ContextManager] Truncated preserved region tool outputs, tokens now: ${currentTokens}`);
        return result;
    }

    /**
     * Extract plain text from message content
     */
    private extractText(content: ChatMessage['content']): string {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.filter(p => p.type === 'text').map(p => (p as any).text).join('\n');
        }
        return '';
    }

    // ========================================================================
    // Tool Output Management
    // ========================================================================

    /** Truncation limits per tool category */
    private static readonly LIMITS: Record<string, number> = {
        'load_skill': 32000,
        'read': 32000,
        'web_fetch': 20000,
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

}
