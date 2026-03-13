import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import { SchedulerService } from '../../scheduler/SchedulerService';
import { ScheduledTaskConfig } from '../../../../common/types/settings';

/**
 * CronTool - 定时任务管理工具
 * 允许 Agent 通过指令在系统中进行任务的增删改查及手动触发
 */
export class CronTool implements ITool {
    requireConfirmation = false;

    constructor(
        private schedulerService: SchedulerService
    ) { }

    getDefinition(): ToolDefinition {
        return {
            name: 'scheduled_task_manager',
            description: 'Manage scheduled tasks (cron jobs). Supports add, update, delete, list, and trigger operations.',
            input_schema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['add', 'update', 'delete', 'list', 'trigger'],
                        description: 'The operation to perform.'
                    },
                    id: {
                        type: 'string',
                        description: 'The unique ID of the task. Required for update, delete, and trigger.'
                    },
                    name: {
                        type: 'string',
                        description: 'Name for the task. Required for add.'
                    },
                    cronExpression: {
                        type: 'string',
                        description: 'Cron expression (e.g. "0 9 * * *"). Required for add.'
                    },
                    prompt: {
                        type: 'string',
                        description: 'The instruction to execute. Required for add.'
                    },
                    enabled: {
                        type: 'boolean',
                        description: 'Whether the task is active.'
                    },
                    keepHistory: {
                        type: 'boolean'
                    },
                    notificationEnabled: {
                        type: 'boolean'
                    },
                    notificationImSessionId: {
                        type: 'string'
                    }
                },
                required: ['action']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        const { action, id, ...params } = args;
        try {
            switch (action) {
                case 'add': {
                    if (!params.name || !params.cronExpression || !params.prompt) {
                        throw new Error('Missing required fields for "add": name, cronExpression, prompt');
                    }
                    const task = await this.schedulerService.addTask({
                        name: params.name,
                        cronExpression: params.cronExpression,
                        prompt: params.prompt,
                        enabled: params.enabled ?? true,
                        keepHistory: params.keepHistory ?? false,
                        enableTools: true,
                        notification: params.notificationEnabled ? {
                            enabled: true,
                            imSessionId: params.notificationImSessionId || ''
                        } : undefined
                    });
                    return this.success(`Successfully added task "${task.name}" with ID: ${task.id}`);
                }

                case 'update': {
                    if (!id) throw new Error('Task ID is required for "update"');
                    const updates: Partial<ScheduledTaskConfig> = {};
                    if (params.name !== undefined) updates.name = params.name;
                    if (params.cronExpression !== undefined) updates.cronExpression = params.cronExpression;
                    if (params.prompt !== undefined) updates.prompt = params.prompt;
                    if (params.enabled !== undefined) updates.enabled = params.enabled;
                    if (params.keepHistory !== undefined) updates.keepHistory = params.keepHistory;
                    if (params.notificationEnabled !== undefined) {
                        updates.notification = {
                            enabled: params.notificationEnabled,
                            imSessionId: params.notificationImSessionId || ''
                        };
                    }

                    const task = await this.schedulerService.updateTask(id, updates);
                    return this.success(`Successfully updated task "${task.name}" (${id})`);
                }

                case 'delete': {
                    if (!id) throw new Error('Task ID is required for "delete"');
                    await this.schedulerService.deleteTask(id);
                    return this.success(`Successfully deleted task with ID: ${id}`);
                }

                case 'list': {
                    const tasks = this.schedulerService.getTasks();
                    const statuses = this.schedulerService.getTaskStatuses();
                    const result = tasks.map(t => {
                        const s = statuses.find(st => st.taskId === t.id);
                        return {
                            ...t,
                            lastRunAt: s?.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : 'Never',
                            lastRunStatus: s?.lastRunStatus,
                            nextRunAt: s?.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : 'N/A',
                            isRunning: s?.isRunning
                        };
                    });
                    return this.success(JSON.stringify(result, null, 2));
                }

                case 'trigger': {
                    if (!id) throw new Error('Task ID is required for "trigger"');
                    const res = await this.schedulerService.triggerTask(id);
                    return this.success(`Manual trigger ${res.success ? 'succeeded' : 'failed'}. Duration: ${res.durationMs}ms. Output: ${res.finalAnswer || res.error || 'No output'}`);
                }

                default:
                    throw new Error(`Unsupported action: ${action}`);
            }
        } catch (error: any) {
            return {
                toolName: 'scheduled_task_manager',
                isError: true,
                result: error.message
            };
        }
    }

    private success(message: string): ToolExecutionResult {
        return {
            toolName: 'scheduled_task_manager',
            isError: false,
            result: message
        };
    }
}
