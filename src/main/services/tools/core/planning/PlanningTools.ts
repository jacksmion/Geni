
import { ITool, ToolDefinition, ToolResult } from '../../../../common/types/tool';
import { planManager } from './PlanManager';

interface CreatePlanArgs {
    description: string;
    tasks: string[];
}

interface UpdateTaskStatusArgs {
    taskId: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
    outcome?: string;
}

export class CreatePlanTool implements ITool {
    constructor(workspacePath: string) {
        // workspacePath is no longer needed for in-memory plan manager, kept for interface compatibility
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'create_plan',
            description: 'Create a new implementation plan with a goal and a list of tasks. Use this when you have a complex goal that needs to be broken down.',
            input_schema: {
                type: 'object',
                properties: {
                    description: {
                        type: 'string',
                        description: 'The overall goal or description of the plan.'
                    },
                    tasks: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'A list of task descriptions to be executed in order.'
                    }
                },
                required: ['description', 'tasks']
            }
        };
    }

    async execute(args: CreatePlanArgs): Promise<ToolResult> {
        try {
            const plan = await planManager.createPlan(args.description, args.tasks);
            return {
                result: `Plan created successfully.\nID: ${plan.id}\nGoal: ${plan.description}\nTasks:\n${plan.tasks.map(t => `- [${t.id}] ${t.description} (${t.status})`).join('\n')}`,
                isError: false
            };
        } catch (error: any) {
            return {
                result: `Failed to create plan: ${error.message}`,
                isError: true
            };
        }
    }
}

export class UpdateTaskStatusTool implements ITool {
    constructor(workspacePath: string) {
        // workspacePath is no longer needed for in-memory plan manager, kept for interface compatibility
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'update_task_status',
            description: 'Update the status of a task in the active implementation plan. Use this to track your progress.',
            input_schema: {
                type: 'object',
                properties: {
                    taskId: {
                        type: 'string',
                        description: 'The ID of the task to update.'
                    },
                    status: {
                        type: 'string',
                        enum: ['pending', 'in_progress', 'completed', 'failed', 'skipped'],
                        description: 'The new status of the task.'
                    },
                    outcome: {
                        type: 'string',
                        description: 'Optional summary of the task outcome or result.'
                    }
                },
                required: ['taskId', 'status']
            }
        };
    }

    async execute(args: UpdateTaskStatusArgs): Promise<ToolResult> {
        try {
            const plan = await planManager.updateTaskStatus(args.taskId, args.status, args.outcome);
            const task = plan.tasks.find(t => t.id === args.taskId);

            let result = `Task ${args.taskId} updated to '${args.status}'.`;
            if (plan.status === 'completed') {
                result += '\n\n🎉 All tasks in the plan are completed!';
            } else {
                // Show next pending task
                const nextTask = plan.tasks.find(t => t.status === 'pending');
                if (nextTask) {
                    result += `\nNext task: [${nextTask.id}] ${nextTask.description}`;
                }
            }

            return {
                result,
                isError: false
            };
        } catch (error: any) {
            return {
                result: `Failed to update task: ${error.message}`,
                isError: true
            };
        }
    }
}

export class ReadPlanTool implements ITool {
    constructor(workspacePath: string) {
        // workspacePath is no longer needed for in-memory plan manager, kept for interface compatibility
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'read_plan',
            description: 'Read the current implementation plan to understand the progress and remaining tasks.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        };
    }

    async execute(): Promise<ToolResult> {
        try {
            const plan = await planManager.getActivePlan();
            if (!plan) {
                return {
                    result: 'No active plan found.',
                    isError: false
                };
            }

            const taskList = plan.tasks.map(t => {
                let icon = '⬜';
                if (t.status === 'completed') icon = '✅';
                if (t.status === 'in_progress') icon = '🔄';
                if (t.status === 'failed') icon = '❌';
                if (t.status === 'skipped') icon = '⏭️';

                let line = `${icon} [${t.id}] ${t.description}`;
                if (t.outcome) {
                    line += `\n   > Outcome: ${t.outcome}`;
                }
                return line;
            }).join('\n');

            return {
                result: `Active Plan: ${plan.description}\nStatus: ${plan.status}\n\nTasks:\n${taskList}`,
                isError: false
            };
        } catch (error: any) {
            return {
                result: `Failed to read plan: ${error.message}`,
                isError: true
            };
        }
    }
}
