import { ITool, ToolDefinition, ToolExecutionResult as ToolResult } from '../../../../common/types/tool';

// ─── Types ───────────────────────────────────────────────────────

export interface TodoItem {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority?: 'high' | 'medium' | 'low';
}

// ─── In-Memory Store (Singleton) ─────────────────────────────────

class TodoStore {
    private static instance: TodoStore;
    private todos: TodoItem[] = [];

    private constructor() { }

    static getInstance(): TodoStore {
        if (!TodoStore.instance) {
            TodoStore.instance = new TodoStore();
        }
        return TodoStore.instance;
    }

    getAll(): TodoItem[] {
        return [...this.todos];
    }

    /**
     * Full replacement write — the canonical way to create/update/delete todos.
     * The caller provides the complete desired state of the list.
     */
    replaceAll(items: TodoItem[]): TodoItem[] {
        this.todos = items.map(item => ({
            id: item.id,
            content: item.content,
            status: item.status || 'pending',
            ...(item.priority ? { priority: item.priority } : {})
        }));
        return this.getAll();
    }

    clear(): void {
        this.todos = [];
    }
}

export const todoStore = TodoStore.getInstance();

// ─── Formatting Helper ──────────────────────────────────────────

function formatTodoList(todos: TodoItem[]): string {
    if (todos.length === 0) {
        return 'No todos found.';
    }

    const statusIcons: Record<string, string> = {
        pending: '⬜',
        in_progress: '🔄',
        completed: '✅'
    };

    const completed = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const lines = todos.map(t => {
        const icon = statusIcons[t.status] || '⬜';
        const priority = t.priority ? ` [${t.priority}]` : '';
        return `${icon} ${t.content}${priority}`;
    });

    return `Progress: ${completed}/${total} (${pct}%)\n\n${lines.join('\n')}`;
}

// ─── TodoWrite Tool ─────────────────────────────────────────────

interface TodoWriteArgs {
    todos: TodoItem[];
}

export class TodoWriteTool implements ITool {
    getDefinition(): ToolDefinition {
        return {
            name: 'todowrite',
            description: 'Create or update the entire todo list. Items not included will be removed.',
            input_schema: {
                type: 'object',
                properties: {
                    todos: {
                        type: 'array',
                        description: 'The complete list of todo items.',
                        items: {
                            type: 'object',
                            properties: {
                                id: {
                                    type: 'string',
                                    description: 'Unique ID'
                                },
                                content: {
                                    type: 'string',
                                    description: 'Description'
                                },
                                status: {
                                    type: 'string',
                                    enum: ['pending', 'in_progress', 'completed'],
                                    description: 'Status'
                                },
                                priority: {
                                    type: 'string',
                                    enum: ['high', 'medium', 'low'],
                                    description: 'Optional priority'
                                }
                            },
                            required: ['id', 'content', 'status']
                        }
                    }
                },
                required: ['todos']
            }
        };
    }

    async execute(args: TodoWriteArgs): Promise<ToolResult> {
        try {
            const updated = todoStore.replaceAll(args.todos);
            return {
                toolName: 'todowrite',
                result: formatTodoList(updated),
                isError: false
            };
        } catch (error: any) {
            return {
                toolName: 'todowrite',
                result: `Failed to update todos: ${error.message}`,
                isError: true
            };
        }
    }
}

// ─── TodoRead Tool ──────────────────────────────────────────────

export class TodoReadTool implements ITool {
    getDefinition(): ToolDefinition {
        return {
            name: 'todoread',
            description: 'Read the current todo list to check progress.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        };
    }

    async execute(): Promise<ToolResult> {
        try {
            const todos = todoStore.getAll();
            return {
                toolName: 'todoread',
                result: formatTodoList(todos),
                isError: false
            };
        } catch (error: any) {
            return {
                toolName: 'todoread',
                result: `Failed to read todos: ${error.message}`,
                isError: true
            };
        }
    }
}
