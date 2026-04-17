import React, { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Check, Terminal, FileText, Search, Code2, Wrench, ShieldAlert, ListChecks, Circle, RotateCw, Clock, X, ChevronDown, ChevronRight } from 'lucide-react';

import { extractPathAndContent } from '../utils/artifact';
import { useChatStore } from '../store/useChatStore';
import { cn } from '../utils/cn';

interface ThoughtStep {
    thought?: string;
    tool?: string;
    toolInput?: string;
    observation?: string;
    streamingObservation?: string;
    isComplete?: boolean;
    duration?: number;
    authRequestId?: string;
    isWaitingAuthorization?: boolean;
    authReason?: string;
    isError?: boolean;
}

interface ThoughtTraceProps {
    steps: ThoughtStep[];
    contextContent?: string;
}

// Tool icon mapping
const getToolIcon = (toolName: string) => {
    const lower = toolName?.toLowerCase() || '';
    if (lower.includes('bash') || lower.includes('command')) return Terminal;
    if (lower.includes('file') || lower.includes('fs') || lower.includes('edit')) return FileText;
    if (lower.includes('search')) return Search;
    if (lower.includes('code') || lower.includes('python')) return Code2;
    if (lower.includes('todo')) return ListChecks;
    return Wrench;
};

// Truncate path: keep tail for long paths
const truncatePath = (p: string, max = 50): string =>
    p.length > max ? '...' + p.slice(-max) : p;

// Truncate generic string
const truncateStr = (s: string, max = 50): string =>
    s.length > max ? s.slice(0, max) + '...' : s;

// ─── Todo Card Component ────────────────────────────────────────────

interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority?: 'high' | 'medium' | 'low';
}

/** Parse the formatted todo output from the backend into TodoItem[] */
function parseTodoOutput(text: string): { items: TodoItem[]; completed: number; total: number; pct: number } | null {
    if (!text || text === 'No todos found.') return null;

    const lines = text.split('\n').filter(l => l.trim());
    const items: TodoItem[] = [];
    let completed = 0;
    let total = 0;
    let pct = 0;

    for (const line of lines) {
        // Parse progress header: "Progress: 2/5 (40%)"
        const progressMatch = line.match(/Progress:\s*(\d+)\/(\d+)\s*\((\d+)%\)/);
        if (progressMatch) {
            completed = parseInt(progressMatch[1]);
            total = parseInt(progressMatch[2]);
            pct = parseInt(progressMatch[3]);
            continue;
        }

        // Parse todo items: "✅ content [high]" or "🔄 content" or "⬜ content"
        const itemMatch = line.match(/^(✅|🔄|⬜)\s+(.+?)(?:\s+\[(high|medium|low)\])?$/);
        if (itemMatch) {
            const statusMap: Record<string, TodoItem['status']> = { '✅': 'completed', '🔄': 'in_progress', '⬜': 'pending' };
            items.push({
                content: itemMatch[2],
                status: statusMap[itemMatch[1]] || 'pending',
                priority: itemMatch[3] as TodoItem['priority'] | undefined
            });
        }
    }

    if (items.length === 0) return null;
    return { items, completed, total, pct };
}

