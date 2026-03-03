import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, Play, Save, CheckCircle2, AlertCircle, History, FileText, Search, Box } from 'lucide-react';
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
        cronExpression: '0 * * * *',  // 默认每小时
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

    // 加载任务状态
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

    // 验证 cron
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

    // 加载某个任务的执行日志
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

    // 切到日志 tab 时加载
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
            setSearchTerm(''); // clear search so it appears
            // 找到新加的 index 并选中
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

    const handleDeleteTask = async (taskId: string) => {
        const updatedTasks = tasks.filter(t => t.id !== taskId);
        await saveTasks(updatedTasks);
        if (selectedTask?.id === taskId) {
            setSelectedIdx(null);
            setEditingTask(null);
        }
    };

    const handleToggleTask = async (taskId: string) => {
        const updatedTasks = tasks.map(t =>
            t.id === taskId ? { ...t, enabled: !t.enabled } : t
        );
        await saveTasks(updatedTasks);
    };

    const handleTriggerTask = async (taskId: string) => {
        setTriggerResult({ taskId, message: '正在执行...', success: true });
        // 切到日志页看看
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
        <div className="flex h-full w-full bg-slate-50 dark:bg-black/20 overflow-hidden animate-in fade-in duration-500">
            {/* Left Sidebar: Task List */}
            <div className="w-72 shrink-0 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#18181b]/50 flex flex-col">
                <header className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center px-4 draggable shrink-0 bg-white dark:bg-[#18181b]">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg">
                            <Clock size={16} />
                        </div>
                        <h1 className="text-sm font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                            定时任务
                        </h1>
                    </div>
                </header>

                <div className="p-4 flex flex-col gap-4 flex-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                            <input
                                type="text"
                                placeholder="搜索任务..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                            />
                        </div>
                        <button
                            onClick={handleAddTask}
                            className="p-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 transition-colors shadow-sm"
                            title="新建任务"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {isCreating && editingTask && (
                            <button
                                className="w-full text-left p-3 rounded-xl border transition-all duration-200 relative mb-1 bg-white dark:bg-white/5 border-amber-300 dark:border-amber-500/30 shadow-sm z-10"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-500 text-white shadow-lg">
                                            <Plus size={16} />
                                        </div>
                                        <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                            {editingTask.name || '新建任务...'}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        )}

                        {filteredTasks.map((task, idx) => {
                            const isSelected = !isCreating && selectedIdx === idx;
                            const isActive = task.enabled;
                            const status = getStatus(task.id);

                            return (
                                <button
                                    key={task.id}
                                    onClick={() => {
                                        setIsCreating(false);
                                        setSelectedIdx(idx);
                                    }}
                                    className={clsx(
                                        "w-full text-left p-3 rounded-xl border transition-all duration-200 group relative mb-1 flex flex-col gap-1",
                                        isSelected
                                            ? "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 shadow-sm z-10"
                                            : "bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5 overflow-hidden">
                                            <div className={clsx(
                                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-300",
                                                isSelected ? "bg-amber-500 text-white shadow-amber-500/20 shadow-lg" : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400"
                                            )}>
                                                <Clock size={16} />
                                            </div>
                                            <span className={clsx("font-semibold text-sm truncate", isSelected ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-gray-400")}>
                                                {task.name || '未命名'}
                                            </span>
                                        </div>
                                        {isActive && (
                                            <div className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">ON</div>
                                        )}
                                    </div>
                                    <div className="pl-[42px] flex items-center gap-2">
                                        <code className="text-[10px] text-slate-400 dark:text-gray-500 font-mono bg-slate-100 dark:bg-white/5 px-1 py-0.5 rounded">
                                            {task.cronExpression}
                                        </code>
                                        {status?.isRunning && <span className="text-[10px] text-amber-500 font-medium animate-pulse">● 运行中</span>}
                                        {!status?.isRunning && status?.lastRunStatus === 'error' && <span className="text-[10px] text-red-500">✕ 失败</span>}
                                    </div>
                                </button>
                            );
                        })}

                        {!isCreating && filteredTasks.length === 0 && (
                            <div className="text-center py-12 text-slate-400">
                                <Box className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">{searchTerm ? '未找到任务' : '暂无定时任务'}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Detailed View */}
            <main className="flex-1 flex flex-col overflow-hidden relative h-full bg-white dark:bg-[#09090b]">
                {(editingTask) ? (
                    <>
                        {/* Header */}
                        <header className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 draggable shrink-0 z-10 bg-white dark:bg-[#09090b]">
                            <div className="flex items-center gap-4">
                                <h1 className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                                    {isCreating ? '新建任务' : editingTask.name || '任务设置'}
                                </h1>

                                <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-1" />

                                <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                                    <button
                                        onClick={() => setActiveTab('config')}
                                        className={clsx(
                                            "px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
                                            activeTab === 'config' ? "bg-white dark:bg-white/10 text-amber-600 dark:text-white shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                                        )}
                                    >
                                        配置
                                    </button>
                                    {!isCreating && (
                                        <button
                                            onClick={() => setActiveTab('logs')}
                                            className={clsx(
                                                "px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
                                                activeTab === 'logs' ? "bg-white dark:bg-white/10 text-amber-600 dark:text-white shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                                            )}
                                        >
                                            历史
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 nodrag">
                                {!isCreating && (
                                    <>
                                        <button
                                            onClick={() => handleTriggerTask(editingTask.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-gray-300 rounded-lg transition-colors text-xs font-medium"
                                        >
                                            <Play size={14} /> 执行
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTask(editingTask.id)}
                                            className="text-red-400 hover:text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                            title="删除"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </>
                                )}
                                <div className="w-12 border-l border-slate-200 dark:border-white/10 ml-2" />
                            </div>
                        </header>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
                            <div className="max-w-3xl mx-auto">
                                {activeTab === 'config' ? (
                                    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 pb-20">
                                        {/* Status Card (Only if not creating) */}
                                        {!isCreating && (
                                            <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={clsx(
                                                        "w-12 h-12 rounded-xl flex items-center justify-center text-xl",
                                                        editingTask.enabled ? "bg-amber-500/10 text-amber-600" : "bg-slate-200 dark:bg-white/10 text-slate-400"
                                                    )}>
                                                        <Clock size={24} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-base font-bold text-slate-800 dark:text-white leading-tight">启用定时任务</h3>
                                                        <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">任务将在后台依据设定周期自动执行</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newVal = !editingTask.enabled;
                                                        setEditingTask({ ...editingTask, enabled: newVal });
                                                        // Auto save toggles for convenience if we want, but better to let user click save
                                                        // The user has to click save to persist, or we auto persist. Let's rely on save button for config parity.
                                                        // Wait, for quick toggle it's better to auto save
                                                    }}
                                                    className={clsx(
                                                        "w-12 h-6 rounded-full transition-all relative cursor-pointer ring-offset-2 focus:ring-2 focus:ring-amber-500",
                                                        editingTask.enabled ? "bg-amber-500 shadow-lg shadow-amber-500/20" : "bg-slate-200 dark:bg-white/10"
                                                    )}
                                                >
                                                    <div className={clsx(
                                                        "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300",
                                                        editingTask.enabled ? "translate-x-6" : "translate-x-0"
                                                    )} />
                                                </button>
                                            </div>
                                        )}

                                        {/* Name & Prompt */}
                                        <div className="space-y-5 p-6 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-white/10 rounded-2xl">
                                            <div className="space-y-1.5">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">任务名称</label>
                                                <input
                                                    type="text"
                                                    value={editingTask.name}
                                                    onChange={e => setEditingTask({ ...editingTask, name: e.target.value })}
                                                    placeholder="例：每日早间新闻简报生成"
                                                    className="w-full px-4 py-2 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-800 dark:text-gray-100 placeholder:text-slate-400 transition-all"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">Prompt / 提示词</label>
                                                <textarea
                                                    value={editingTask.prompt}
                                                    onChange={e => setEditingTask({ ...editingTask, prompt: e.target.value })}
                                                    placeholder="明确告诉 AI 需要完成什么任务，需要使用哪些工具，输出格式要求等..."
                                                    rows={6}
                                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-800 dark:text-gray-100 placeholder:text-slate-400 transition-all resize-y"
                                                />
                                            </div>
                                        </div>

                                        {/* Scheduled Expression */}
                                        <div className="space-y-4 p-6 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-white/10 rounded-2xl">
                                            <div>
                                                <h3 className="text-sm font-medium text-slate-800 dark:text-gray-100">调度周期 (Cron)</h3>
                                                <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 mb-4">使用标准的 Linux Cron 表达式定制执行间隔。分 时 日 月 星期</p>
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
                                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-800 dark:text-gray-100 transition-all"
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
                                                    className="w-40 px-4 py-2.5 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:border-amber-500 text-slate-700 dark:text-gray-300 cursor-pointer transition-all"
                                                >
                                                    <option value="">快速预设...</option>
                                                    {CRON_PRESETS.map(p => (
                                                        <option key={p.value} value={p.value}>{p.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {cronValidation && (
                                                <div className={`text-xs p-3 rounded-xl border ${cronValidation.valid ? 'bg-green-50 border-green-100 text-green-700 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400' : 'bg-red-50 border-red-100 text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400'}`}>
                                                    {cronValidation.valid ? (
                                                        <div className="flex flex-col gap-1">
                                                            <span className="font-semibold flex items-center gap-1"><CheckCircle2 size={12} /> 表达式有效</span>
                                                            <div className="opacity-80 pl-4">
                                                                下三次执行时间: {cronValidation.nextRuns?.slice(0, 3).join(' ｜ ')}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="flex items-center gap-1"><AlertCircle size={12} /> 无效表达式: {cronValidation.error}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Advanced */}
                                        <div className="space-y-4 p-6 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-white/10 rounded-2xl">
                                            <h3 className="text-sm font-medium text-slate-800 dark:text-gray-100">高级选项</h3>

                                            <div className="grid grid-cols-2 gap-6">
                                                <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={editingTask.enableTools !== false}
                                                        onChange={e => setEditingTask({ ...editingTask, enableTools: e.target.checked })}
                                                        className="w-4 h-4 rounded border-slate-300 dark:border-gray-600 text-amber-500 focus:ring-amber-500"
                                                    />
                                                    <div>
                                                        <span className="block text-sm font-medium text-slate-700 dark:text-gray-200">允许使用能力工具</span>
                                                        <span className="block text-xs text-slate-400 mt-0.5">默认允许Agent自由使用工具搜集信息</span>
                                                    </div>
                                                </label>

                                                <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={editingTask.keepHistory || false}
                                                        onChange={e => setEditingTask({ ...editingTask, keepHistory: e.target.checked })}
                                                        className="w-4 h-4 rounded border-slate-300 dark:border-gray-600 text-amber-500 focus:ring-amber-500"
                                                    />
                                                    <div>
                                                        <span className="block text-sm font-medium text-slate-700 dark:text-gray-200">保留任务对话历史</span>
                                                        <span className="block text-xs text-slate-400 mt-0.5">将上下文带入下一次执行中</span>
                                                    </div>
                                                </label>
                                            </div>

                                            {editingTask.keepHistory && (
                                                <div className="pl-2 flex items-center gap-3">
                                                    <span className="text-sm text-slate-600 dark:text-gray-400">最大循环保留轮次:</span>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={100}
                                                        value={editingTask.maxHistoryTurns || 10}
                                                        onChange={e => setEditingTask({ ...editingTask, maxHistoryTurns: parseInt(e.target.value) || 10 })}
                                                        className="w-24 px-3 py-1.5 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-gray-200"
                                                    />
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-white/5">
                                                <div className="space-y-1.5">
                                                    <label className="block text-xs text-slate-500 dark:text-gray-400">大模型源覆盖 (可选)</label>
                                                    <input
                                                        type="text"
                                                        value={editingTask.provider || ''}
                                                        onChange={e => setEditingTask({ ...editingTask, provider: e.target.value || undefined })}
                                                        placeholder="留空则使用全局默认 Provider"
                                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-gray-200 placeholder:text-slate-400"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="block text-xs text-slate-500 dark:text-gray-400">模型覆盖 (可选)</label>
                                                    <input
                                                        type="text"
                                                        value={editingTask.model || ''}
                                                        onChange={e => setEditingTask({ ...editingTask, model: e.target.value || undefined })}
                                                        placeholder="留空使用全局默认 Model"
                                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-800 dark:text-gray-200 placeholder:text-slate-400"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">执行历史记录</h3>
                                            <button
                                                onClick={() => loadTaskLogs(editingTask.id)}
                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg text-xs font-medium transition-colors text-slate-600 dark:text-gray-300"
                                            >
                                                刷新记录
                                            </button>
                                        </div>

                                        {triggerResult && triggerResult.taskId === editingTask.id && (
                                            <div className={`p-4 rounded-xl text-sm font-medium ${triggerResult.success
                                                ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                                                : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                                                }`}>
                                                {triggerResult.message}
                                            </div>
                                        )}

                                        {loadingLogs === editingTask.id ? (
                                            <div className="text-center py-12 text-slate-400 dark:text-gray-500 text-sm">加载中...</div>
                                        ) : (() => {
                                            const logs = taskLogs.get(editingTask.id);
                                            if (!logs || logs.length === 0) {
                                                return (
                                                    <div className="text-center py-16 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">
                                                        <History size={32} className="mx-auto text-slate-300 dark:text-gray-600 mb-3" />
                                                        <p className="text-sm text-slate-500 dark:text-gray-400">该任务暂时没有任何执行记录</p>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="space-y-3">
                                                    {logs.map(log => (
                                                        <LogEntry key={log.id} log={log} />
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Floating Action Bar (Save) */}
                        {activeTab === 'config' && (
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center bg-white/80 dark:bg-black/80 backdrop-blur-md px-2 py-2 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 z-20">
                                {isCreating && (
                                    <button
                                        onClick={handleCancelCreating}
                                        className="px-6 py-2.5 text-sm font-medium text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                                    >
                                        取消
                                    </button>
                                )}
                                <button
                                    onClick={handleSaveTask}
                                    disabled={!editingTask.name.trim() || !editingTask.prompt.trim() || (cronValidation !== null && !cronValidation.valid)}
                                    className="px-8 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 dark:disabled:bg-gray-800 disabled:text-slate-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
                                >
                                    <Save size={16} />
                                    {isCreating ? '创建任务' : '保存修改'}
                                </button>
                                {saved && (
                                    <span className="absolute -right-32 flex items-center gap-1.5 text-xs text-green-500 opacity-80 animate-in fade-in slide-in-from-left-2">
                                        <CheckCircle2 size={14} /> saved
                                    </span>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-6">
                        <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-3xl flex items-center justify-center -rotate-3 border border-slate-200 dark:border-white/10 shadow-sm">
                            <Clock size={40} className="text-amber-500" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-gray-200">定时任务 / Scheduler</h3>
                            <p className="text-sm text-slate-500 dark:text-gray-500 mt-2 max-w-xs mx-auto">
                                从左侧列表选择或新建一个定时任务。配置 Cron 表达式以周期性触发 AI 代理执行特定操作。
                            </p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default SchedulerPage;

// ============ LogEntry 子组件 ============
function LogEntry({ log }: { log: TaskLogEntry }) {
    const [expanded, setExpanded] = useState(false);
    const isSuccess = log.status === 'success';

    return (
        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden hover:border-slate-300 dark:hover:border-white/20 transition-all">
            <div
                className="flex items-center gap-4 px-5 py-3 cursor-pointer select-none"
                onClick={() => setExpanded(!expanded)}
            >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isSuccess ? 'bg-green-50 text-green-500 dark:bg-green-500/10' : 'bg-red-50 text-red-500 dark:bg-red-500/10'}`}>
                    {isSuccess ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800 dark:text-gray-200">
                            {new Date(log.startedAt).toLocaleString()}
                        </span>
                        {log.stepCount !== undefined && log.stepCount > 0 && (
                            <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 text-[10px] font-bold rounded">
                                {log.stepCount} STEPS
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-gray-500 mt-0.5 truncate">
                        耗时: {(log.durationMs / 1000).toFixed(1)}s
                    </div>
                </div>

                <div className="text-slate-300 dark:text-gray-600 transition-transform duration-300" style={{ transform: expanded ? 'rotate(180deg)' : '' }}>
                    <ChevronDownIcon size={20} />
                </div>
            </div>

            {expanded && (log.output || log.error) && (
                <div className="px-5 pb-5 pt-1 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2 mb-2 text-slate-400 dark:text-gray-500">
                        <FileText size={14} />
                        <span className="text-xs font-bold uppercase tracking-wider">{log.error ? 'Error Message' : 'Output Result'}</span>
                    </div>
                    {log.error ? (
                        <pre className="text-sm text-red-600 dark:text-red-400 font-mono leading-relaxed whitespace-pre-wrap break-all custom-scrollbar overflow-x-hidden">
                            {log.error}
                        </pre>
                    ) : log.output ? (
                        <pre className="text-[13px] text-slate-700 dark:text-gray-300 font-mono leading-relaxed whitespace-pre-wrap break-all custom-scrollbar overflow-x-hidden">
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
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    )
}
