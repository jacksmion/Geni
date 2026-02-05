
// @ts-nocheck
import { tool, query } from '@anthropic-ai/claude-agent-sdk';
import { Skill } from '../../common/types/skill';
import { PythonBridge } from './PythonBridge';

export class ClaudeAgentService {
    private pyBridge: PythonBridge;

    constructor() {
        this.pyBridge = new PythonBridge();
    }

    /**
     * 将通用 Skills 转换为 Claude SDK Tools并在 query 中使用
     */
    public async runAgent(
        prompt: string,
        skills: Skill[],
        apiKey: string,
        onStream?: (text: string) => void
    ): Promise<{ finalAnswer: string; steps: any[] }> {
        // 设置环境变量，SDK 会读取
        process.env.ANTHROPIC_API_KEY = apiKey;

        // 1. 转换工具
        const tools = skills
            .filter(s => s.enabled)
            // @ts-ignore - SDK types mismatch
            .map(skill => tool(
                skill.id,
                skill.description,
                {
                    type: 'object',
                    properties: {
                        arguments: {
                            type: 'string',
                            description: 'JSON string or arguments for the skill'
                        }
                    },
                    required: ['arguments']
                },
                // Handler
                async (input: any) => {
                    const code = input.arguments || '';
                    console.log(`[ClaudeAgent] Executing tool ${skill.id} with args:`, code);
                    try {
                        const res = await this.pyBridge.executeCode(code);
                        return res.stdout || res.stderr || 'Execution success, but no output.';
                    } catch (e: any) {
                        return `Error: ${e.message}`;
                    }
                }
            ));

        const steps: any[] = [];
        let finalAnswer = '';

        try {
            // 2. 调用 SDK
            console.log('[ClaudeAgent] Starting query...');
            // @ts-ignore
            const result = await query({
                prompt: prompt,
                // @ts-ignore
                tools: tools,
                // verbose: true 
            });

            // 3. 处理流式消息
            // 注意：根据探针输出，sdkMessages 是 AsyncGenerator
            // 我们需要监听它来捕获 Thought 和 Action
            // 下面的逻辑基于对 Agent SDK常见模式的推测，因为没有文档

            // @ts-ignore
            for await (const msg of result.sdkMessages) {
                console.log('[ClaudeAgent] Message:', msg);

                // 尝试解析消息类型，构建 steps
                // 这部分需要根据实际返回的数据结构调整
                if (msg.type === 'tool_use') {
                    steps.push({
                        thought: 'Claude decided to use a tool', // SDK 可能不直接暴露 Thought 文本
                        action: msg.name,
                        actionInput: JSON.stringify(msg.input),
                        isComplete: false
                    });
                } else if (msg.type === 'tool_result') {
                    if (steps.length > 0) {
                        steps[steps.length - 1].observation = msg.content;
                    }
                } else if (msg.type === 'message_stop' || msg.type === 'content_block_stop') {
                    // 结束
                }

                // 累积最后的回复
                if (msg.type === 'content_block' && msg.text) {
                    finalAnswer += msg.text;
                    onStream?.(msg.text);
                }
            }

            // 如果 SDK 还没有返回完整 Final Answer，可能在 result 的其他属性里？
            // 探针输出的 result 包含了 initialization Promise，可能需要等待？

            // 暂时假设流处理完就是结束

        } catch (error: any) {
            console.error('[ClaudeAgent] Error:', error);
            return {
                finalAnswer: `Agent Error: ${error.message}`,
                steps
            };
        }

        return { finalAnswer, steps };
    }
}
