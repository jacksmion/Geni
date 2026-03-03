/**
 * SchedulerService - 定时任务调度服务
 * 
 * 职责：
 * - 管理 cron 定时器生命周期
 * - 触发 AgentRuntime 执行定时任务
 * - 维护任务运行时状态（内存 + 持久化）
 * - 记录执行日志
 */

import { CronExpressionParser } from 'cron-parser';
import { AppSettings, ScheduledTaskConfig } from '../../../common/types/settings';
import { ToolRegistry } from '../tools/ToolRegistry';
import { SessionManager } from '../session';
import { ToolController } from '../../controllers/ToolController';
import { AgentRuntime, AgentRuntimeOptions } from '../agent';
import { Skill } from '../../../common/types/skill';
import { SchedulerStorage, TaskExecutionLog } from './SchedulerStorage';

/** 单个任务的运行时状态 */
export interface TaskStatus {
    taskId: string;
    taskName: string;
    enabled: boolean;
    isRunning: boolean;
    lastRunAt?: number;
    lastRunStatus?: 'success' | 'error';
    lastRunError?: string;
    lastRunDurationMs?: number;
    nextRunAt?: number;
}

/** 手动触发执行结果 */
export interface TaskExecutionResult {
    success: boolean;
    finalAnswer?: string;
    error?: string;
    durationMs: number;
}

export class SchedulerService {
    /** cron 定时器 Map: taskId -> timeout handle */
    private timers = new Map<string, ReturnType<typeof setTimeout>>();
    /** 正在运行的任务的 AbortController */
    private runningTasks = new Map<string, AbortController>();
    /** 任务运行状态（内存） */
    private taskStatuses = new Map<string, TaskStatus>();

    private settings: AppSettings;
    private toolRegistry: ToolRegistry;
    private sessionManager: SessionManager;
    private toolController: ToolController;
    private storage: SchedulerStorage;

    /** 最大并发任务数 */
    private static readonly MAX_CONCURRENT = 3;

    constructor(
        settings: AppSettings,
        toolRegistry: ToolRegistry,
        sessionManager: SessionManager,
        toolController: ToolController,
        storage: SchedulerStorage
    ) {
        this.settings = settings;
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.toolController = toolController;
        this.storage = storage;

        // 从磁盘恢复上次的运行状态
        this.restoreStatuses();
    }

    /**
     * 从磁盘恢复持久化的任务状态
     */
    private restoreStatuses(): void {
        const persisted = this.storage.loadStatuses();
        for (const [taskId, ps] of persisted) {
            this.taskStatuses.set(taskId, {
                taskId: ps.taskId,
                taskName: '', // 会在 syncWithSettings 中更新
                enabled: false,
                isRunning: false,
                lastRunAt: ps.lastRunAt,
                lastRunStatus: ps.lastRunStatus,
                lastRunError: ps.lastRunError,
                lastRunDurationMs: ps.lastRunDurationMs,
            });
        }
        console.log(`[Scheduler] Restored ${persisted.size} task statuses from disk.`);
    }

    /**
     * 将当前状态持久化到磁盘
     */
    private persistStatuses(): void {
        const statuses = Array.from(this.taskStatuses.values()).map(s => ({
            taskId: s.taskId,
            lastRunAt: s.lastRunAt,
            lastRunStatus: s.lastRunStatus,
            lastRunError: s.lastRunError,
            lastRunDurationMs: s.lastRunDurationMs,
        }));
        this.storage.saveStatuses(statuses);
    }

    /**
     * 从配置同步所有调度任务
     * 当 settings 变更时调用
     */
    public syncWithSettings(settings: AppSettings): void {
        this.settings = settings;
        const tasks = settings.scheduledTasks || [];

        // 1. 停止已删除的任务
        const taskIds = new Set(tasks.map(t => t.id));
        for (const existingId of this.timers.keys()) {
            if (!taskIds.has(existingId)) {
                this.unscheduleTask(existingId);
                this.taskStatuses.delete(existingId);
            }
        }

        // 2. 同步所有任务
        for (const task of tasks) {
            this.scheduleTask(task);
        }

        console.log(`[Scheduler] Synced ${tasks.length} scheduled tasks.`);
    }

