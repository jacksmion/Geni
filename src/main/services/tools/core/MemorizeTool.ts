import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import { MemoryStore } from '../../memory/MemoryStore';

/**
 * MemorizeTool - 长期记忆管理工具
 * 
 * 让 Agent 自主决定何时 save/delete 记忆。
 * 记忆持久化到 ~/.geni/memory.md，跨会话可用。
 */
export class MemorizeTool implements ITool {
    constructor(private memoryStore: MemoryStore) {}

    getDefinition(): ToolDefinition {
        return {
            name: 'memorize',
            description: 'Save or delete long-term memories that persist across sessions. Use this to remember user preferences, project conventions, and important lessons learned. Do NOT memorize trivial or transient information.',
            input_schema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['save', 'delete'],
                        description: 'save: add/update a memory; delete: remove a memory by title'
                    },
                    title: {
                        type: 'string',
                        description: 'Short, descriptive title for this memory entry'
                    },
                    content: {
                        type: 'string',
                        description: 'Memory content (required for save, ignored for delete)'
                    }
                },
                required: ['action', 'title']
            }
        };
    }

    async execute(args: { action: 'save' | 'delete'; title: string; content?: string }): Promise<ToolExecutionResult> {
        console.log(`[MemorizeTool] action=${args.action}, title="${args.title}"`);
        try {
            if (args.action === 'save') {
                if (!args.content) {
                    return { toolName: 'memorize', isError: true, result: 'Content is required for save action.' };
                }
                this.memoryStore.save(args.title, args.content);
                console.log(`[MemorizeTool] Saved memory: "${args.title}"`);
                return { toolName: 'memorize', isError: false, result: `Memory saved: "${args.title}"` };
            }

            if (args.action === 'delete') {
                const deleted = this.memoryStore.delete(args.title);
                console.log(`[MemorizeTool] Delete memory "${args.title}": ${deleted ? 'success' : 'not found'}`);
                return {
                    toolName: 'memorize',
                    isError: false,
                    result: deleted
                        ? `Memory deleted: "${args.title}"`
                        : `Memory not found: "${args.title}"`
                };
            }

            return { toolName: 'memorize', isError: true, result: `Unknown action: ${args.action}` };
        } catch (error: any) {
            console.error(`[MemorizeTool] Failed:`, error);
            return { toolName: 'memorize', isError: true, result: `Memory operation failed: ${error.message}` };
        }
    }
}
