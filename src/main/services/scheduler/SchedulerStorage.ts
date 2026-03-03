/**
 * SchedulerStorage - 定时任务持久化存储
 * 
 * 职责：
 * - 持久化任务运行状态（lastRunAt, lastRunStatus 等）
 * - 存储和查询执行日志（每个任务最多保留 MAX_LOGS_PER_TASK 条）
 * 
 * 存储结构：
 *   ~/.geni/scheduler/
 *   ├── statuses.json           # 所有任务的最后运行状态
 *   └── logs/
 *       ├── {taskId-1}.json     # 任务 1 的执行日志
 *       └── {taskId-2}.json     # 任务 2 的执行日志
 */

import fs from 'fs';
import path from 'path';
import { PathManager } from '../PathManager';

/** 单条执行日志 */
export interface TaskExecutionLog {
    id: string;           // 日志唯一标识
    taskId: string;
    taskName: string;
    startedAt: number;    // 开始时间戳
    finishedAt: number;   // 结束时间戳
    durationMs: number;   // 耗时
    status: 'success' | 'error';
    output?: string;      // LLM 最终输出（截断保存）
    error?: string;       // 错误信息
    stepCount?: number;   // 工具调用步骤数
}

/** 持久化的任务状态（不含 isRunning/nextRunAt 等运行时字段） */
export interface PersistedTaskStatus {
    taskId: string;
    lastRunAt?: number;
    lastRunStatus?: 'success' | 'error';
    lastRunError?: string;
    lastRunDurationMs?: number;
}

export class SchedulerStorage {
    private schedulerDir: string;
    private logsDir: string;
    private statusesFile: string;

    /** 每个任务最多保留的日志条数 */
    private static readonly MAX_LOGS_PER_TASK = 50;
    /** 日志中输出内容的最大字符数 */
    private static readonly MAX_OUTPUT_LENGTH = 2000;

    constructor(pathManager: PathManager) {
        this.schedulerDir = pathManager.getSchedulerDir();
        this.logsDir = path.join(this.schedulerDir, 'logs');
        this.statusesFile = path.join(this.schedulerDir, 'statuses.json');

        // 确保 logs 目录存在
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }

        console.log('[SchedulerStorage] Storage Dir:', this.schedulerDir);
    }

    // ==================== 状态持久化 ====================

    /**
     * 加载所有持久化的任务状态
     */
    public loadStatuses(): Map<string, PersistedTaskStatus> {
        const map = new Map<string, PersistedTaskStatus>();
        try {
            if (fs.existsSync(this.statusesFile)) {
                const data = fs.readFileSync(this.statusesFile, 'utf8');
                const arr = JSON.parse(data) as PersistedTaskStatus[];
                for (const s of arr) {
                    map.set(s.taskId, s);
                }
            }
        } catch (error) {
            console.error('[SchedulerStorage] Failed to load statuses:', error);
        }
        return map;
    }

    /**
     * 保存所有任务的状态到磁盘（异步）
     */
    public saveStatuses(statuses: PersistedTaskStatus[]): void {
        fs.promises.writeFile(this.statusesFile, JSON.stringify(statuses, null, 2), 'utf8')
            .catch(err => console.error('[SchedulerStorage] Failed to save statuses:', err));
    }

    // ==================== 执行日志 ====================

    /**
     * 追加一条执行日志
     */
    public async addLog(log: TaskExecutionLog): Promise<void> {
        // 截断输出
        if (log.output && log.output.length > SchedulerStorage.MAX_OUTPUT_LENGTH) {
            log.output = log.output.substring(0, SchedulerStorage.MAX_OUTPUT_LENGTH) + '\n...(truncated)';
        }

        const logFile = path.join(this.logsDir, `${log.taskId}.json`);

        try {
            let logs: TaskExecutionLog[] = [];

            // 读取已有日志
            if (fs.existsSync(logFile)) {
                const data = await fs.promises.readFile(logFile, 'utf8');
                logs = JSON.parse(data) as TaskExecutionLog[];
            }

            // 追加新日志
            logs.push(log);

            // 保留最新的 N 条
            if (logs.length > SchedulerStorage.MAX_LOGS_PER_TASK) {
                logs = logs.slice(-SchedulerStorage.MAX_LOGS_PER_TASK);
            }

            // 异步写入
            await fs.promises.writeFile(logFile, JSON.stringify(logs, null, 2), 'utf8');
        } catch (error) {
            console.error(`[SchedulerStorage] Failed to add log for task ${log.taskId}:`, error);
        }
    }

    /**
     * 获取某个任务的执行日志
     * @param taskId 任务 ID
     * @param limit 返回最近几条（默认 20）
     */
    public async getLogs(taskId: string, limit = 20): Promise<TaskExecutionLog[]> {
        const logFile = path.join(this.logsDir, `${taskId}.json`);

        try {
            if (fs.existsSync(logFile)) {
                const data = await fs.promises.readFile(logFile, 'utf8');
                const logs = JSON.parse(data) as TaskExecutionLog[];
                // 返回最近 N 条，倒序（最新的在前）
                return logs.slice(-limit).reverse();
            }
        } catch (error) {
            console.error(`[SchedulerStorage] Failed to load logs for task ${taskId}:`, error);
        }

        return [];
    }

    /**
     * 删除某个任务的全部日志
     */
    public async deleteTaskLogs(taskId: string): Promise<void> {
        const logFile = path.join(this.logsDir, `${taskId}.json`);
        try {
            if (fs.existsSync(logFile)) {
                await fs.promises.unlink(logFile);
            }
        } catch (error) {
            console.error(`[SchedulerStorage] Failed to delete logs for task ${taskId}:`, error);
        }
    }
}
