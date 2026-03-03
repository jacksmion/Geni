import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, Play, Save, CheckCircle2, AlertCircle, History, FileText, Search, Box, X } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { ScheduledTaskConfig } from '../../common/types/settings';
import { clsx } from 'clsx';

/** 生成简短 UUID */
function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/** 创建空白的任务配置 */
function createEmptyTask(): ScheduledTaskConfig {
    return {
        id: generateId(),
        name: '',
        enabled: false,
        prompt: '',
        cronExpression: '0 * * * *',
        enableTools: true,
        keepHistory: false,
        maxHistoryTurns: 10,
    };
}

// ============ Cron 预设 ============
const CRON_PRESETS = [
    { label: '每 5 分钟', value: '*/5 * * * *' },
    { label: '每 30 分钟', value: '*/30 * * * *' },
    { label: '每小时', value: '0 * * * *' },
    { label: '每天 9:00', value: '0 9 * * *' },
    { label: '每天 18:00', value: '0 18 * * *' },
    { label: '每周一 9:00', value: '0 9 * * 1' },
    { label: '每月 1 号 9:00', value: '0 9 1 * *' },
];

interface TaskStatusInfo {
    taskId: string;
    taskName: string;
    enabled: boolean;
    isRunning: boolean;
    lastRunAt?: number;
    lastRunStatus?: string;
    lastRunError?: string;
    lastRunDurationMs?: number;
    nextRunAt?: number;
}

interface TaskLogEntry {
    id: string;
    taskId: string;
    taskName: string;
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    status: 'success' | 'error';
    output?: string;
    error?: string;
    stepCount?: number;
}

