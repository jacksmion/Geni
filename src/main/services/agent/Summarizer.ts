
import { IChatModel, ChatMessage } from '../llm/IChatModel';
import { TokenCounter } from './TokenCounter';

/**
 * Summarizer Service
 * 
 * Phase 4.4: Summarization Service
 * 
 * Compresses conversation history to manageable size using LLM summarization.
 */
export class Summarizer {

    /**
     * Check if the conversation needs summarization
     * 
     * @param messages Current history
     * @param maxTokens Token limit
     * @param thresholdPercent Threshold to trigger summarization (0.0 - 1.0)
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
        // 1. Identify valid range to summarize
        // We do NOT summarize System messages (usually contain Core Instructions)
        // We do NOT summarize the most recent N messages (Active Context)

        let recentStartIdx = Math.max(0, messages.length - keepRecentCount);

        // --- 核心优化: 确保工具调用原子性 ---
        // 如果 recentStartIdx 落在 tool 消息上，或者落在一个紧跟在 assistant tool_calls 之后的工具链中，
        // 我们需要向前回溯，直到找到发起这个调用的 assistant 消息。
        // 这防止了 LLM 协议因切断 assistant/tool 对而崩溃。
        while (recentStartIdx > 0) {
            const currentMsg = messages[recentStartIdx];
            const prevMsg = messages[recentStartIdx - 1];

            // 1. 如果当前是 tool 消息，必须包含它前面的内容
            if (currentMsg.role === 'tool') {
                recentStartIdx--;
                continue;
            }

            // 2. 如果前一个是 assistant 且带有 tool_calls，则当前不能作为起始点（除非当前也是它的一部分）
            // 实际上，只要当前消息的 role 不是 user，且前一个是工具调用的 assistant，我们就得继续回溯
            if (prevMsg && prevMsg.role === 'assistant' && prevMsg.tool_calls) {
                recentStartIdx--;
                continue;
            }

            break;
        }

        // Filter out system messages and recent messages to get the "Middle"
        // But we need to preserve order, so let's identify indices.

        const middleMessages = messages.filter((m, i) => {
            return m.role !== 'system' && i < recentStartIdx;
        });

        // If nothing to summarize, return original
        if (middleMessages.length === 0) {
            return messages;
        }

        // 2. Generate Summary using the Model
        const conversationText = middleMessages.map(m => `${m.role.toUpperCase()}: ${m.content || '(Tool Output)'}`).join('\n---\n');

        const summarizationPrompt: ChatMessage[] = [
            {
                role: 'user',
                content: `Please read the following conversation history and create a concise summary. 
Focus on:
1. Key user preferences and requirements defined.
2. Important decisions made or actions taken.
3. The current state of the task.

Ignore trivial details.

Conversation History:
${conversationText}`
            }
        ];

        let summaryContent = "";

        try {
            if (model.invoke) {
                const response = await model.invoke(summarizationPrompt);
                summaryContent = response.content || "No summary generated.";
            } else {
                // Fallback to stream consumption
                const stream = model.stream(summarizationPrompt);
                for await (const event of stream) {
                    if (event.type === 'content_delta') {
                        summaryContent += event.delta;
                    }
                }
            }
        } catch (error) {
            console.error('[Summarizer] Failed to generate summary:', error);
            // Return original messages on failure to avoid data loss
            return messages;
        }

        // 3. Reassemble History
        // [All System Messages] + [Summary Message] + [Recent Messages]

        const systemMessages = messages.filter(m => m.role === 'system');
        const recentMessages = messages.slice(recentStartIdx);

        const summaryMessage: ChatMessage = {
            role: 'system',
            content: `[History Summary]: ${summaryContent}`
        };

        return [
            ...systemMessages,
            summaryMessage,
            ...recentMessages
        ];
    }
}