const TodoCard = React.memo(function TodoCard({ observation }: { observation: string }) {
    const parsed = useMemo(() => parseTodoOutput(observation), [observation]);
    if (!parsed) return null;

    const { items, completed, total, pct } = parsed;

    return (
        <div className="mt-2 rounded-xl border border-indigo-200/60 dark:border-indigo-500/15 bg-white dark:bg-white/[0.02] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50/50 dark:bg-indigo-500/5 border-b border-indigo-100/60 dark:border-indigo-500/10">
                <div className="flex items-center gap-2">
                    <ListChecks size={14} className="text-indigo-500 dark:text-indigo-400" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200">Task Progress</span>
                </div>
                <span className="text-[11px] font-mono font-medium text-indigo-600 dark:text-indigo-400">
                    {completed}/{total}
                </span>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-slate-100 dark:bg-white/5">
                <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                />
            </div>

            {/* Items */}
            <div className="px-4 py-2.5 space-y-1.5">
                {items.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 py-0.5">
                        {/* Status icon */}
                        <div className="mt-0.5 shrink-0">
                            {item.status === 'completed' && (
                                <CheckCircle2 size={14} className="text-emerald-500" />
                            )}
                            {item.status === 'in_progress' && (
                                <RotateCw size={14} className="text-amber-500 animate-spin" style={{ animationDuration: '2s' }} />
                            )}
                            {item.status === 'pending' && (
                                <Circle size={14} className="text-slate-300 dark:text-zinc-600" />
                            )}
                        </div>

                        {/* Content */}
                        <span className={cn(
                            "text-xs leading-relaxed",
                            item.status === 'completed'
                                ? "text-slate-400 dark:text-zinc-500 line-through"
                                : item.status === 'in_progress'
                                    ? "text-slate-700 dark:text-zinc-200 font-medium"
                                    : "text-slate-600 dark:text-zinc-400"
                        )}>
                            {item.content}
                        </span>

                        {/* Priority badge */}
                        {item.priority && (
                            <span className={cn(
                                "ml-auto shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full",
                                item.priority === 'high' && "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400",
                                item.priority === 'medium' && "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
                                item.priority === 'low' && "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-zinc-500"
                            )}>
                                {item.priority}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
});

// ─── Inline Authorization UI Component ──────────────────────────────


interface InlineAuthorizationUIProps {
    reason?: string;
    onAuthorize: (approved: boolean, remember?: boolean) => void;
}

const InlineAuthorizationUI = React.memo(function InlineAuthorizationUI({ reason, onAuthorize }: InlineAuthorizationUIProps) {
    // Keyboard shortcuts: Enter to approve, Esc to deny
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Don't intercept if user is typing in an input field
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.key === 'Enter') {
                e.preventDefault();
                onAuthorize(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onAuthorize(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onAuthorize]);

    return (
        <div className="pl-[19px] mt-2 pr-1">
            <div className="px-3 py-2.5 bg-amber-50 dark:bg-amber-500/5 border border-amber-500/20 dark:border-amber-500/10 rounded-lg space-y-2">
                <div className="flex gap-2 items-start">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-200/80 leading-relaxed font-medium">
                        {reason || '此工具涉及敏感操作，确认允许即可执行。'}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1 border-t border-amber-500/10 mt-1">
                    <button
                        onClick={() => onAuthorize(false)}
                        className="flex items-center gap-1 px-3 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 rounded text-[11px] font-medium hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:border-red-500/20 transition-all"
                    >
                        <X className="w-3 h-3" />
                        拒绝
                        <kbd className="ml-0.5 text-[9px] text-slate-400 dark:text-zinc-600 font-normal">Esc</kbd>
                    </button>
                    <button
                        onClick={() => onAuthorize(true, true)}
                        className="flex items-center gap-1 px-3 py-1 bg-white dark:bg-zinc-800 border border-amber-200/50 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 rounded text-[11px] font-medium hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all"
                    >
                        <Clock className="w-3 h-3" />
                        允许并记住 (1h)
                    </button>
                    <button
                        onClick={() => onAuthorize(true)}
                        className="flex items-center gap-1 px-3.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-semibold shadow-sm shadow-amber-500/20 transition-all active:scale-95"
                    >
                        <Check className="w-3 h-3" />
                        确认允许
                        <kbd className="ml-0.5 text-[9px] text-white/60 font-normal">↵</kbd>
                    </button>
                </div>
            </div>
        </div>
    );
});

function getCleanToolName(tool: string) {
    if (!tool) return 'Unknown';
    let name = tool;
    if (name.includes('__')) name = name.split('__').pop() || name;
    if (name.includes('/')) name = name.split('/').pop() || name;
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatInputInline(tool: string, input: string | undefined, parsedInput: Record<string, unknown> | null) {
    if (!input) return '';

    const lower = tool.toLowerCase();
    if (parsedInput) {
        if (lower.includes('bash') || lower.includes('command')) {
            const cmd = parsedInput.command || parsedInput.cmd || '';
            return typeof cmd === 'string' && cmd.length > 80 ? cmd.slice(0, 80) + '...' : String(cmd);
        }
        if (lower === 'list') {
            return String(parsedInput.path || '');
        }
        if (lower === 'load_skill') {
            return String(parsedInput.skill_id || parsedInput.skillId || '');
        }
        if (lower === 'glob') {
            const pattern = String(parsedInput.pattern || parsedInput.glob || '');
            const dir = String(parsedInput.path || '');
            if (pattern && dir) return `${pattern}  ${truncatePath(dir, 30)}`;
            return pattern || dir;
        }
        if (lower === 'grep') {
            const query = String(parsedInput.pattern || parsedInput.query || '');
            const include = String(parsedInput.include || '');
            if (query && include) return `"${truncateStr(query, 30)}" in ${include}`;
            if (query) return `"${truncateStr(query, 40)}"`;
            return include ? `in ${include}` : '';
        }
        if (lower.includes('file') || lower.includes('write') || lower.includes('read') || lower.includes('edit')) {
            return String(parsedInput.path || parsedInput.file_path || parsedInput.target_file || '');
        }
        const str = JSON.stringify(parsedInput);
        return str.length > 50 ? str.slice(0, 50) + '...' : str;
    }

    if (lower.includes('bash') || lower.includes('command')) {
        const cmdMatch = input.match(/"(?:command|cmd)"\s*:\s*"([^"]*)/);
        if (cmdMatch) {
            const cmd = cmdMatch[1];
            return cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd;
        }
    }
    if (lower.includes('file') || lower.includes('write') || lower.includes('read') || lower.includes('edit')) {
        const pathMatch = input.match(/"(?:path|file_path|target_file)"\s*:\s*"([^"]*)/);
        if (pathMatch) return pathMatch[1];
    }
    const clean = input.replace(/\\n/g, ' ').replace(/\\"/g, '"');
    return clean.length > 50 ? clean.slice(0, 50) + '...' : clean;
}

function formatOutputLines(output: string) {
    const truncatedOutput = output.length > 50000
        ? output.slice(0, 50000) + '\n\n... (truncated for UI performance)'
        : output;

    return truncatedOutput.split('\n').map((line, i) => {
        if (line.startsWith('+')) {
            return <span key={i} className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 block -mx-3 px-3">{line}</span>;
        }
        if (line.startsWith('-')) {
            return <span key={i} className="text-red-500 dark:text-red-400 bg-red-500/10 block -mx-3 px-3">{line}</span>;
        }
        if (line.match(/^Error:/i) || line.match(/failed/i) || line.match(/denied/i)) {
            return <span key={i} className="text-red-500 dark:text-red-400 font-semibold block">{line}</span>;
        }
        return <span key={i} className="block">{line}</span>;
    });
}

// Tool Call Card Component
const ToolCallCard = React.memo(function ToolCallCard({ step, isLast }: { step: ThoughtStep; isLast?: boolean }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const parsedToolInput = useMemo<Record<string, unknown> | null>(() => {
        if (!step.toolInput) return null;
        try {
            return JSON.parse(step.toolInput) as Record<string, unknown>;
        } catch {
            return null;
        }
    }, [step.toolInput]);

    const isTodoTool = step.tool === 'todowrite' || step.tool === 'todoread';
    const isArtifactTool = step.tool === 'write' || step.tool === 'edit' || step.tool === 'read' || step.tool === 'bash';
    const outputText = step.observation || step.streamingObservation || '';
    const displayName = useMemo(() => getCleanToolName(step.tool || ''), [step.tool]);
    const inlineInput = useMemo(
        () => formatInputInline(step.tool || '', step.toolInput, parsedToolInput),
        [parsedToolInput, step.tool, step.toolInput]
    );
    const outLines = useMemo(() => (outputText ? outputText.split('\n').length : 0), [outputText]);
    const outStats = useMemo(() => {
        if (step.isWaitingAuthorization) return '等待授权...';

        const lowerTool = step.tool?.toLowerCase() || '';
        const isWrite = lowerTool.includes('write') || lowerTool.includes('edit');
        const isBash = lowerTool.includes('bash') || lowerTool.includes('command');
        const isRead = lowerTool.includes('read');

        if (step.isComplete) {
            if (step.isError) return '执行失败 (格式错误/被截断)';
            if (isWrite) return '写入 / 修改完成';
            if (isBash) return '执行结束';
            if (isRead) return `读取完成 (${outLines} 行)`;
            return `输出 ${outLines} 行`;
        }

        if (step.streamingObservation || step.toolInput) {
            if (isWrite) return '写入中...';
            if (isBash) return '执行中...';
            if (isRead) return '读取中...';
            return `运行中... (${outLines > 0 ? outLines + '行' : ''})`;
        }

        return '准备运行...';
    }, [outLines, step.isComplete, step.isError, step.isWaitingAuthorization, step.streamingObservation, step.tool, step.toolInput]);
    const formattedDuration = useMemo(() => (
        step.duration == null ? null : (step.duration >= 1000 ? `${(step.duration / 1000).toFixed(1)}s` : `${step.duration}ms`)
    ), [step.duration]);
    const formattedToolInput = useMemo(() => {
        if (!step.toolInput) return null;
        if (!parsedToolInput) return step.toolInput;

        return Object.entries(parsedToolInput).map(([key, val], i) => (
            <div key={i}>
                <span className="text-slate-400 dark:text-zinc-500">{key}</span>
                <span className="text-slate-300 dark:text-zinc-600 mx-1">=</span>
                <span className="text-slate-700 dark:text-zinc-300">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
            </div>
        ));
    }, [parsedToolInput, step.toolInput]);
    const renderedOutputLines = useMemo(() => formatOutputLines(outputText), [outputText]);

    const handleCopy = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const textToCopy = step.observation || step.toolInput || '';
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [step.observation, step.toolInput]);

    const handleAuthorization = useCallback((approved: boolean, remember: boolean = false) => {
        if (step.authRequestId) {
            const activeSessionId = useChatStore.getState().activeSessionId;
            const runState = activeSessionId ? useChatStore.getState().runningSessions.get(activeSessionId) : undefined;
            const activeRunId = runState?.runId ?? null;
            window.electronAPI.agent.respondToAuthorization({
                requestId: step.authRequestId,
                runId: activeRunId || undefined,
                approved,
                remember
            });
        }
    }, [step.authRequestId]);

    const handleOpenArtifact = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!step.toolInput && !step.observation) return;

        let path: string;
        let content: string;

        if (step.tool === 'bash') {
            let cmd = '> bash';
            try {
                const parsed = JSON.parse(step.toolInput || '{}');
                if (parsed.command || parsed.cmd) cmd = '> ' + (parsed.command || parsed.cmd);
            } catch {
                const cmdMatch = (step.toolInput || '').match(/"(?:command|cmd)"\s*:\s*"([^"]*)/);
                if (cmdMatch) cmd = '> ' + cmdMatch[1];
            }
            path = cmd;
            content = step.observation || step.streamingObservation || 'Running...';
        } else {
            const extracted = extractPathAndContent(step.toolInput || '{}', step.tool);
            path = extracted.path;

            if (step.tool === 'read') {
                // For read tools, the content is in the observation (output)
                content = step.observation || '';
            } else {
                // For write/edit tools, the content is extracted from the toolInput via shared utility
                content = extracted.content;
            }
        }

        useChatStore.getState().setActiveArtifact({
            toolName: step.tool!,
            path: path || '...',
            kind: 'text',
            content: content
        });
    }, [step.observation, step.streamingObservation, step.tool, step.toolInput]);

    // ─── Compact single-line view for completed steps ───
    if (step.isComplete && !isExpanded && !isTodoTool) {
        return (
            <div className="relative font-mono pl-4">
                {/* Timeline Connecting Line */}
                {!isLast && (
                    <div className="absolute left-[12px] top-[16px] bottom-[-4px] w-px bg-slate-200/50 dark:bg-zinc-800/50 z-0" />
                )}
                <div
                    className={cn(
                        "relative z-10 flex items-center gap-2 py-0.5 cursor-pointer group/compact",
                        "hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors rounded-md -mx-2 px-2",
                        isArtifactTool && "hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5"
                    )}
                    onClick={(e) => {
                        if (isArtifactTool) {
                            handleOpenArtifact(e);
                        } else {
                            setIsExpanded(true);
                        }
                    }}
                >
                    {/* Status dot */}
                    {step.isError ? (
                        <X size={11} className="shrink-0 text-red-400" strokeWidth={2.5} />
                    ) : (
                        <CheckCircle2 size={11} className="shrink-0 text-emerald-400" strokeWidth={2.5} />
                    )}

                    {/* Key info (path / command) */}
                    {inlineInput && (
                        <span className="min-w-0 truncate text-[11.5px] font-medium text-slate-700 dark:text-zinc-300">
                            {inlineInput}
                        </span>
                    )}
                    {!inlineInput && (
                        <span className="min-w-0 truncate text-[11.5px] font-medium text-slate-700 dark:text-zinc-300">
                            {displayName}
                        </span>
                    )}

                    {/* Tool name */}
                    <span className="shrink-0 rounded-sm bg-slate-100 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-zinc-500">
                        {displayName}
                    </span>

                    {/* Duration */}
                    {formattedDuration && (
                        <span className="ml-auto shrink-0 text-[10px] text-slate-300/80 dark:text-zinc-700 tabular-nums">
                            {formattedDuration}
                        </span>
                    )}

                    {/* Hover hint */}
                    <span className="opacity-0 group-hover/compact:opacity-100 text-[10px] text-slate-300 dark:text-zinc-600 transition-opacity shrink-0">
                        {isArtifactTool ? '↗' : '···'}
                    </span>
                </div>
            </div>
        );
    }

    // ─── Full card view (running / expanded / todo) ───
    return (
        <div className="relative font-mono my-1 pl-1.5">
            {/* Timeline Connecting Line */}
            {!isLast && (
                <div className="absolute left-[14px] top-[24px] bottom-[-14px] w-px bg-slate-200/60 dark:bg-zinc-800/60 z-0" />
            )}

            {/* Inline Header */}
            <div
                className={cn(
                    "relative z-10 flex items-start gap-2.5",
                    !isTodoTool && "cursor-pointer group/card hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors rounded -mx-2 px-2 py-1"
                )}
                onClick={(e) => {
                    if (isTodoTool) return;
                    if (isArtifactTool) {
                        handleOpenArtifact(e);
                    } else {
                        setIsExpanded(!isExpanded);
                    }
                }}
            >
                {/* Icon Indicator */}
                <div className={cn(
                    "mt-[2px] w-[18px] h-[18px] flex items-center justify-center rounded-md shrink-0 border shadow-sm",
                    step.isError
                        ? "bg-red-50 border-red-200/50 text-red-500 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400"
                        : step.isComplete
                            ? "bg-emerald-50 border-emerald-200/50 text-emerald-500 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400"
                            : step.isWaitingAuthorization
                                ? "bg-amber-50 border-amber-200/50 text-amber-500 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400 animate-pulse"
                                : "bg-indigo-50 border-indigo-200/50 text-indigo-500 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400 animate-pulse"
                )}>
                    {React.createElement(getToolIcon(step.tool || ''), {
                        className: "w-2.5 h-2.5",
                        strokeWidth: 2.5
                    })}
                </div>

                {/* Content Container */}
                <div className="flex-1 min-w-0 flex flex-col pt-[1px]">
                    {/* Top line: Tool + Input */}
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-0.5 leading-[1.4] pr-2">
                            <span className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 tracking-tight">
                                {displayName}
                            </span>
                            {inlineInput && (
                                <span className="text-[12.5px] text-slate-400 dark:text-zinc-500 break-all select-text font-normal pt-0.5 line-clamp-2">
                                    {inlineInput}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Bottom line: Stats */}
                    <div className="flex items-center gap-2 mt-0.5 opacity-80">
                        <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                            {outStats}
                        </span>
                        {step.isComplete && step.duration != null && (
                            <span className="text-[11px] text-slate-400/80 dark:text-zinc-600/90">
                                · {step.duration}ms
                            </span>
                        )}
                        {!isTodoTool && (
                            <span className="opacity-0 group-hover/card:opacity-100 text-[10.5px] text-slate-400/70 dark:text-zinc-600/70 transition-opacity flex items-center gap-0.5">
                                · {isArtifactTool ? '点击预览 ↗' : '点击查看'}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Todo Tool Card - Keep existing feature */}
            {isTodoTool && step.observation && (
                <div className="pl-[19px] mt-1 pr-1">
                    <TodoCard observation={step.observation} />
                </div>
            )}

            {/* Inline Authorization UI */}
            {step.isWaitingAuthorization && (
                <InlineAuthorizationUI
                    reason={step.authReason}
                    onAuthorize={handleAuthorization}
                />
            )}

            {/* Expanded Content View */}
            {!isTodoTool && isExpanded && (
                <div className="pl-[29px] mt-1.5 pr-1 pb-3">
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 shadow-sm bg-white dark:bg-[#0d1117]">
                        {/* Input parameters */}
                        {step.toolInput && (
                            <>
                                <div className="flex items-center px-3 py-1.5 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5">
                                    <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-sans font-medium">
                                        Input
                                    </span>
                                </div>
                                <pre className="py-2.5 px-3.5 text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-all text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-white/5 max-h-[200px] overflow-auto">
                                    {formattedToolInput}
                                </pre>
                            </>
                        )}

                        {/* Output */}
                        {(step.observation || step.streamingObservation) && (
                            <>
                                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5">
                                    <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-sans font-medium">
                                        Output{step.isComplete ? '' : ' (Streaming...)'}
                                    </span>
                                    <button
                                        onClick={handleCopy}
                                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500 transition-colors"
                                        title="Copy output"
                                    >
                                        {copied ? <Check size={11} className="text-emerald-500 dark:text-emerald-400" /> : <Copy size={11} />}
                                    </button>
                                </div>
                                <pre className={cn(
                                    "flex flex-col-reverse max-h-[400px] overflow-auto py-2.5 px-3.5 text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-all",
                                    step.isError
                                        ? "text-red-500 dark:text-red-400/90"
                                        : "text-slate-700 dark:text-slate-300"
                                )}>
                                    <div className="overflow-visible !flex !flex-col justify-end">
                                        {renderedOutputLines}
                                    </div>
                                </pre>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}, (prevProps, nextProps) => prevProps.step === nextProps.step && prevProps.isLast === nextProps.isLast);

function classifyTool(toolName?: string): 'read' | 'search' | 'create' | 'edit' | 'command' | 'other' {
    const lower = toolName?.toLowerCase() || '';
    if (['read', 'list', 'load_skill'].some(keyword => lower.includes(keyword))) return 'read';
    if (['grep', 'glob', 'search'].some(keyword => lower.includes(keyword))) return 'search';
    if (lower.includes('write')) return 'create';
    if (lower.includes('edit')) return 'edit';
    if (['bash', 'command', 'terminal'].some(keyword => lower.includes(keyword))) return 'command';
    return 'other';
}

function buildTraceSummary(steps: ThoughtStep[]) {
    const counts = { read: 0, search: 0, create: 0, edit: 0, command: 0, other: 0 };
    let waiting = 0;

    for (const step of steps) {
        if (!step.tool) continue;
        if (step.isWaitingAuthorization) {
            waiting++;
            continue;
        }
        counts[classifyTool(step.tool)]++;
    }

    const labels: string[] = [];
    if (counts.read > 0) labels.push(`查看 ${counts.read} 项`);
    if (counts.search > 0) labels.push(`搜索 ${counts.search} 项`);
    if (counts.create > 0) labels.push(`创建 ${counts.create} 项`);
    if (counts.edit > 0) labels.push(`修改 ${counts.edit} 项`);
    if (counts.command > 0) labels.push(`执行 ${counts.command} 个命令`);
    if (counts.other > 0) labels.push(`处理 ${counts.other} 项`);
    if (waiting > 0) labels.push(`待确认 ${waiting} 项`);

    return labels.join(' · ') || `已执行 ${steps.length} 个操作`;
}

function getSummaryActionLabel(isCollapsed: boolean) {
    return isCollapsed ? '展开' : '收起';
}

const HIDDEN_TOOLS = new Set(['memorize']);

const ThoughtTrace = React.memo(function ThoughtTrace({ steps, contextContent: _contextContent }: ThoughtTraceProps) {
    const visibleSteps = useMemo(() => steps.filter(s => !s.tool || !HIDDEN_TOOLS.has(s.tool)), [steps]);
    if (visibleSteps.length === 0) return null;

    const summary = useMemo(() => buildTraceSummary(visibleSteps), [visibleSteps]);
    const hasActiveSteps = useMemo(
        () => visibleSteps.some(step => step.isWaitingAuthorization || !step.isComplete),
        [visibleSteps]
    );
    const [isCollapsed, setIsCollapsed] = useState(() => !hasActiveSteps);

    React.useEffect(() => {
        if (hasActiveSteps) {
            setIsCollapsed(false);
        }
    }, [hasActiveSteps]);

    const canCollapse = visibleSteps.length > 0;

    return (
        <div className="flex flex-col mb-0.5">
            <button
                type="button"
                className="mb-0.5 ml-[2px] inline-flex w-full items-center gap-1.5 rounded-md border-l border-slate-200/80 px-2 py-1 text-[10.5px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-white/8 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-300"
                onClick={() => {
                    if (!canCollapse) return;
                    setIsCollapsed(value => !value);
                }}
            >
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span className="text-slate-500 dark:text-zinc-400">
                    {summary}
                </span>
                <span className="ml-auto text-[10px] text-slate-400 dark:text-zinc-600">
                    {getSummaryActionLabel(isCollapsed)}
                </span>
            </button>

            {!isCollapsed && visibleSteps.map((step, idx) => {
                return (
                    <div key={idx} className="flex flex-col w-full">
                        {step.tool && <ToolCallCard step={step} isLast={idx === visibleSteps.length - 1} />}
                    </div>
                );
            })}
        </div>
    );
}, (prevProps, nextProps) => prevProps.steps === nextProps.steps);

export default ThoughtTrace;