const SchedulerPage: React.FC = () => {
    const { settings, updateSettings } = useSettingsStore();
    const tasks = settings.scheduledTasks || [];

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [editingTask, setEditingTask] = useState<ScheduledTaskConfig | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [saved, setSaved] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const [cronValidation, setCronValidation] = useState<{ valid: boolean; error?: string; nextRuns?: string[] } | null>(null);
    const [statuses, setStatuses] = useState<TaskStatusInfo[]>([]);
    const [triggerResult, setTriggerResult] = useState<{ taskId: string; message: string; success: boolean } | null>(null);
    const [taskLogs, setTaskLogs] = useState<Map<string, TaskLogEntry[]>>(new Map());
    const [loadingLogs, setLoadingLogs] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');

    const filteredTasks = tasks.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedTask = (selectedIdx !== null && filteredTasks[selectedIdx]) ? filteredTasks[selectedIdx] : null;

    useEffect(() => {
        if (tasks.length > 0 && selectedIdx === null && !isCreating) {
            setSelectedIdx(0);
        }
    }, [tasks]);

    useEffect(() => {
        if (selectedTask && !isCreating) {
            setEditingTask({ ...selectedTask });
            validateCron(selectedTask.cronExpression);
        }
    }, [selectedTask, isCreating]);

    const refreshStatuses = useCallback(async () => {
        try {
            const result = await window.electronAPI.scheduler.getStatuses();
            setStatuses(result);
        } catch (e) {
            console.error('Failed to get statuses:', e);
        }
    }, []);

    useEffect(() => {
        refreshStatuses();
        const interval = setInterval(refreshStatuses, 10000);
        return () => clearInterval(interval);
    }, [refreshStatuses]);

    const validateCron = useCallback(async (expression: string) => {
        if (!expression.trim()) {
            setCronValidation(null);
            return;
        }
        try {
            const result = await window.electronAPI.scheduler.validateCron(expression);
            setCronValidation(result);
        } catch (e) {
            setCronValidation({ valid: false, error: 'Validation failed' });
        }
    }, []);

    const loadTaskLogs = useCallback(async (taskId: string) => {
        setLoadingLogs(taskId);
        try {
            const logs = await window.electronAPI.scheduler.getLogs(taskId, 20);
            setTaskLogs(prev => {
                const next = new Map(prev);
                next.set(taskId, logs);
                return next;
            });
        } catch (e) {
            console.error('Failed to load task logs:', e);
        } finally {
            setLoadingLogs(null);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'logs' && selectedTask) {
            loadTaskLogs(selectedTask.id);
        }
    }, [activeTab, selectedTask?.id]);

    const saveTasks = async (updatedTasks: ScheduledTaskConfig[]) => {
        await updateSettings({ scheduledTasks: updatedTasks });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleAddTask = () => {
        setSelectedIdx(null);
        setIsCreating(true);
        const newTask = createEmptyTask();
        setEditingTask(newTask);
        setCronValidation(null);
        validateCron(newTask.cronExpression);
        setActiveTab('config');
    };

    const handleCancelCreating = () => {
        setIsCreating(false);
        if (tasks.length > 0) {
            setSelectedIdx(0);
        } else {
            setEditingTask(null);
        }
    };

    const handleSaveTask = async () => {
        if (!editingTask) return;
        if (!editingTask.name.trim() || !editingTask.prompt.trim()) return;

        let updatedTasks: ScheduledTaskConfig[];
        if (isCreating) {
            updatedTasks = [...tasks, editingTask];
            await saveTasks(updatedTasks);
            setIsCreating(false);
            setSearchTerm('');
            const newFiltered = updatedTasks.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
            const idx = newFiltered.findIndex(t => t.id === editingTask.id);
            if (idx >= 0) setSelectedIdx(idx);
        } else {
            const existingIndex = tasks.findIndex(t => t.id === editingTask.id);
            if (existingIndex >= 0) {
                updatedTasks = [...tasks];
                updatedTasks[existingIndex] = editingTask;
                await saveTasks(updatedTasks);
            }
        }
    };

    const confirmDeleteTask = async (taskId: string) => {
        const updatedTasks = tasks.filter(t => t.id !== taskId);
        await saveTasks(updatedTasks);
        setDeleteConfirmId(null);
        if (selectedTask?.id === taskId) {
            setSelectedIdx(null);
            setEditingTask(null);
        }
    };

    const handleTriggerTask = async (taskId: string) => {
        setTriggerResult({ taskId, message: '正在执行...', success: true });
        setActiveTab('logs');
        try {
            const result = await window.electronAPI.scheduler.triggerTask(taskId);
            if (result.success) {
                setTriggerResult({ taskId, message: `执行成功 (${(result.durationMs / 1000).toFixed(1)}s)`, success: true });
            } else {
                setTriggerResult({ taskId, message: `执行失败: ${result.error}`, success: false });
            }
            refreshStatuses();
            loadTaskLogs(taskId);
        } catch (e: any) {
            setTriggerResult({ taskId, message: `执行失败: ${e.message}`, success: false });
        }
        setTimeout(() => setTriggerResult(null), 5000);
    };

    const getStatus = (taskId: string) => statuses.find(s => s.taskId === taskId);

    return (
        <div className="flex h-full w-full bg-slate-50 dark:bg-[#09090b] overflow-hidden animate-in fade-in duration-500">
            {/* Left Sidebar */}
            <div className="w-72 shrink-0 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#09090b] flex flex-col">
                <header className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-4 draggable shrink-0">
                    <div className="flex items-center gap-2">
                        <Clock size={16} className="text-slate-800 dark:text-gray-100" />
                        <h1 className="text-sm font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                            定时任务
                        </h1>
                    </div>
                    <button
                        onClick={handleAddTask}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition-colors nodrag"
                        title="新建任务"
                    >
                        <Plus size={16} />
                    </button>
                </header>

                <div className="p-3 flex flex-col gap-3 flex-1 overflow-hidden">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            type="text"
                            placeholder="搜索..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-lg py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-white/20 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-0.5 custom-scrollbar pr-1">
                        {isCreating && editingTask && (
                            <div className="w-full text-left px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white flex items-center gap-2.5">
                                <Plus size={14} className="text-slate-500" />
                                <span className="font-medium text-sm truncate">
                                    {editingTask.name || '新任务...'}
                                </span>
                            </div>
                        )}

                        {filteredTasks.map((task, idx) => {
                            const isSelected = !isCreating && selectedIdx === idx;
                            const isActive = task.enabled;
                            const status = getStatus(task.id);

                            return (
                                <div
                                    key={task.id}
                                    className={clsx(
                                        "w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 group flex items-center justify-between cursor-pointer",
                                        isSelected
                                            ? "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white"
                                            : "hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-gray-400"
                                    )}
                                    onClick={() => {
                                        setIsCreating(false);
                                        setSelectedIdx(idx);
                                    }}
                                >
                                    <div className="flex flex-col gap-0.5 overflow-hidden w-full">
                                        <div className="flex items-center gap-2">
                                            <div className={clsx("w-1.5 h-1.5 rounded-full shrink-0", isActive ? "bg-green-500" : "bg-slate-300 dark:bg-gray-600")} />
                                            <span className="font-medium text-sm truncate group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                                {task.name || '未命名'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 pl-3.5">
                                            <span className="text-[11px] text-slate-400 dark:text-gray-500 font-mono truncate">
                                                {task.cronExpression}
                                            </span>
                                            {status?.isRunning && <span className="text-[10px] text-amber-500 animate-pulse">●</span>}
                                            {!status?.isRunning && status?.lastRunStatus === 'error' && <span className="text-[10px] text-red-500">✕</span>}
                                        </div>
                                    </div>

                                    {/* Inline Delete Button on Hover */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteConfirmId(task.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-white/10 rounded-md transition-all shrink-0 ml-2"
                                        title="删除任务"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            );
                        })}

                        {!isCreating && filteredTasks.length === 0 && (
                            <div className="text-center py-8 text-slate-400">
                                <p className="text-sm">暂无任务</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Detailed View */}
            <main className="flex-1 flex flex-col overflow-hidden relative h-full bg-white dark:bg-[#09090b]">
                {(editingTask) ? (
                    <>
                        <header className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 draggable shrink-0 bg-white dark:bg-[#09090b]">
                            <div className="flex items-center gap-6 nodrag flex-1 border-r border-slate-200 dark:border-white/10 mr-4 pr-4">
                                <input
                                    type="text"
                                    value={editingTask.name}
                                    onChange={e => setEditingTask({ ...editingTask, name: e.target.value })}
                                    placeholder="任务名称..."
                                    className="w-full bg-transparent border-none text-base font-bold focus:outline-none text-slate-800 dark:text-gray-100 placeholder:text-slate-300 dark:placeholder:text-gray-600 transition-colors"
                                />
                            </div>

                            <div className="flex items-center gap-3 nodrag shrink-0">
                                {!isCreating && (
                                    <>
                                        <label className="flex items-center gap-2 cursor-pointer mr-2">
                                            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">
                                                {editingTask.enabled ? '启用' : '停用'}
                                            </span>
                                            <div
                                                className={clsx(
                                                    "w-9 h-5 rounded-full transition-colors relative",
                                                    editingTask.enabled ? "bg-slate-800 dark:bg-white" : "bg-slate-200 dark:bg-white/10"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "absolute top-1 left-1 w-3 h-3 rounded-full transition-transform duration-300",
                                                    editingTask.enabled ? "translate-x-4 bg-white dark:bg-black" : "translate-x-0 bg-white dark:bg-gray-400"
                                                )} />
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={editingTask.enabled}
                                                onChange={e => setEditingTask({ ...editingTask, enabled: e.target.checked })}
                                            />
                                        </label>
                                        <button
                                            onClick={() => handleTriggerTask(editingTask.id)}
                                            className="px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-gray-200 rounded-md transition-colors text-xs font-bold flex items-center gap-1.5"
                                        >
                                            <Play size={14} /> 运行
                                        </button>
                                        <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />
                                    </>
                                )}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setActiveTab('config')}
                                        className={clsx(
                                            "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                                            activeTab === 'config' ? "bg-slate-800 text-white dark:bg-white dark:text-black" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                                        )}
                                    >
                                        配置
                                    </button>
                                    {!isCreating && (
                                        <button
                                            onClick={() => setActiveTab('logs')}
                                            className={clsx(
                                                "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                                                activeTab === 'logs' ? "bg-slate-800 text-white dark:bg-white dark:text-black" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                                            )}
                                        >
                                            历史
                                        </button>
                                    )}
                                </div>
                            </div>
                        </header>

                        <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
                            <div className="max-w-2xl mx-auto">
                                {activeTab === 'config' ? (
                                    <div className="space-y-8 animate-in fade-in duration-300 pb-12">

                                        <div className="space-y-3">
                                            <label className="text-sm font-semibold text-slate-700 dark:text-gray-300 flex items-center gap-2">
                                                <FileText size={16} className="text-slate-400" />
                                                Prompt 指令
                                            </label>
                                            <textarea
                                                value={editingTask.prompt}
                                                onChange={e => setEditingTask({ ...editingTask, prompt: e.target.value })}
                                                placeholder="明确告诉 AI 需要完成什么任务，需要使用哪些工具，输出格式要求等..."
                                                rows={5}
                                                className="w-full p-4 bg-slate-50/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-slate-400 dark:focus:border-white/20 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-slate-100 dark:focus:ring-white/5 text-slate-800 dark:text-gray-100 placeholder:text-slate-400 transition-all resize-y"
                                            />
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-300">
                                                <Clock size={16} className="text-slate-400" />
                                                调度规则 (Cron)
                                            </div>

                                            <div className="flex gap-3">
                                                <div className="relative flex-1">
                                                    <input
                                                        type="text"
                                                        value={editingTask.cronExpression}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            setEditingTask({ ...editingTask, cronExpression: val });
                                                            validateCron(val);
                                                        }}
                                                        placeholder="0 * * * *"
                                                        className="w-full p-3 bg-slate-50/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-mono focus:outline-none focus:border-slate-400 dark:focus:border-white/20 text-slate-800 dark:text-gray-100 transition-all"
                                                    />
                                                </div>
                                                <select
                                                    value=""
                                                    onChange={e => {
                                                        if (e.target.value) {
                                                            setEditingTask({ ...editingTask, cronExpression: e.target.value });
                                                            validateCron(e.target.value);
                                                        }
                                                    }}
                                                    className="w-40 px-3 border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 rounded-xl text-sm font-medium focus:outline-none text-slate-700 dark:text-gray-300 cursor-pointer"
                                                >
                                                    <option value="">快速预设...</option>
                                                    {CRON_PRESETS.map(p => (
                                                        <option key={p.value} value={p.value}>{p.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {cronValidation && (
                                                <div className={`text-xs px-1 ${cronValidation.valid ? 'text-green-600 dark:text-green-500' : 'text-red-500'}`}>
                                                    {cronValidation.valid ? (
                                                        <span>下次执行: {cronValidation.nextRuns?.[0] || '未知'}</span>
                                                    ) : (
                                                        <span>无效表达式: {cronValidation.error}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-3 pt-6 border-t border-slate-100 dark:border-white/5">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={editingTask.enableTools !== false}
                                                    onChange={e => setEditingTask({ ...editingTask, enableTools: e.target.checked })}
                                                    className="w-4 h-4 rounded border-slate-300 text-slate-800 focus:ring-slate-800 dark:text-white dark:focus:ring-white"
                                                />
                                                <span className="text-sm font-medium text-slate-700 dark:text-gray-200">允许使用能力工具搜集信息</span>
                                            </label>

                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={editingTask.keepHistory || false}
                                                    onChange={e => setEditingTask({ ...editingTask, keepHistory: e.target.checked })}
                                                    className="w-4 h-4 rounded border-slate-300 text-slate-800 focus:ring-slate-800 dark:text-white dark:focus:ring-white"
                                                />
                                                <span className="text-sm font-medium text-slate-700 dark:text-gray-200">保留任务对话历史</span>
                                            </label>

                                            {editingTask.keepHistory && (
                                                <div className="pl-7 flex items-center gap-2">
                                                    <span className="text-xs text-slate-500">最大循环保留轮次:</span>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={100}
                                                        value={editingTask.maxHistoryTurns || 10}
                                                        onChange={e => setEditingTask({ ...editingTask, maxHistoryTurns: parseInt(e.target.value) || 10 })}
                                                        className="w-16 px-2 py-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md text-sm focus:outline-none"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-8 flex items-center justify-between border-t border-slate-100 dark:border-white/5">
                                            <div>
                                                {saved && (
                                                    <span className="flex items-center gap-1.5 text-xs text-green-500 font-medium">
                                                        <CheckCircle2 size={14} /> 已保存
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-3">
                                                {isCreating && (
                                                    <button
                                                        onClick={handleCancelCreating}
                                                        className="px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                                                    >
                                                        取消
                                                    </button>
                                                )}
                                                <button
                                                    onClick={handleSaveTask}
                                                    disabled={!editingTask.name.trim() || !editingTask.prompt.trim() || (cronValidation !== null && !cronValidation.valid)}
                                                    className="px-6 py-2 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 disabled:bg-slate-200 dark:disabled:bg-white/10 text-white dark:text-black rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
                                                >
                                                    <Save size={14} />
                                                    {isCreating ? '创建' : '保存修改'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-bold text-slate-800 dark:text-white">执行历史</h3>
                                            <button
                                                onClick={() => loadTaskLogs(editingTask.id)}
                                                className="px-3 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 rounded-md text-xs font-semibold transition-colors text-slate-600 dark:text-gray-300 flex items-center gap-1.5"
                                            >
                                                <History size={12} /> 刷新
                                            </button>
                                        </div>

                                        {triggerResult && triggerResult.taskId === editingTask.id && (
                                            <div className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 border ${triggerResult.success
                                                ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400'
                                                : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400'
                                                }`}>
                                                {triggerResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                                {triggerResult.message}
                                            </div>
                                        )}

                                        {loadingLogs === editingTask.id ? (
                                            <div className="text-center py-10 text-slate-400 text-sm">加载中...</div>
                                        ) : (() => {
                                            const logs = taskLogs.get(editingTask.id);
                                            if (!logs || logs.length === 0) {
                                                return (
                                                    <div className="text-center py-16 text-slate-400">
                                                        <History size={24} className="mx-auto opacity-30 mb-3" />
                                                        <p className="text-sm">暂无记录</p>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div className="space-y-3">
                                                    {logs.map(log => <LogEntry key={log.id} log={log} />)}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <Clock size={32} className="opacity-20 mb-4" />
                        <p className="text-sm">选择或新建一个定时任务</p>
                    </div>
                )}
            </main>

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 text-red-600 dark:text-red-500 mb-2">
                            <AlertCircle size={20} />
                            <h3 className="text-lg font-bold">删除确认</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-gray-300 mt-2 mb-6">
                            确定要删除这个定时任务吗？此操作无法撤销。
                        </p>
                        <div className="flex items-center justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => confirmDeleteTask(deleteConfirmId)}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors"
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SchedulerPage;

// ============ LogEntry 子组件 ============
function LogEntry({ log }: { log: TaskLogEntry }) {
    const [expanded, setExpanded] = useState(false);
    const isSuccess = log.status === 'success';

    return (
        <div className="border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden transition-all bg-white dark:bg-white/[0.02]">
            <div
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                onClick={() => setExpanded(!expanded)}
            >
                <div className={`shrink-0 ${isSuccess ? 'text-green-500' : 'text-red-500'}`}>
                    {isSuccess ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                </div>
                <div className="flex-1 min-w-0 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-800 dark:text-gray-200">
                            {new Date(log.startedAt).toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400">
                            {(log.durationMs / 1000).toFixed(1)}s
                        </span>
                    </div>
                </div>
                <div className={clsx("text-slate-400 transition-transform duration-200", expanded ? "rotate-180" : "")}>
                    <ChevronDownIcon size={16} />
                </div>
            </div>

            {expanded && (log.output || log.error) && (
                <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-white/5">
                    {log.error ? (
                        <pre className="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap word-break">
                            {log.error}
                        </pre>
                    ) : log.output ? (
                        <pre className="text-xs text-slate-600 dark:text-gray-400 font-mono whitespace-pre-wrap word-break">
                            {log.output}
                        </pre>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function ChevronDownIcon(props: any) {
    return (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    )
}
