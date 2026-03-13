import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, Play, Save, CheckCircle2, AlertCircle, History, FileText, Search, Box, X, Bell, MessageSquare, CheckSquare, Square } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { Switch } from '../components/Switch';
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
        notification: {
            enabled: false,
            imSessionId: '',
        }
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

/** 极简 Cron 人类可读转换 (针对预设和常用模式优化) */
function getCronHumanSummary(cron: string): string {
    const preset = CRON_PRESETS.find(p => p.value === cron);
    if (preset) return preset.label;

    // 处理常用模式的正则匹配
    const everyNMinutes = cron.match(/^\*\/(\d+) \* \* \* \*$/);
    if (everyNMinutes) return `每 ${everyNMinutes[1]} 分钟`;

    const everyNHours = cron.match(/^0 \*\/(\d+) \* \* \*$/);
    if (everyNHours) return `每 ${everyNHours[1]} 小时`;

    // 如果匹配不到，返回原始 cron (或简单的占位)
    return cron;
}

const SchedulerPage: React.FC = () => {
    const settings = useSettingsStore(s => s.settings);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const tasks = settings.scheduledTasks || [];

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [editingTask, setEditingTask] = useState<ScheduledTaskConfig | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const [cronValidation, setCronValidation] = useState<{ valid: boolean; error?: string; nextRuns?: string[] } | null>(null);
    const [statuses, setStatuses] = useState<TaskStatusInfo[]>([]);
    const [triggerResult, setTriggerResult] = useState<{ taskId: string; message: string; success: boolean } | null>(null);
    const [taskLogs, setTaskLogs] = useState<Map<string, TaskLogEntry[]>>(new Map());
    const [loadingLogs, setLoadingLogs] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');
    const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());

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
        // 切换tab时清空选中状态
        if (activeTab === 'config') {
            setSelectedLogIds(new Set());
        }
    }, [activeTab, selectedTask?.id]);

    // 切换任务时清空选中状态
    useEffect(() => {
        setSelectedLogIds(new Set());
    }, [selectedTask?.id]);

    const saveTasks = async (updatedTasks: ScheduledTaskConfig[]) => {
        setIsSaving(true);
        try {
            await updateSettings({ scheduledTasks: updatedTasks });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } finally {
            setIsSaving(false);
        }
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
            const updatedTasks = [...tasks, editingTask];
            
            // 计算新任务在全量列表中的索引（由于清空了搜索，新任务必在末尾）
            const newIndex = updatedTasks.length - 1;
            
            // 同步切换 UI 状态，确保选中逻辑的一致性
            setIsCreating(false);
            setSearchTerm('');
            if (newIndex >= 0) setSelectedIdx(newIndex);
            
            await saveTasks(updatedTasks);
        } else {
            const existingIndex = tasks.findIndex(t => t.id === editingTask.id);
            if (existingIndex >= 0) {
                const updatedTasks = [...tasks];
                updatedTasks[existingIndex] = editingTask;
                await saveTasks(updatedTasks);
            }
        }
    };

    const confirmDeleteTask = async (taskId: string) => {
        setDeleteConfirmId(null);
        try {
            const updatedTasks = tasks.filter(t => t.id !== taskId);
            await saveTasks(updatedTasks);
            
            if (selectedTask?.id === taskId) {
                setSelectedIdx(null);
                setEditingTask(null);
            }
        } catch (e) {
            console.error('Failed to delete task:', e);
        }
    };

    const handleDeleteLog = async (logId: string) => {
        if (!editingTask) return;
        try {
            await window.electronAPI.scheduler.deleteLogs(editingTask.id, [logId]);
            await loadTaskLogs(editingTask.id);
            setSelectedLogIds(prev => {
                const next = new Set(prev);
                next.delete(logId);
                return next;
            });
        } catch (e) {
            console.error('Failed to delete log:', e);
        }
    };

    const handleDeleteSelectedLogs = async () => {
        if (!editingTask || selectedLogIds.size === 0) return;
        try {
            await window.electronAPI.scheduler.deleteLogs(editingTask.id, Array.from(selectedLogIds));
            await loadTaskLogs(editingTask.id);
            setSelectedLogIds(new Set());
        } catch (e) {
            console.error('Failed to delete logs:', e);
        }
    };

    const handleDeleteAllLogs = async () => {
        if (!editingTask) return;
        try {
            await window.electronAPI.scheduler.deleteAllLogs(editingTask.id);
            await loadTaskLogs(editingTask.id);
            setSelectedLogIds(new Set());
        } catch (e) {
            console.error('Failed to delete all logs:', e);
        }
    };

    const toggleLogSelection = (logId: string) => {
        setSelectedLogIds(prev => {
            const next = new Set(prev);
            if (next.has(logId)) {
                next.delete(logId);
            } else {
                next.add(logId);
            }
            return next;
        });
    };

    const toggleAllLogs = () => {
        const logs = taskLogs.get(editingTask?.id || '') || [];
        if (selectedLogIds.size === logs.length) {
            setSelectedLogIds(new Set());
        } else {
            setSelectedLogIds(new Set(logs.map(log => log.id)));
        }
    };

    const handleTriggerTask = async (taskId: string) => {
        // 如果正在编辑当前任务，先自动保存以确保执行的是最新配置
        if (editingTask && editingTask.id === taskId) {
            await handleSaveTask();
        }

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
                <header className="h-12 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-4 draggable shrink-0">
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
                                            <span className="text-[11px] text-slate-400 dark:text-gray-500 font-medium truncate">
                                                {getCronHumanSummary(task.cronExpression)}
                                            </span>
                                            {status?.isRunning && (
                                                <div className="flex items-center gap-1 overflow-hidden shrink-0">
                                                    <span className="w-1 h-1 bg-amber-500 rounded-full animate-ping" />
                                                    <span className="text-[9px] text-amber-500/80 font-bold uppercase tracking-tighter">Running</span>
                                                </div>
                                            )}
                                            {!status?.isRunning && status?.lastRunStatus === 'error' && <span className="text-[10px] text-red-500">✕</span>}
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all ml-2 shrink-0">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleTriggerTask(task.id);
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-white/10 rounded-md transition-all"
                                            title="立即运行"
                                        >
                                            <Play size={14} className="fill-current" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteConfirmId(task.id);
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-white/10 rounded-md transition-all"
                                            title="删除任务"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
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
                        <header className="border-b border-slate-200 dark:border-white/5 px-6 h-12 flex items-center justify-between draggable shrink-0 bg-white dark:bg-[#09090b]">
                            <input
                                type="text"
                                value={editingTask.name}
                                onChange={e => setEditingTask({ ...editingTask, name: e.target.value })}
                                placeholder="任务名称..."
                                className="flex-1 bg-transparent border-none text-base font-bold focus:outline-none text-slate-800 dark:text-gray-100 placeholder:text-slate-300 dark:placeholder:text-gray-600 transition-colors nodrag"
                            />
                        </header>

                        <div className="flex-1 overflow-y-auto px-8 py-4 custom-scrollbar">
                            <div className="max-w-2xl mx-auto">
                                {!isCreating && (
                                    <div className="flex p-1 bg-slate-100 dark:bg-white/5 rounded-xl w-fit mb-3">
                                        <button
                                            onClick={() => setActiveTab('config')}
                                            className={clsx(
                                                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                                activeTab === 'config'
                                                    ? "bg-white dark:bg-[#18181b] text-slate-900 dark:text-white shadow-sm"
                                                    : "text-slate-500 hover:text-slate-700 dark:hover:text-gray-300"
                                            )}
                                        >
                                            配置
                                        </button>
                                        <button
                                            onClick={() => {
                                                setActiveTab('logs');
                                                if (editingTask) loadTaskLogs(editingTask.id);
                                            }}
                                            className={clsx(
                                                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                                activeTab === 'logs'
                                                    ? "bg-white dark:bg-[#18181b] text-slate-900 dark:text-white shadow-sm"
                                                    : "text-slate-500 hover:text-slate-700 dark:hover:text-gray-300"
                                            )}
                                        >
                                            历史
                                        </button>
                                    </div>
                                )}
                                {activeTab === 'config' ? (
                                    <div className="animate-in fade-in duration-300 pt-1 pb-16">
                                        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
                                            {/* 区域一：基本信息与指令 */}
                                            <div className="p-4 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2.5">
                                                        <FileText size={18} className="text-indigo-500" />
                                                        <h3 className="text-[13px] font-bold text-slate-800 dark:text-gray-100">基本信息与指令</h3>
                                                    </div>
                                                    {!isCreating && (
                                                        <div className="flex items-center gap-4">
                                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                                <span className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                                                                    {editingTask.enabled ? 'ACTIVE' : 'DISABLED'}
                                                                </span>
                                                                <Switch 
                                                                    size="sm"
                                                                    checked={editingTask.enabled}
                                                                    onChange={val => setEditingTask({ ...editingTask, enabled: val })}
                                                                />
                                                            </label>
                                                            <div className="w-px h-3 bg-slate-200 dark:bg-white/10" />
                                                            <button
                                                                onClick={() => handleTriggerTask(editingTask.id)}
                                                                className="px-2.5 py-1 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors text-[11px] font-bold flex items-center gap-1.5"
                                                            >
                                                                <Play size={14} className="fill-current" /> 立即运行
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-4">
                                                    <textarea
                                                        value={editingTask.prompt}
                                                        onChange={e => setEditingTask({ ...editingTask, prompt: e.target.value })}
                                                        placeholder="明确告诉 AI 需要完成什么任务..."
                                                        rows={4}
                                                        className="w-full p-4 bg-slate-50/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 focus:border-indigo-400 dark:focus:border-indigo-500/50 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-500/10 text-slate-800 dark:text-gray-100 placeholder:text-slate-400 transition-all resize-none"
                                                    />

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="p-3 bg-slate-50/80 dark:bg-white/[0.02] rounded-xl border border-slate-100 dark:border-white/5">
                                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editingTask.enableTools !== false}
                                                                    onChange={e => setEditingTask({ ...editingTask, enableTools: e.target.checked })}
                                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 dark:border-white/20 dark:bg-transparent"
                                                                />
                                                                <span className="text-xs font-medium text-slate-700 dark:text-gray-200">允许调用所有工具</span>
                                                            </label>
                                                        </div>

                                                        <div className="p-3 bg-slate-50/80 dark:bg-white/[0.02] rounded-xl border border-slate-100 dark:border-white/5">
                                                            <div className="flex flex-col gap-3">
                                                                <label className="flex items-center gap-3 cursor-pointer group">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editingTask.keepHistory || false}
                                                                        onChange={e => setEditingTask({ ...editingTask, keepHistory: e.target.checked })}
                                                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 dark:border-white/20 dark:bg-transparent"
                                                                    />
                                                                    <span className="text-xs font-medium text-slate-700 dark:text-gray-200">保留任务对话历史</span>
                                                                </label>
                                                                {editingTask.keepHistory && (
                                                                    <div className="pl-7 flex items-center gap-2">
                                                                        <span className="text-[10px] text-slate-500">轮次上限:</span>
                                                                        <input
                                                                            type="number"
                                                                            min={1}
                                                                            max={100}
                                                                            value={editingTask.maxHistoryTurns || 10}
                                                                            onChange={e => setEditingTask({ ...editingTask, maxHistoryTurns: parseInt(e.target.value) || 10 })}
                                                                            className="w-12 px-1.5 py-0.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded text-[10px] focus:outline-none"
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 区域二：调度规则 */}
                                            <div className="p-4 border-t border-slate-100 dark:border-white/5 space-y-4">
                                                <div className="flex items-center gap-2.5">
                                                    <Clock size={18} className="text-indigo-500" />
                                                    <h3 className="text-[13px] font-bold text-slate-800 dark:text-gray-100">调度规则</h3>
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
                                            
                                            {/* 区域三：通知配置 */}
                                            <div className="p-4 border-t border-slate-100 dark:border-white/5 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2.5">
                                                        <Bell size={18} className="text-indigo-500" />
                                                        <h3 className="text-[13px] font-bold text-slate-800 dark:text-gray-100">结果通知 (IM)</h3>
                                                    </div>
                                                    <Switch 
                                                        size="sm"
                                                        checked={editingTask.notification?.enabled || false}
                                                        onChange={val => setEditingTask({
                                                            ...editingTask,
                                                            notification: {
                                                                ...(editingTask.notification || { imSessionId: '' }),
                                                                enabled: val
                                                            }
                                                        })}
                                                    />
                                                </div>

                                                {editingTask.notification?.enabled && (
                                                    <div className="animate-in slide-in-from-top-1 duration-200">
                                                        <input 
                                                            type="text" 
                                                            value={editingTask.notification.imSessionId}
                                                            onChange={e => setEditingTask({
                                                                ...editingTask,
                                                                notification: { ...editingTask.notification!, imSessionId: e.target.value }
                                                            })}
                                                            placeholder="Session ID (例如: tg_12345678)..."
                                                            className="w-full bg-slate-50/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all text-slate-700 dark:text-gray-200"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="pt-6 flex justify-end gap-3">
                                            {isCreating && (
                                                <button
                                                    onClick={handleCancelCreating}
                                                    className="px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                                                >
                                                    取消
                                                </button>
                                            )}
                                            <button
                                                onClick={handleSaveTask}
                                                disabled={isSaving || !editingTask.name.trim() || !editingTask.prompt.trim() || (cronValidation !== null && !cronValidation.valid)}
                                                className={clsx(
                                                    "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-sm min-w-[120px] justify-center",
                                                    saved 
                                                        ? "bg-green-500 text-white" 
                                                        : "bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 text-white dark:text-black",
                                                    "disabled:bg-slate-200 dark:disabled:bg-white/10"
                                                )}
                                            >
                                                {isSaving ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : saved ? (
                                                    <CheckCircle2 size={16} />
                                                ) : (
                                                    <Save size={16} />
                                                )}
                                                {isSaving ? '保存中...' : saved ? '已保存' : (isCreating ? '创建任务' : '保存修改')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in duration-300 pt-1">
                                        {/* 执行历史卡片 */}
                                        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-sm space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">执行历史</h3>
                                                    {selectedLogIds.size > 0 && (
                                                        <span className="text-xs text-slate-500 dark:text-gray-400">
                                                            已选 {selectedLogIds.size} 条
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {selectedLogIds.size > 0 && (
                                                        <button
                                                            onClick={handleDeleteSelectedLogs}
                                                            className="px-3 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 rounded-md text-xs font-semibold transition-colors text-red-600 dark:text-red-400 flex items-center gap-1.5"
                                                        >
                                                            <Trash2 size={12} /> 删除选中
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => loadTaskLogs(editingTask.id)}
                                                        className="px-3 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 rounded-md text-xs font-semibold transition-colors text-slate-600 dark:text-gray-300 flex items-center gap-1.5"
                                                    >
                                                        <History size={12} /> 刷新
                                                    </button>
                                                    <button
                                                        onClick={handleDeleteAllLogs}
                                                        className="px-3 py-1 bg-slate-50 hover:bg-red-100 dark:bg-white/5 dark:hover:bg-red-500/20 rounded-md text-xs font-semibold transition-colors text-slate-600 hover:text-red-600 dark:text-gray-300 dark:hover:text-red-400 flex items-center gap-1.5"
                                                    >
                                                        <Trash2 size={12} /> 清空
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
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
                                                    const allSelected = selectedLogIds.size === logs.length && logs.length > 0;
                                                    return (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2 px-1">
                                                                <button
                                                                    onClick={toggleAllLogs}
                                                                    className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-gray-300"
                                                                    title={allSelected ? "取消全选" : "全选"}
                                                                >
                                                                    {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                                                </button>
                                                                <span className="text-xs text-slate-400 dark:text-gray-500">
                                                                    {allSelected ? "取消全选" : "全选"}
                                                                </span>
                                                            </div>
                                                            {logs.map(log => (
                                                                <LogEntry
                                                                    key={log.id}
                                                                    log={log}
                                                                    selected={selectedLogIds.has(log.id)}
                                                                    onToggleSelect={() => toggleLogSelection(log.id)}
                                                                    onDelete={() => handleDeleteLog(log.id)}
                                                                />
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
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
function MarkdownCode({ node, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '')
    const codeString = String(children).replace(/\n$/, '')
    const theme = useSettingsStore(s => s.settings.theme);
    const syntaxTheme = theme === 'dark' ? vscDarkPlus : oneLight;
    const isBlock = !!className || codeString.includes('\n');

    return isBlock && match ? (
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
interface LogEntryProps {
    log: TaskLogEntry;
    selected: boolean;
    onToggleSelect: () => void;
    onDelete: () => void;
}

function LogEntry({ log, selected, onToggleSelect, onDelete }: LogEntryProps) {
    const [expanded, setExpanded] = useState(false);
    const isSuccess = log.status === 'success';

    return (
        <div className={clsx(
            "border rounded-lg overflow-hidden transition-all bg-white dark:bg-white/[0.02]",
            selected ? "border-indigo-300 dark:border-indigo-500/50" : "border-slate-200 dark:border-white/10"
        )}>
            <div
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 group"
                onClick={() => setExpanded(!expanded)}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelect();
                    }}
                    className="shrink-0 p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-gray-300"
                >
                    {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
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
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="shrink-0 p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors text-slate-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100"
                    title="删除"
                >
                    <Trash2 size={14} />
                </button>
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
                {validation && !validation.valid && (
                    <div className="pt-4 mt-2 border-t border-slate-200/60 dark:border-white/5">
                        <div className="text-xs text-red-500">
                            <span className="flex items-center gap-1.5 font-medium">
                                <AlertCircle size={14} /> 无效表达式: {validation.error}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
