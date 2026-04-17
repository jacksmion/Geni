import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Plus, Trash2, Play, Save, CheckCircle2, AlertCircle, History, Search, Bell, CheckSquare, Square, ArrowLeft, ChevronDown } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLayoutStore } from '../store/useLayoutStore';
import { useModalStore } from '../store/useModalStore';
import { Switch } from '../components/Switch';
import { ScheduledTaskConfig } from '../../common/types/settings';
import { clsx } from 'clsx';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
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
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editingTask, setEditingTask] = useState<ScheduledTaskConfig | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const [cronValidation, setCronValidation] = useState<{ valid: boolean; error?: string; nextRuns?: string[] } | null>(null);
    const [statuses, setStatuses] = useState<TaskStatusInfo[]>([]);
    const [triggerResult, setTriggerResult] = useState<{ taskId: string; message: string; success: boolean } | null>(null);
    const [taskLogs, setTaskLogs] = useState<Map<string, TaskLogEntry[]>>(new Map());
    const [loadingLogs, setLoadingLogs] = useState<string | null>(null);
    const [editorTab, setEditorTab] = useState<'config' | 'logs'>('config');
    const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
    const showConfirm = useModalStore(s => s.showConfirm);

    const filteredTasks = useMemo(() =>
        tasks.filter(t =>
            t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.id.toLowerCase().includes(searchTerm.toLowerCase())
        ), [tasks, searchTerm]);

    // 响应 CommandPalette 的"新建计划"命令
    const pendingCreatePlan = useLayoutStore(s => s.pendingCreatePlan);
    useEffect(() => {
        if (pendingCreatePlan) {
            useLayoutStore.getState().setPendingCreatePlan(false);
            handleAddTask();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingCreatePlan]);

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

    // When editingTaskId changes (user clicks a card), load that task
    useEffect(() => {
        if (editingTaskId && !isCreating) {
            const task = tasks.find(t => t.id === editingTaskId);
            if (task) {
                setEditingTask({ ...task });
                validateCron(task.cronExpression);
            }
        }
    }, [editingTaskId, isCreating, tasks, validateCron]);

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
        if (editorTab === 'logs' && editingTaskId) {
            loadTaskLogs(editingTaskId);
            // 设置定期刷新
            const interval = setInterval(() => loadTaskLogs(editingTaskId), 10000);
            return () => clearInterval(interval);
        }
        // 切换tab时清空选中状态
        if (editorTab === 'config') {
            setSelectedLogIds(new Set());
        }
    }, [editorTab, editingTaskId]);

    // 切换任务时清空选中状态
    useEffect(() => {
        setSelectedLogIds(new Set());
    }, [editingTaskId]);

    const saveTasks = async (updatedTasks: ScheduledTaskConfig[]) => {
        await updateSettings({ scheduledTasks: updatedTasks });
    };

    const handleAddTask = () => {
        setEditingTaskId(null);
        setIsCreating(true);
        const newTask = createEmptyTask();
        setEditingTask(newTask);
        setCronValidation(null);
        validateCron(newTask.cronExpression);
        setEditorTab('config');
    };

    const handleCancelCreating = () => {
        setIsCreating(false);
        setEditingTask(null);
        setEditingTaskId(null);
    };

    const handleSaveTask = async () => {
        if (!editingTask) return;
        if (!editingTask.name.trim() || !editingTask.prompt.trim()) return;

        let updatedTasks: ScheduledTaskConfig[];
        if (isCreating) {
            updatedTasks = [...tasks, editingTask];
        } else {
            const existingIndex = tasks.findIndex(t => t.id === editingTask.id);
            if (existingIndex < 0) return;
            updatedTasks = [...tasks];
            updatedTasks[existingIndex] = editingTask;
        }

        // Return to list first, then persist in background
        handleBackToList();
        try {
            await saveTasks(updatedTasks);
        } catch (e) {
            console.error('Failed to save task:', e);
        }
    };

    const confirmDeleteTask = (taskId: string) => {
        showConfirm({
            message: '确定要删除这个定时计划吗？此操作无法撤销。',
            confirmText: '确认删除',
            cancelText: '取消',
            onConfirm: async () => {
                try {
                    const updatedTasks = tasks.filter(t => t.id !== taskId);
                    await saveTasks(updatedTasks);
                    handleBackToList();
                } catch (e) {
                    console.error('Failed to delete task:', e);
                }
            }
        });
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
        setEditorTab('logs');
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

    const handleBackToList = () => {
        setEditingTaskId(null);
        setEditingTask(null);
        setIsCreating(false);
        setEditorTab('config');
    };

    // ─── Editor view (editing an existing task or creating a new one) ───
    if (editingTask && (editingTaskId || isCreating)) {
        return (
            <div className="flex h-full flex-col">
                {/* Draggable Header */}
                <header className="relative z-50 shrink-0 bg-white dark:bg-[#141414] draggable">
                    <div className="flex items-center justify-between px-4 h-12">
                        <button onClick={handleBackToList} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors">
                            <ArrowLeft size={16} /> 返回
                        </button>
                        <div className="w-32" />
                    </div>
                    {/* Tab Bar */}
                    {!isCreating && (
                        <div className="flex px-4 gap-1 border-b border-slate-100 dark:border-white/5">
                            {(['config', 'logs'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setEditorTab(tab);
                                        if (tab === 'logs' && editingTask) loadTaskLogs(editingTask.id);
                                    }}
                                    className={clsx(
                                        "px-4 py-2 text-xs font-medium transition-colors relative",
                                        editorTab === tab
                                            ? "text-indigo-600 dark:text-indigo-400"
                                            : "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                                    )}
                                >
                                    {tab === 'config' ? '配置' : '历史记录'}
                                    {editorTab === tab && (
                                        <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-indigo-500 dark:bg-indigo-400 rounded-full" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </header>

                <div className="flex-1 overflow-y-auto px-8 py-6 max-w-2xl mx-auto w-full">
                    {editorTab === 'config' || isCreating ? (
                        /* ─── Tab: 配置 ─── */
                        <div className="space-y-6">
                            {/* Name + Enable */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-sm font-medium">计划名称</label>
                                    {!isCreating && (
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <span className="text-xs text-slate-500 dark:text-zinc-400">{editingTask.enabled ? '已启用' : '已停用'}</span>
                                            <Switch
                                                size="sm"
                                                checked={editingTask.enabled}
                                                onChange={val => setEditingTask({ ...editingTask, enabled: val })}
                                            />
                                        </label>
                                    )}
                                </div>
                                <input
                                    value={editingTask.name}
                                    onChange={e => setEditingTask({ ...editingTask, name: e.target.value })}
                                    placeholder="输入计划名称..."
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                />
                            </div>

                            {/* Prompt */}
                            <div>
                                <label className="block text-sm font-medium mb-1.5">任务指令</label>
                                <textarea
                                    value={editingTask.prompt}
                                    onChange={e => setEditingTask({ ...editingTask, prompt: e.target.value })}
                                    placeholder="明确告诉 AI 需要完成什么任务..."
                                    rows={5}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-none font-mono"
                                />
                            </div>

                            {/* Cron */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Clock size={16} className="text-indigo-500" />
                                    <label className="text-sm font-medium">调度规则</label>
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

                            {/* Notification */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Bell size={16} className="text-indigo-500" />
                                        <label className="text-sm font-medium">结果通知 (IM)</label>
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
                                    <input
                                        type="text"
                                        value={editingTask.notification.imSessionId}
                                        onChange={e => setEditingTask({
                                            ...editingTask,
                                            notification: { ...editingTask.notification!, imSessionId: e.target.value }
                                        })}
                                        placeholder="Session ID (例如: tg_12345678)..."
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        /* ─── Tab: 历史记录 ─── */
                        <div className="space-y-4">
                            {/* 执行历史 */}
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
                    )}
                </div>

                {/* Fixed Bottom Bar */}
                <div className="shrink-0 px-8 py-3 border-t border-slate-100 dark:border-white/5 bg-white dark:bg-[#141414]">
                    <div className="flex items-center gap-3 max-w-2xl mx-auto">
                        <button
                            onClick={handleSaveTask}
                            disabled={!editingTask.name.trim() || !editingTask.prompt.trim() || (cronValidation !== null && !cronValidation.valid)}
                            className="px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Save size={16} />
                            {isCreating ? '创建计划' : '保存'}
                        </button>
                        <button onClick={handleBackToList} className="px-5 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                            取消
                        </button>
                        {!isCreating && (
                            <button onClick={() => confirmDeleteTask(editingTask.id)} className="ml-auto p-2 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ─── List view (card grid) ───
    return (
        <div className="flex h-full flex-col">
            {/* Draggable Header */}
            <header className="relative z-50 shrink-0 bg-white dark:bg-[#141414] backdrop-blur-xl draggable">
                <div className="px-4 py-4 max-w-5xl mx-auto">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-base font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                            自动化
                        </h1>
                        <div className="w-32" />
                    </div>
                    {/* 搜索栏 + 操作按钮 */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                            <input
                                type="text"
                                placeholder="搜索计划..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 dark:focus:border-indigo-500/30 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-gray-600"
                            />
                        </div>
                        <button
                            onClick={handleAddTask}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-all shrink-0"
                        >
                            <Plus size={12} />
                            新建计划
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-4 max-w-5xl mx-auto">
                    {filteredTasks.length === 0 ? (
                        <div className="text-center py-20">
                            <Clock size={48} className="mx-auto mb-4 text-slate-300 dark:text-zinc-600" />
                            <h3 className="text-lg font-medium mb-2">{searchTerm ? '无匹配结果' : '暂无计划'}</h3>
                            <p className="text-sm text-slate-400 dark:text-zinc-500 max-w-md mx-auto">{searchTerm ? '尝试其他关键词' : '点击右上角"新建计划"创建你的第一个定时任务'}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
                            {filteredTasks.map(task => {
                                const status = getStatus(task.id);
                                return (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        status={status}
                                        onClick={() => {
                                            setIsCreating(false);
                                            setEditingTaskId(task.id);
                                        }}
                                        onTrigger={() => handleTriggerTask(task.id)}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============ TaskCard 子组件 ============
function TaskCard({ task, status, onClick, onTrigger }: {
    task: ScheduledTaskConfig;
    status: TaskStatusInfo | undefined;
    onClick: () => void;
    onTrigger: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="relative w-full h-full text-left p-5 rounded-xl bg-white dark:bg-white/[0.02] hover:bg-[#F5F5F7] dark:hover:bg-white/[0.04] transition-all duration-200 group flex flex-col"
        >
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-700/60 flex items-center justify-center shrink-0">
                    <Clock size={18} className="text-slate-500 dark:text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {task.name || '未命名'}
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                        {getCronHumanSummary(task.cronExpression)}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
                <div className={clsx("w-1.5 h-1.5 rounded-full shrink-0", task.enabled ? "bg-green-500" : "bg-slate-300 dark:bg-gray-600")} />
                <span className="text-[11px] text-slate-400 dark:text-gray-500 font-medium">
                    {task.enabled ? '已启用' : '已停用'}
                </span>
                {status?.isRunning && (
                    <div className="flex items-center gap-1 shrink-0">
                        <span className="w-1 h-1 bg-amber-500 rounded-full animate-ping" />
                        <span className="text-[9px] text-amber-500/80 font-bold uppercase tracking-tighter">Running</span>
                    </div>
                )}
                {!status?.isRunning && status?.lastRunStatus === 'error' && (
                    <span className="text-[10px] text-red-500">Error</span>
                )}
            </div>

            {/* Hover action: trigger */}
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onTrigger(); }}
                    onKeyDown={e => { if (e.key === 'Enter') onTrigger(); }}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-xs bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                    title="立即运行"
                >
                    <Play size={13} className="fill-current" />
                </span>
            </div>
        </button>
    );
}

export default SchedulerPage;

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
                    <ChevronDown size={16} />
                </div>
            </div>

            {expanded && (log.output || log.error) && (
                <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-white/5 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {log.error ? (
                        <pre className="text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap word-break">
                            {log.error}
                        </pre>
                    ) : log.output ? (
                        <MarkdownRenderer
                            content={preprocessMarkdown(log.output)}
                            className="prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
                                prose-headings:text-slate-950 dark:prose-headings:text-white
                                prose-h1:text-lg prose-h1:mt-4 prose-h1:mb-2
                                prose-h2:text-base prose-h2:mt-3 prose-h2:mb-1.5
                                prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-1
                                prose-ul:my-2 prose-ul:pl-5 prose-ul:text-[13px]
                                prose-ol:my-2 prose-ol:pl-5 prose-ol:text-[13px]
                                prose-li:my-0.5
                                prose-code:text-xs prose-code:font-mono prose-code:px-1"
                        />
                    ) : null}
                </div>
            )}
        </div>
    );
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
