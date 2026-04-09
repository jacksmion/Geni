
import { IChatModel, ChatMessage } from '../llm/IChatModel';
import { TokenCounter } from './TokenCounter';

/**
 * Summarizer Service
 *
 * Compresses conversation history to manageable size using LLM summarization.
 *
 * Improvements:
 * - Tool output truncation to prevent summarize prompt from exceeding limits
 * - tool_calls info extraction (tool name + key args preserved in summary)
 * - Chunked summarization for very long histories
 * - Language-adaptive summarization prompt
 */

/** Max characters per tool output in the summarization text */
const TOOL_OUTPUT_MAX_CHARS = 500;
/** Max tokens for the summarization request itself */
const SUMMARIZE_REQUEST_MAX_TOKENS = 12000;

export class Summarizer {

    /**
     * Check if the conversation needs summarization
     */
    static shouldSummarize(messages: ChatMessage[], maxTokens: number, thresholdPercent: number = 0.8): boolean {
        const total = TokenCounter.countMessages(messages);
        return total > maxTokens * thresholdPercent;
    }

    /**
     * Summarize the conversation history
     *
     * Keeps System prompts and Recent messages intact.
     * Compresses the "middle" messages into a single summary system message.
     */
    async summarize(
        messages: ChatMessage[],
        model: IChatModel,
        keepRecentCount: number = 10
    ): Promise<ChatMessage[]> {
        // 1. Find the boundary for recent messages (with tool-call atomicity)
        let recentStartIdx = Math.max(0, messages.length - keepRecentCount);
        recentStartIdx = this.ensureToolCallAtomicity(messages, recentStartIdx);

        // 2. Extract middle messages to summarize
        const middleMessages = messages.filter((m, i) => {
            return m.role !== 'system' && i < recentStartIdx;
        });

        if (middleMessages.length === 0) {
            return messages;
        }

        // 3. Format messages for summarization (with truncation and tool info extraction)
        const conversationText = this.formatMessagesForSummary(middleMessages);

        // 4. Generate summary (with chunked fallback for very long histories)
        let summaryContent: string;
        try {
            summaryContent = await this.generateSummary(conversationText, model);
        } catch (error) {
            console.error('[Summarizer] Failed to generate summary:', error);
            return messages;
        }

        // 5. Reassemble: [System] + [Summary] + [Recent]
        const systemMessages = messages.filter(m => m.role === 'system');
        const recentMessages = messages.slice(recentStartIdx);

        const summaryMessage: ChatMessage = {
            role: 'system',
            content: `[Conversation History Summary]\n${summaryContent}`
        };

        return [
            ...systemMessages,
            summaryMessage,
            ...recentMessages
        ];
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
     * Format messages into readable text for summarization
     *
     * Key improvements:
     * - Extracts tool_calls info (tool name + key args) from assistant messages
     * - Truncates large tool outputs to prevent prompt explosion
     * - Preserves the semantic flow of the conversation
     */
    private formatMessagesForSummary(messages: ChatMessage[]): string {
        const parts: string[] = [];

        for (const msg of messages) {
            const textContent = this.extractText(msg.content);
            if (msg.role === 'assistant') {
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                    // Extract tool call info instead of losing it
                    const toolInfo = msg.tool_calls.map(tc => {
                        const args = this.truncateText(tc.function.arguments, 200);
                        return `  → ${tc.function.name}(${args})`;
                    }).join('\n');
                    const thought = textContent ? `${this.truncateText(textContent, 300)}\n` : '';
                    parts.push(`ASSISTANT (tool calls):\n${thought}${toolInfo}`);
                } else {
                    parts.push(`ASSISTANT: ${this.truncateText(textContent, 800)}`);
                }
            } else if (msg.role === 'tool') {
                // Truncate large tool outputs
                const output = this.truncateText(textContent, TOOL_OUTPUT_MAX_CHARS);
                parts.push(`TOOL RESULT: ${output}`);
            } else if (msg.role === 'user') {
                parts.push(`USER: ${textContent}`);
            }
        }

        return parts.join('\n---\n');
    }

    /**
     * Generate summary, with chunked fallback for very long conversation text
     */
    private async generateSummary(conversationText: string, model: IChatModel): Promise<string> {
        const textTokens = TokenCounter.count(conversationText);

        if (textTokens <= SUMMARIZE_REQUEST_MAX_TOKENS) {
            // Single-pass summarization
            return await this.callLlmForSummary(conversationText, model);
        }

        // Chunked summarization: split text, summarize each chunk, then merge
        console.log(`[Summarizer] Text too long (${textTokens} tokens), using chunked summarization`);
        const chunks = this.splitIntoChunks(conversationText, SUMMARIZE_REQUEST_MAX_TOKENS);
        const chunkSummaries: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            console.log(`[Summarizer] Summarizing chunk ${i + 1}/${chunks.length}`);
            const chunkSummary = await this.callLlmForSummary(chunks[i], model);
            chunkSummaries.push(chunkSummary);
        }

        // If multiple chunks, do a final merge summarization
        if (chunkSummaries.length > 1) {
            const mergedText = chunkSummaries.map((s, i) => `[Part ${i + 1}]: ${s}`).join('\n\n');
            return await this.callLlmForSummary(mergedText, model, true);
        }

        return chunkSummaries[0];
    }

    /**
     * Call LLM to generate a summary
     */
    private async callLlmForSummary(text: string, model: IChatModel, isMerge: boolean = false): Promise<string> {
        const instruction = isMerge
            ? '以下是分段总结的对话历史，请合并为一份简洁的整体摘要。'
            : '请阅读以下对话历史，生成简洁的摘要。';

        const prompt: ChatMessage[] = [
            {
                role: 'user',
                content: `${instruction}

重点关注：
1. 用户提出的需求和偏好
2. 已做出的关键决策和执行的操作
3. 当前任务的状态和进展
4. 涉及的关键文件和代码变更

忽略琐碎细节。用对话中使用的语言进行总结。

---
${text}`
            }
        ];

        let result = '';

        if (model.invoke) {
            const response = await model.invoke(prompt);
            result = this.extractText(response.content) || 'No summary generated.';
        } else {
            const stream = model.stream(prompt);
            for await (const event of stream) {
                if (event.type === 'content_delta') {
                    result += event.delta;
                }
            }
        }

        return result;
    }

    /**
     * Split text into chunks by paragraph boundaries
     */
    private splitIntoChunks(text: string, maxTokensPerChunk: number): string[] {
        const paragraphs = text.split('\n---\n');
        const chunks: string[] = [];
        let currentChunk = '';

        for (const para of paragraphs) {
            const combined = currentChunk ? `${currentChunk}\n---\n${para}` : para;
            if (TokenCounter.count(combined) > maxTokensPerChunk && currentChunk) {
                chunks.push(currentChunk);
                currentChunk = para;
            } else {
                currentChunk = combined;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * Truncate text with ellipsis
     */
    private truncateText(text: string, maxChars: number): string {
        if (text.length <= maxChars) return text;
        return text.slice(0, maxChars) + '... (truncated)';
    }

    /**
     * Helper to extract text from multimodal content format
     */
    private extractText(content: ChatMessage['content']): string {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.filter(p => p.type === 'text').map(p => (p as any).text).join('\n');
        }
        return '';
    }
}
