import { OpenAI } from 'openai';
import { IAgentService, AgentRunOptions, AgentRunResult } from './IAgentService';
import { ITool } from '../../../common/types/tool';
import { ToolRegistry } from '../tools/ToolRegistry';
import { AppSettings, DEFAULT_PROVIDER_CONFIGS } from '../../../common/types/settings';

export class OpenAIAgentService implements IAgentService {
    private settings: AppSettings;
    private toolRegistry: ToolRegistry;

    constructor(settings: AppSettings, toolRegistry: ToolRegistry) {
        this.settings = settings;
        this.toolRegistry = toolRegistry;
    }

    public updateSettings(settings: AppSettings) {
        this.settings = settings;
    }

    async run(
        prompt: string,
        tools: ITool[],
        options?: AgentRunOptions,
        onStream?: (chunk: string, reset?: boolean) => void,
        onStepUpdate?: (steps: any[]) => void
    ): Promise<AgentRunResult> {
        // 获取当前激活的提供商配置（兼容旧配置结构）
        const activeProvider = this.settings.llm.activeProvider || 'OpenAI';
        const providers = this.settings.llm.providers || {};
        const providerConfig = providers[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider] || DEFAULT_PROVIDER_CONFIGS['OpenAI'];

        const client = new OpenAI({
            apiKey: providerConfig.apiKey || '',
            baseURL: providerConfig.baseUrl || 'https://api.openai.com/v1',
            dangerouslyAllowBrowser: true // Running in Electron Node process
        });

        // 1. Convert ITool[] to OpenAI Tool Definition
        const openaiTools = tools.map(t => {
            const def = t.getDefinition();
            return {
                type: 'function' as const,
                function: {
                    name: def.name,
                    description: def.description,
                    parameters: def.input_schema
                }
            };
        });

        // 2. 构建 System Prompt
        let systemPrompt = options?.systemPrompt || 'You are a helpful assistant capable of using tools.';

        // [增强] 强制思考步骤 (Chain of Thought)
        systemPrompt += `\n\n[Methodology]:
1. **Think**: Before using any tool, you MUST explain your reasoning and plan in a brief thought.
2. **Act**: Call the appropriate tool.
3. **Observe**: Analyze the tool output.
4. **Reflect**: If an error occurs, analyze why and correct your approach.`;

        // 注入当前工作目录信息，让 AI 意识到环境变化
        /* [已移除] 不再强行注入目录，改为由 AI 自行通过 get_env_info 获取
        const currentCwd = this.settings.workspacePath || process.cwd();
        systemPrompt += `\n\n[Current Working Directory]: ${currentCwd}\nFiles you see or operations you do will be relative to this directory.`;
        */
        systemPrompt += `\n\n[Environment]: If you need to know the current date, time, OS, or working directory (CWD) to perform a task, use the \`get_env_info\` tool first. Do NOT assume the current directory unless you have checked it.`;

        if (options?.skills && options.skills.length > 0) {
            const enabledSkills = options.skills.filter(s => s.enabled);
            if (enabledSkills.length > 0) {
                // 仅注入技能摘要（渐进式加载，不注入完整内容避免上下文爆炸）
                const skillSummary = enabledSkills
                    .map(s => `- **${s.id}**: ${s.description}`)
                    .join('\n');

                systemPrompt += `\n\n<skills>
You have access to the following skills:

${skillSummary}

**Important**: When you need to apply a skill's methodology, use the \`read_skill\` tool to load its full instructions first.
</skills>`;
            }
        }

        const messages: any[] = [
            { role: 'system', content: systemPrompt }
        ];

        // 注入历史记录
        if (options?.history && options.history.length > 0) {
            options.history.forEach((h: any) => {
                messages.push({
                    role: h.role,
                    content: h.content
                });
            });
        }

        // 添加当前用户输入
        messages.push({ role: 'user', content: prompt });

        const steps: any[] = [];
        let finalAnswer = '';
        let loopCount = 0;
        const MAX_LOOPS = 50;

        try {
            while (loopCount < MAX_LOOPS) {
                // Check Abort
                if (options?.signal?.aborted) {
                    throw new Error('Agent execution aborted by user.');
                }

                // 每个回合开始时，通知渲染进程重置内容缓冲区
                onStream?.('', true);

                loopCount++;

                // --- Context Sliding Window ---
                const MAX_HISTORY_ROUNDS = 20;
                let contextMessages = messages;

                if (messages.length > MAX_HISTORY_ROUNDS) {
                    const systemMsg = messages[0];
                    const recentMessages = messages.slice(-(MAX_HISTORY_ROUNDS - 1));
                    contextMessages = [systemMsg, ...recentMessages];
                }

                // --- Step 1: Call LLM ---
                const stream = await client.chat.completions.create({
                    model: options?.model || providerConfig.model,
                    messages: contextMessages,
                    tools: openaiTools.length > 0 ? openaiTools : undefined,
                    tool_choice: 'auto',
                    stream: true
                }, {
                    signal: options?.signal
                });

                let currentContent = '';
                let toolCallBuffer: any = null;
                let toolCalls: any[] = [];

                for await (const chunk of stream) {
                    const delta = chunk.choices[0]?.delta;
                    if (delta?.content) {
                        currentContent += delta.content;
                        onStream?.(delta.content);
                    }
                    if (delta?.tool_calls) {
                        const tcChunk = delta.tool_calls[0];
                        if (!toolCallBuffer) {
                            toolCallBuffer = {
                                index: tcChunk.index,
                                id: tcChunk.id,
                                type: tcChunk.type,
                                function: { name: tcChunk.function?.name || '', arguments: '' }
                            };
                        }
                        if (tcChunk.function?.arguments) {
                            toolCallBuffer.function.arguments += tcChunk.function.arguments;
                        }
                    }
                }

                if (toolCallBuffer) {
                    toolCalls.push(toolCallBuffer);
                }

                const assistantMsg = {
                    role: 'assistant',
                    content: currentContent || null,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
                };
                messages.push(assistantMsg);

                // --- Step 2: Handle Tool Calls ---
                if (toolCalls.length > 0) {
                    for (const tc of toolCalls) {
                        const fnName = tc.function.name;
                        let fnArgs = {};
                        try {
                            fnArgs = JSON.parse(tc.function.arguments);
                        } catch (e) {
                            console.error('Failed to parse tool args JSON:', tc.function.arguments);
                        }

                        const startTime = Date.now();

                        steps.push({
                            thought: currentContent,
                            tool: fnName,
                            toolInput: JSON.stringify(fnArgs),
                            isComplete: false
                        });
                        onStepUpdate?.([...steps]);

                        const result = await this.toolRegistry.executeTool(fnName, fnArgs);
                        const duration = Date.now() - startTime;

                        const MAX_OUTPUT_LENGTH = 2000;
                        let observation = result.result;
                        if (observation && observation.length > MAX_OUTPUT_LENGTH) {
                            observation = observation.substring(0, MAX_OUTPUT_LENGTH) +
                                `\n... [Content truncated (length: ${observation.length}). Output is too large to fit in context.]`;
                        }

                        if (result.isError) {
                            observation += `\n\n[System Note]: The previous tool execution failed. Please analyze the error and try a different approach.`;
                        }

                        messages.push({
                            role: 'tool',
                            tool_call_id: tc.id,
                            content: observation
                        });

                        const lastStep = steps[steps.length - 1];
                        lastStep.observation = observation;
                        lastStep.isComplete = true;
                        lastStep.duration = duration;
                        onStepUpdate?.([...steps]);
                    }
                } else {
                    // No tool calls -> Done!
                    finalAnswer = currentContent;
                    break;
                }
            }

            if (loopCount >= MAX_LOOPS) {
                const warningMsg = `\n\n---\n⚠️ **Agent 达到最大执行步数限制 (${MAX_LOOPS} 步)**\n请发送消息让 Agent 继续。`;
                finalAnswer = (finalAnswer || '') + warningMsg;
                onStream?.(warningMsg);
            }

        } catch (error: any) {
            console.error('[OpenAIAgent] Error:', error);
            return {
                finalAnswer: `Error: ${error.message}`,
                steps
            };
        }

        return { finalAnswer, steps };
    }
}
