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

    async run(
        prompt: string,
        tools: ITool[],
        options?: AgentRunOptions,
        onStream?: (chunk: string) => void,
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

        // 2. 构建 System Prompt，注入启用的 Skills
        let systemPrompt = options?.systemPrompt || 'You are a helpful assistant capable of using tools.';

        if (options?.skills && options.skills.length > 0) {
            const enabledSkills = options.skills.filter(s => s.enabled);
            if (enabledSkills.length > 0) {
                // 技能摘要列表
                const skillSummary = enabledSkills
                    .map(s => `- **${s.name}**: ${s.description}`)
                    .join('\n');

                // 技能详细内容
                const skillContents = enabledSkills
                    .map(s => `## Skill: ${s.name}\n\n${s.content}`)
                    .join('\n\n---\n\n');

                systemPrompt += `\n\n<skills>
You have access to the following skills. Use them when appropriate:

${skillSummary}

### Skill Details

${skillContents}
</skills>`;
            }
        }

        const messages: any[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];

        const steps: any[] = [];
        let finalAnswer = '';
        let loopCount = 0;
        const MAX_LOOPS = 10;

        try {
            while (loopCount < MAX_LOOPS) {
                // Check Abort
                if (options?.signal?.aborted) {
                    throw new Error('Agent execution aborted by user.');
                }

                loopCount++;

                // --- Step 1: Call LLM ---
                const stream = await client.chat.completions.create({
                    model: options?.model || providerConfig.model,
                    messages: messages,
                    tools: openaiTools.length > 0 ? openaiTools : undefined,
                    tool_choice: 'auto', // Let model decide
                    stream: true
                }, {
                    signal: options?.signal // Pass abort signal to OpenAI client
                });

                let currentContent = '';
                let toolCallBuffer: any = null; // Buffer to assemble streaming tool calls
                let toolCalls: any[] = [];

                for await (const chunk of stream) {
                    const delta = chunk.choices[0]?.delta;

                    // A. Content Stream
                    if (delta?.content) {
                        currentContent += delta.content;
                        onStream?.(delta.content);
                    }

                    // B. Tool Call Stream (Complex!)
                    // OpenAI streams tool calls in chunks. We need to assemble them.
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

                        // Append arguments
                        if (tcChunk.function?.arguments) {
                            toolCallBuffer.function.arguments += tcChunk.function.arguments;
                        }
                    }
                }

                // If we finished a stream and had a buffered tool call, push it to our list
                // NOTE: Real robust implementation should handle multiple tool calls in parallel. 
                // For simplified V2, we handle the buffered one.
                if (toolCallBuffer) {
                    toolCalls.push(toolCallBuffer);
                }

                // Append assistant response to history
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

                        // Record Step
                        steps.push({
                            thought: currentContent, // Usually empty or brief context before tool call
                            tool: fnName,
                            toolInput: JSON.stringify(fnArgs),
                            isComplete: false
                        });
                        onStepUpdate?.([...steps]); // Notify

                        // Execute
                        const result = await this.toolRegistry.executeTool(fnName, fnArgs);

                        // Feed back to LLM
                        messages.push({
                            role: 'tool',
                            tool_call_id: tc.id,
                            content: result.result
                        });

                        steps[steps.length - 1].observation = result.result;
                        steps[steps.length - 1].isComplete = true; // Mark complete
                        onStepUpdate?.([...steps]); // Notify again
                    }
                    // Loop continues to let LLM see the result and respond
                } else {
                    // No tool calls -> We are done!
                    finalAnswer = currentContent;
                    break;
                }
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
