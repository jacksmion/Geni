import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, Play, Save, CheckCircle2, AlertCircle, History, FileText, Search, Box, X } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { ScheduledTaskConfig } from '../../common/types/settings';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { preprocessMarkdown } from '../utils/markdown';
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

    // 定期刷新日志（仅在 logs 标签激活时）
    useEffect(() => {
        if (activeTab === 'logs' && selectedTask) {
            loadTaskLogs(selectedTask.id);
            // 设置定期刷新
            const interval = setInterval(() => loadTaskLogs(selectedTask.id), 10000);
            return () => clearInterval(interval);
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
                                    <button
                                        onClick={() => !isCreating && setActiveTab('logs')}
                                        disabled={isCreating}
                                        className={clsx(
                                            "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                                            activeTab === 'logs' ? "bg-slate-800 text-white dark:bg-white dark:text-black" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5",
                                            isCreating && "opacity-40 cursor-not-allowed"
                                        )}
                                    >
                                        历史
                                    </button>
                                </div>
                            </div>
                        </header>

                        <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
                            <div className="max-w-2xl mx-auto">
                                {activeTab === 'config' ? (
                                    <div className="space-y-6 animate-in fade-in duration-300 pb-12">

                                        {/* 卡片一：基本信息与指令 */}
                                        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm space-y-5">
                                            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div>
                                                    <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">基本信息与指令</h3>
                                                </div>
                                                {!isCreating && (
                                                    <div className="flex items-center gap-4">
                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase transition-colors group-hover:text-slate-700 dark:group-hover:text-gray-200">
                                                                {editingTask.enabled ? '已启用' : '已停用'}
                                                            </span>
                                                            <div
                                                                className={clsx(
                                                                    "w-9 h-5 rounded-full transition-colors relative",
                                                                    editingTask.enabled ? "bg-indigo-600 dark:bg-indigo-500" : "bg-slate-200 dark:bg-white/10"
                                                                )}
                                                            >
                                                                <div className={clsx(
                                                                    "absolute top-1 left-1 w-3 h-3 rounded-full transition-transform duration-300 shadow-sm",
                                                                    editingTask.enabled ? "translate-x-4 bg-white" : "translate-x-0 bg-white dark:bg-gray-400"
                                                                )} />
                                                            </div>
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={editingTask.enabled}
                                                                onChange={e => setEditingTask({ ...editingTask, enabled: e.target.checked })}
                                                            />
                                                        </label>
                                                        <div className="w-px h-4 bg-slate-200 dark:bg-white/10" />
                                                        <button
                                                            onClick={() => handleTriggerTask(editingTask.id)}
                                                            className="px-3 py-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors text-xs font-bold flex items-center gap-1.5 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30"
                                                        >
                                                            <Play size={14} className="fill-current" /> 立即运行
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-3">
                                                <label className="text-sm font-medium text-slate-700 dark:text-gray-300 flex items-center gap-2">
                                                    Prompt 指令
                                                </label>
                                                <textarea
                                                    value={editingTask.prompt}
                                                    onChange={e => setEditingTask({ ...editingTask, prompt: e.target.value })}
                                                    placeholder="明确告诉 AI 需要完成什么任务，需要使用哪些工具，输出格式要求等... 支持 {变量} 插入（如适用）"
                                                    rows={5}
                                                    className="w-full p-4 bg-slate-50/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 focus:border-indigo-400 dark:focus:border-indigo-500/50 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-500/10 text-slate-800 dark:text-gray-100 placeholder:text-slate-400 transition-all resize-y"
                                                />
                                            </div>

                                            <div className="space-y-3 pt-2">
                                                <label className="text-sm font-medium text-slate-700 dark:text-gray-300 flex items-center gap-2">
                                                    工具权限
                                                </label>
                                                <div className="flex items-center gap-6 p-3 bg-slate-50/80 dark:bg-white/[0.02] rounded-xl border border-slate-100 dark:border-white/5">
                                                    <label className="flex items-center gap-3 cursor-pointer group">
                                                        <input
                                                            type="checkbox"
                                                            checked={editingTask.enableTools !== false}
                                                            onChange={e => setEditingTask({ ...editingTask, enableTools: e.target.checked })}
                                                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 dark:border-white/20 dark:bg-transparent dark:checked:bg-indigo-500"
                                                        />
                                                        <span className="text-sm font-medium text-slate-700 dark:text-gray-200">允许调用所有工具 (包含联网等)</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 卡片二：调度规则配置 */}
                                        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm space-y-5">
                                            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-white/5">
                                                <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
                                                <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">调度规则</h3>
                                            </div>

                                            <CronGenerator
                                                value={editingTask.cronExpression}
                                                onChange={(val) => {
                                                    setEditingTask({ ...editingTask, cronExpression: val });
                                                    validateCron(val);
                                                }}
                                                validation={cronValidation}
                                            />
                                        </div>

                                        {/* 卡片三：高级配置 */}
                                        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm space-y-5">
                                            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-white/5">
                                                <div className="w-1.5 h-4 bg-slate-400 rounded-full"></div>
                                                <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">高级配置</h3>
                                            </div>

                                            <div className="space-y-4">
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
                                                            className="w-16 px-2 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md text-sm focus:outline-none focus:border-slate-400 dark:focus:border-white/20"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="pt-2 flex items-center justify-between">
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
                                                        className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                                                    >
                                                        取消
                                                    </button>
                                                )}
                                                <button
                                                    onClick={handleSaveTask}
                                                    disabled={!editingTask.name.trim() || !editingTask.prompt.trim() || (cronValidation !== null && !cronValidation.valid)}
                                                    className="px-6 py-2.5 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 disabled:bg-slate-200 dark:disabled:bg-white/10 text-white dark:text-black rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm disabled:shadow-none"
                                                >
                                                    <Save size={16} />
                                                    {isCreating ? '创建任务' : '保存修改'}
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

// ============ Helper Components ============
function MarkdownCode({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '')
    const codeString = String(children).replace(/\n$/, '')
    const { settings } = useSettingsStore();
    const syntaxTheme = settings.theme === 'dark' ? vscDarkPlus : oneLight;

    return !inline && match ? (
        <div className="not-prose rounded-lg overflow-hidden my-2 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
            <div className="px-3 py-1 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase">{match[1]}</span>
            </div>
            <SyntaxHighlighter
                style={syntaxTheme}
                language={match[1]}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    padding: '0.75rem',
                    background: 'transparent',
                    fontSize: '12px',
                    lineHeight: '1.6',
                }}
                {...props}
            >
                {codeString}
            </SyntaxHighlighter>
        </div>
    ) : (
        <code className="bg-indigo-50 dark:bg-indigo-500/10 px-1 py-0.5 rounded text-indigo-700 dark:text-indigo-300 font-mono text-xs" {...props}>
            {children}
        </code>
    )
}

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
                <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-white/5 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {log.error ? (
                        <pre className="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap word-break">
                            {log.error}
                        </pre>
                    ) : log.output ? (
                        <div className="prose prose-slate dark:prose-invert max-w-none
                            prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
                            prose-headings:font-bold prose-headings:text-slate-950 dark:prose-headings:text-white
                            prose-h1:text-lg prose-h1:mt-4 prose-h1:mb-2
                            prose-h2:text-base prose-h2:mt-3 prose-h2:mb-1.5
                            prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-1
                            prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5 prose-ul:text-[13px]
                            prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5 prose-ol:text-[13px]
                            prose-li:my-0.5 prose-li:marker:text-indigo-500 dark:prose-li:marker:text-indigo-400
                            prose-strong:text-slate-900 dark:prose-strong:text-zinc-100 prose-strong:font-bold
                            prose-code:text-indigo-700 dark:prose-code:text-indigo-300 prose-code:bg-indigo-50 dark:prose-code:bg-indigo-500/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-xs
                            prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    code: MarkdownCode
                                }}
                            >
                                {preprocessMarkdown(log.output)}
                            </ReactMarkdown>
                        </div>
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

// ============ Cron 可视化生成器组件 ============
interface CronGeneratorProps {
    value: string;
    onChange: (cron: string) => void;
    validation: { valid: boolean; error?: string; nextRuns?: string[] } | null;
}

function parseCronToMode(cron: string): { mode: 'hour' | 'day' | 'week' | 'custom', params: any } {
    if (!cron) return { mode: 'custom', params: {} };
    const parts = cron.split(' ');
    if (parts.length === 5) {
        const [m, h, d, mon, dow] = parts;
        if (m === '0' && h.startsWith('*/') && d === '*' && mon === '*' && dow === '*') {
            return { mode: 'hour', params: { interval: parseInt(h.replace('*/', '')) || 1 } };
        }
        if (m === '0' && (h === '*' || h === '*/1') && d === '*' && mon === '*' && dow === '*') {
            return { mode: 'hour', params: { interval: 1 } };
        }
        if (m !== '*' && !m.includes('/') && h !== '*' && !h.includes('/') && d === '*' && mon === '*' && dow === '*') {
            return { mode: 'day', params: { time: `${h.padStart(2, '0')}:${m.padStart(2, '0')}` } };
        }
        if (m !== '*' && !m.includes('/') && h !== '*' && !h.includes('/') && d === '*' && mon === '*' && dow !== '*') {
            return { mode: 'week', params: { time: `${h.padStart(2, '0')}:${m.padStart(2, '0')}`, days: dow.split(',').map(Number) } };
        }
    }
    return { mode: 'custom', params: {} };
}

function CronGenerator({ value, onChange, validation }: CronGeneratorProps) {
    const parsed = React.useMemo(() => parseCronToMode(value), [value]);
    const [mode, setMode] = useState<'hour' | 'day' | 'week' | 'custom'>(parsed.mode);

    const [hourInterval, setHourInterval] = useState(parsed.params.interval || 1);
    const [timeStr, setTimeStr] = useState<string>(parsed.params.time || '09:00');
    const [weekDays, setWeekDays] = useState<number[]>(parsed.params.days || [1]);

    useEffect(() => {
        if (mode === 'custom') return;

        let newCron = '';
        if (mode === 'hour') {
            newCron = hourInterval === 1 ? '0 * * * *' : `0 */${hourInterval} * * *`;
        } else if (mode === 'day') {
            const [h, m] = timeStr.split(':');
            newCron = `${parseInt(m)} ${parseInt(h)} * * *`;
        } else if (mode === 'week') {
            const [h, m] = timeStr.split(':');
            const dayStr = weekDays.length > 0 ? weekDays.sort().join(',') : '*';
            newCron = `${parseInt(m)} ${parseInt(h)} * * ${dayStr}`;
        }

        if (newCron && newCron !== value) {
            onChange(newCron);
        }
    }, [mode, hourInterval, timeStr, weekDays]);

    const tabs = [
        { id: 'hour', label: '按小时' },
        { id: 'day', label: '按天' },
        { id: 'week', label: '按周' },
        { id: 'custom', label: '自定义 (Cron)' }
    ] as const;

    const DOW_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

    return (
        <div className="space-y-4">
            <div className="flex p-1 bg-slate-100 dark:bg-white/5 rounded-lg w-fit">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setMode(tab.id)}
                        className={clsx(
                            "px-4 py-1.5 rounded-md text-xs font-semibold transition-all",
                            mode === tab.id
                                ? "bg-white dark:bg-[#18181b] text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-gray-300 font-medium"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl space-y-4">
                {mode === 'hour' && (
                    <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-gray-300 font-medium">
                        <span>每</span>
                        <select
                            value={hourInterval}
                            onChange={(e) => setHourInterval(Number(e.target.value))}
                            className="bg-white dark:bg-[#0c0c0e] border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                            {[1, 2, 3, 4, 6, 8, 12].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <span>小时执行一次</span>
                    </div>
                )}

                {mode === 'day' && (
                    <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-gray-300 font-medium">
                        <span>每天</span>
                        <input
                            type="time"
                            value={timeStr}
                            onChange={(e) => setTimeStr(e.target.value)}
                            className="bg-white dark:bg-[#0c0c0e] border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <span>执行</span>
                    </div>
                )}

                {mode === 'week' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-gray-300 font-medium">
                            <span>每周</span>
                            <div className="flex gap-1.5">
                                {[1, 2, 3, 4, 5, 6, 0].map(day => (
                                    <button
                                        key={day}
                                        onClick={() => {
                                            if (weekDays.includes(day)) {
                                                setWeekDays(weekDays.filter(d => d !== day));
                                            } else {
                                                setWeekDays([...weekDays, day]);
                                            }
                                        }}
                                        className={clsx(
                                            "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors border",
                                            weekDays.includes(day)
                                                ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-500/20 dark:border-indigo-500/30 dark:text-indigo-300"
                                                : "bg-white border-slate-200 text-slate-600 dark:bg-[#0c0c0e] dark:border-white/10 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/10"
                                        )}
                                    >
                                        {DOW_LABELS[day]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-gray-300 font-medium">
                            <span>的</span>
                            <input
                                type="time"
                                value={timeStr}
                                onChange={(e) => setTimeStr(e.target.value)}
                                className="bg-white dark:bg-[#0c0c0e] border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                            <span>执行</span>
                        </div>
                    </div>
                )}

                {mode === 'custom' && (
                    <div className="space-y-2">
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="0 * * * *"
                            className="w-full p-3 bg-white dark:bg-[#0c0c0e] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-mono focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500/30 text-slate-800 dark:text-gray-100 transition-all font-medium"
                        />
                        <div className="text-xs text-slate-500 flex gap-4 font-mono font-medium opacity-80 pl-1">
                            <span><span className="text-slate-400">分</span> (0-59)</span>
                            <span><span className="text-slate-400">时</span> (0-23)</span>
                            <span><span className="text-slate-400">日</span> (1-31)</span>
                            <span><span className="text-slate-400">月</span> (1-12)</span>
                            <span><span className="text-slate-400">周</span> (0-7)</span>
                        </div>
                    </div>
                )}

                {/* Validation and Preview Area */}
                {validation && (
                    <div className="pt-4 mt-2 border-t border-slate-200/60 dark:border-white/5">
                        <div className={clsx("text-xs flex flex-col gap-2", validation.valid ? 'text-slate-600 dark:text-gray-300' : 'text-red-500')}>
                            {validation.valid ? (
                                <>
                                    <span className="font-semibold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500">
                                        <CheckCircle2 size={14} /> 表达式合法，预估近期执行时间：
                                    </span>
                                    <div className="pl-5 space-y-1 mt-0.5">
                                        {validation.nextRuns?.slice(0, 3).map((run, i) => (
                                            <div key={i} className="font-mono text-[11px] font-medium opacity-80 flex items-center gap-2">
                                                <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-[10px]">{i + 1}</span>
                                                {run}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <span className="flex items-center gap-1.5 font-medium"><AlertCircle size={14} /> 无效表达式: {validation.error}</span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
