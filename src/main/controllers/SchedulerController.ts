/**
 * SchedulerController - 定时任务 IPC 控制器
 * 
 * 暴露定时任务相关的 IPC 通道给前端。
 * 任务的 CRUD 操作复用 system:save-settings 通道。
 */

import { ipcMain } from 'electron';
import { SchedulerService } from '../services/scheduler/SchedulerService';
import { SCHEDULER_CHANNELS } from '../../common/ipc/channels';

export class SchedulerController {
    constructor(
        private schedulerService: SchedulerService
    ) { }

    /**
     * 注册 IPC 处理器
     */
    public registerHandlers(): void {
        // 手动触发任务
        ipcMain.handle(SCHEDULER_CHANNELS.TRIGGER_TASK, async (_, taskId: string) => {
            return await this.schedulerService.triggerTask(taskId);
        });

        // 获取所有任务的运行状态
        ipcMain.handle(SCHEDULER_CHANNELS.GET_STATUSES, async () => {
            return this.schedulerService.getTaskStatuses();
        });

        // 获取某个任务的执行日志
        ipcMain.handle(SCHEDULER_CHANNELS.GET_LOGS, async (_, taskId: string, limit?: number) => {
            return await this.schedulerService.getTaskLogs(taskId, limit);
        });

        // 验证 cron 表达式
        ipcMain.handle(SCHEDULER_CHANNELS.VALIDATE_CRON, async (_, expression: string) => {
            return this.schedulerService.validateCron(expression);
        });

        console.log('[SchedulerController] IPC handlers registered.');
    }
}