    /**
     * 调度单个 cron 任务
     */
    private scheduleTask(task: ScheduledTaskConfig): void {
        // 先取消旧的调度
        this.unscheduleTask(task.id);

        // 初始化或更新状态（保留已恢复的历史字段）
        if (!this.taskStatuses.has(task.id)) {
            this.taskStatuses.set(task.id, {
                taskId: task.id,
                taskName: task.name,
                enabled: task.enabled,
                isRunning: false,
            });
        } else {
            const status = this.taskStatuses.get(task.id)!;
            status.taskName = task.name;
            status.enabled = task.enabled;
        }

        if (!task.enabled) {
            const status = this.taskStatuses.get(task.id)!;
            status.nextRunAt = undefined;
            return;
        }

        // 验证并调度
        try {
            this.scheduleCronTask(task);
        } catch (error: any) {
            console.error(`[Scheduler] Invalid cron expression for task "${task.name}": ${error.message}`);
            const status = this.taskStatuses.get(task.id)!;
            status.lastRunStatus = 'error';
            status.lastRunError = `Invalid cron: ${error.message}`;
        }
    }

    /**
     * cron 调度实现：计算下一次执行时间，用 setTimeout 精确触发
     */
    private scheduleCronTask(task: ScheduledTaskConfig): void {
        try {
            const interval = CronExpressionParser.parse(task.cronExpression);
            const nextDate = interval.next().toDate();
            const delay = nextDate.getTime() - Date.now();

            if (delay < 0) {
                // 如果下一次时间已过（不太可能），跳到再下一次
                this.scheduleCronTask(task);
                return;
            }

            const status = this.taskStatuses.get(task.id)!;
            status.nextRunAt = nextDate.getTime();

            console.log(`[Scheduler] Task "${task.name}" next run at ${nextDate.toLocaleString()} (in ${Math.round(delay / 1000)}s)`);

            const timer = setTimeout(async () => {
                // 清除已触发的 timer
                this.timers.delete(task.id);

                // 执行任务
                await this.executeTask(task);

                // 从最新 settings 读取任务配置（可能已更新）
                const latestTask = this.settings.scheduledTasks?.find(t => t.id === task.id);
                if (latestTask && latestTask.enabled) {
                    // 重新调度下一次
                    this.scheduleCronTask(latestTask);
                }
            }, delay);

            this.timers.set(task.id, timer);
        } catch (error: any) {
            throw new Error(`Failed to parse cron expression "${task.cronExpression}": ${error.message}`);
        }
    }

