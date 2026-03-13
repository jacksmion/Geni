import { randomUUID } from 'node:crypto';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import { ConfigManager } from '../../ConfigManager';
import { AppSettings, ScheduledTaskConfig } from '../../../../common/types/settings';

/**
 * CronTool - 定时任务管理工具
 * 允许 Agent 通过指令在系统中创建持久化的定时任务
 */
export class CronTool implements ITool {
    // 默认不需要用户手动确认
    requireConfirmation = false;

    constructor(
        private configManager: ConfigManager,
        private onSettingsChanged?: (settings: AppSettings) => Promise<void> | void
    ) { }

    getDefinition(): ToolDefinition {
        return {
            name: 'create_scheduled_task',
            description: 'Create a new scheduled task (cron job) to execute a prompt periodically.',
            input_schema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'A descriptive name for the task (e.g., "Daily Code Summary")'
                    },
                    cronExpression: {
                        type: 'string',
                        description: 'A standard cron expression. Example: "0 9 * * *" for daily at 9 AM, "0 * * * *" for every hour.'
                    },
                    prompt: {
                        type: 'string',
                        description: 'The instruction/prompt that the Agent will execute when the timer triggers.'
                    },
                    keepHistory: {
                        type: 'boolean',
                        description: 'Whether to maintain conversation history for this task. Default is false.'
                    },
                    notificationEnabled: {
                        type: 'boolean',
                        description: 'Whether to enable IM notification for this task result.'
                    },
                    notificationImSessionId: {
                        type: 'string',
                        description: 'The IM session ID to send notifications to (e.g., "tg_12345"). Only used if notificationEnabled is true.'
                    }
                },
                required: ['name', 'cronExpression', 'prompt']
            }
        };
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        try {
            const settings = this.configManager.load();
            
            // 构造任务配置
            const newTask: ScheduledTaskConfig = {
                id: randomUUID(),
                name: args.name,
                enabled: true,
                prompt: args.prompt,
                cronExpression: args.cronExpression,
                keepHistory: args.keepHistory ?? false,
                notification: args.notificationEnabled ? {
                    enabled: true,
                    imSessionId: args.notificationImSessionId || ''
                } : undefined
            };

            // 更新配置并保存
            const updatedTasks = [...(settings.scheduledTasks || []), newTask];
            const newSettings: AppSettings = {
                ...settings,
                scheduledTasks: updatedTasks
            };

            this.configManager.save(newSettings);

            // 触发系统同步回调，使任务立即生效
            if (this.onSettingsChanged) {
                await this.onSettingsChanged(newSettings);
            }

            return {
                toolName: 'create_scheduled_task',
                isError: false,
                result: `Successfully created scheduled task "${args.name}" with ID ${newTask.id}. Next run is scheduled via: ${args.cronExpression}`
            };
        } catch (error: any) {
            return {
                toolName: 'create_scheduled_task',
                isError: true,
                result: `Failed to create scheduled task: ${error.message}`
            };
        }
    }
}
