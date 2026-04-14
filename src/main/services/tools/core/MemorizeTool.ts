import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import { MemoryStore } from '../../memory/MemoryStore';

/**
 * MemorizeTool - 长期记忆管理工具
 *
 * 让 Agent 自主决定何时 save/delete/read 记忆。
 * 记忆持久化到 ~/.geni/memory.md，跨会话可用。
 */
export class MemorizeTool implements ITool {
    constructor(private memoryStore: MemoryStore) {}

    getDefinition(): ToolDefinition {
        return {
            name: 'memorize',
            description: 'Save, delete, read, or list long-term memories that persist across sessions. Use this to remember user preferences, project conventions, and important lessons learned. Do NOT memorize trivial or transient information.',
            input_schema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['save', 'delete', 'read', 'list'],
                        description: 'save: add/update a memory; delete: remove a memory by title; read: retrieve a specific memory by title; list: show all memory titles'
                    },
                    title: {
                        type: 'string',
                        description: 'Short, descriptive title for this memory entry (required for save, delete, read)'
                    },
                    content: {
                        type: 'string',
                        description: 'Memory content (required for save, ignored for delete/read/list)'
                    },
                    category: {
                        type: 'string',
                        enum: ['preference', 'project', 'workflow', 'fact'],
                        description: 'Memory category. Default is "fact". Use "preference" for user preferences that should always be followed.'
                    }
                },
                required: ['action']
            }
        };
    }

    async execute(args: { action: 'save' | 'delete' | 'read' | 'list'; title?: string; content?: string; category?: string }): Promise<ToolExecutionResult> {
        try {
            switch (args.action) {
                case 'save': {
                    if (!args.title) {
                        return { toolName: 'memorize', isError: true, result: 'Title is required for save action.' };
                    }
                    if (!args.content) {
                        return { toolName: 'memorize', isError: true, result: 'Content is required for save action.' };
                    }
                    this.memoryStore.save(args.title, args.content, args.category as any);
                    return { toolName: 'memorize', isError: false, result: `Memory saved: "${args.title}"` };
                }

                case 'delete': {
                    if (!args.title) {
                        return { toolName: 'memorize', isError: true, result: 'Title is required for delete action.' };
                    }
                    const deleted = this.memoryStore.delete(args.title);
                    return {
                        toolName: 'memorize',
                        isError: false,
                        result: deleted
                            ? `Memory deleted: "${args.title}"`
                            : `Memory not found: "${args.title}"`
                    };
                }

                case 'read': {
                    if (!args.title) {
                        return { toolName: 'memorize', isError: true, result: 'Title is required for read action.' };
                    }
                    const memContent = this.memoryStore.readByTitle(args.title);
                    return {
                        toolName: 'memorize',
                        isError: false,
                        result: memContent || `Memory not found: "${args.title}"`
                    };
                }

                case 'list': {
                    const titles = this.memoryStore.listTitles();
                    if (titles.length === 0) {
                        return { toolName: 'memorize', isError: false, result: 'No memories stored yet.' };
                    }
                    const lines = titles.map(t => `- ${t.title} [${t.category || 'fact'}]`);
                    return { toolName: 'memorize', isError: false, result: `Memories (${titles.length}):\n${lines.join('\n')}` };
                }

                default:
                    return { toolName: 'memorize', isError: true, result: `Unknown action: ${args.action}` };
            }
        } catch (error: any) {
            return { toolName: 'memorize', isError: true, result: `Memory operation failed: ${error.message}` };
        }
    }
}