    /**
     * 取消单个任务的调度
     */
    private unscheduleTask(taskId: string): void {
        const timer = this.timers.get(taskId);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(taskId);
        }
    }

    /**
     * 执行定时任务
     */
    private async executeTask(task: ScheduledTaskConfig): Promise<TaskExecutionResult> {
        // 并发检查
        if (this.runningTasks.size >= SchedulerService.MAX_CONCURRENT) {
            console.warn(`[Scheduler] Max concurrent tasks reached (${SchedulerService.MAX_CONCURRENT}), skipping task "${task.name}"`);
            return { success: false, error: 'Max concurrent tasks reached', durationMs: 0 };
        }

        // 如果同一任务还在运行，跳过
        if (this.runningTasks.has(task.id)) {
            console.warn(`[Scheduler] Task "${task.name}" is still running, skipping this execution`);
            return { success: false, error: 'Previous execution still running', durationMs: 0 };
        }

        console.log(`[Scheduler] Executing task: ${task.name} (${task.id})`);
        const startTime = Date.now();
        const status = this.taskStatuses.get(task.id)!;
        status.isRunning = true;
        status.lastRunAt = startTime;

        const controller = new AbortController();
        this.runningTasks.set(task.id, controller);

        try {
            // 1. 准备 Session & History
            const sessionId = `scheduled-${task.id}`;
            let history = task.keepHistory
                ? await this.sessionManager.getHistory(sessionId)
                : [];

            // 限制历史轮数
            if (task.keepHistory && task.maxHistoryTurns) {
                const maxMessages = task.maxHistoryTurns * 2; // user + assistant = 1 turn
                if (history.length > maxMessages) {
                    history = history.slice(-maxMessages);
                }
            }

            // 2. 准备 Skills
            const skillList = this.prepareSkills();

            // 3. 准备 Runtime 配置
            const effectiveSettings = this.getEffectiveSettings(task);
            const runOptions: AgentRuntimeOptions = {
                signal: controller.signal,
                history,
                model: task.model || effectiveSettings.llm.providers[effectiveSettings.llm.activeProvider]?.model,
                skills: skillList,
                // 定时任务默认自动授权所有工具（无人值守）
                onAuthorizationRequired: async (_request, _decision) => {
                    return { approved: true };
                }
            };

            // 4. 创建独立的 AgentRuntime 实例
            const runtime = new AgentRuntime(effectiveSettings, this.toolRegistry);

            // 5. 执行
            const tools = task.enableTools !== false ? this.toolRegistry.getTools() : [];
            const result = await runtime.run(
                task.prompt,
                tools,
                runOptions
            );

            // 6. 保存历史（可选）
            if (task.keepHistory && result.newMessages) {
                for (const msg of result.newMessages) {
                    await this.sessionManager.addMessage(sessionId, msg as any);
                }
            }

            const durationMs = Date.now() - startTime;

            // 7. 更新状态
            status.lastRunStatus = 'success';
            status.lastRunError = undefined;
            status.lastRunDurationMs = durationMs;
            status.isRunning = false;

            // 8. 持久化状态 + 记录日志
            this.persistStatuses();
            this.storage.addLog({
                id: `${task.id}-${startTime}`,
                taskId: task.id,
                taskName: task.name,
                startedAt: startTime,
                finishedAt: Date.now(),
                durationMs,
                status: 'success',
                output: result.finalAnswer || undefined,
                stepCount: result.steps?.length,
            }).catch(err => console.error('[Scheduler] Failed to save log:', err));

            console.log(`[Scheduler] Task "${task.name}" completed in ${durationMs}ms`);

            return {
                success: true,
                finalAnswer: result.finalAnswer,
                durationMs,
            };
        } catch (error: any) {
            const durationMs = Date.now() - startTime;
            console.error(`[Scheduler] Task "${task.name}" failed:`, error);

            status.lastRunStatus = 'error';
            status.lastRunError = error.message;
            status.lastRunDurationMs = durationMs;
            status.isRunning = false;

            // 持久化状态 + 记录日志
            this.persistStatuses();
            this.storage.addLog({
                id: `${task.id}-${startTime}`,
                taskId: task.id,
                taskName: task.name,
                startedAt: startTime,
                finishedAt: Date.now(),
                durationMs,
                status: 'error',
                error: error.message,
            }).catch(err => console.error('[Scheduler] Failed to save error log:', err));

            return {
                success: false,
                error: error.message,
                durationMs,
            };
        } finally {
            this.runningTasks.delete(task.id);
        }
    }

    /**
     * 手动触发执行（UI 测试用）
     */
    public async triggerTask(taskId: string): Promise<TaskExecutionResult> {
        const task = this.settings.scheduledTasks?.find(t => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found', durationMs: 0 };
        }
        return this.executeTask(task);
    }

    /**
     * 获取所有任务运行状态
     */
    public getTaskStatuses(): TaskStatus[] {
        return Array.from(this.taskStatuses.values());
    }

    /**
     * 获取某个任务的执行日志
     */
    public async getTaskLogs(taskId: string, limit = 20): Promise<TaskExecutionLog[]> {
        return this.storage.getLogs(taskId, limit);
    }

    /**
     * 验证 cron 表达式是否有效
     */
    public validateCron(expression: string): { valid: boolean; error?: string; nextRuns?: string[] } {
        try {
            const interval = CronExpressionParser.parse(expression);
            const nextRuns: string[] = [];
            for (let i = 0; i < 5; i++) {
                nextRuns.push(interval.next().toDate().toLocaleString());
            }
            return { valid: true, nextRuns };
        } catch (error: any) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * 停止所有调度和正在运行的任务
     */
    public stopAll(): void {
        console.log(`[Scheduler] Stopping all scheduled tasks...`);

        // 取消所有定时器
        for (const [id, timer] of this.timers) {
            clearTimeout(timer);
        }
        this.timers.clear();

        // 中止所有正在运行的任务
        for (const [id, controller] of this.runningTasks) {
            controller.abort();
        }
        this.runningTasks.clear();
    }

    // ============ Private Helpers ============

    private prepareSkills(): Skill[] {
        const enabledSkillObjects = this.toolController.getEnabledSkillObjects();
        return enabledSkillObjects.map(obj => ({
            id: obj.id,
            name: obj.name,
            description: obj.description,
            content: obj.instruction,
            path: obj.path || '',
            enabled: true,
            trustLevel: 'Auto' as const,
        }));
    }

    /**
     * 获取生效的 settings（task 可覆盖 provider）
     */
    private getEffectiveSettings(task: ScheduledTaskConfig): AppSettings {
        if (!task.provider) return this.settings;

        // 覆盖 activeProvider
        return {
            ...this.settings,
            llm: {
                ...this.settings.llm,
                activeProvider: task.provider,
            }
        };
    }
}
