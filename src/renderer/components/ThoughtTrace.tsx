import React, { useState } from 'react';
import { ChevronRight, CheckCircle2, Loader2, Copy, Check, Terminal, FileText, Search, Code2, Wrench, ShieldAlert, ListChecks, Circle, RotateCw, Clock, X, Eye } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { extractPathAndContent } from '../utils/artifact';
import { preprocessMarkdown } from '../utils/markdown';
import { useChatStore } from '../store/useChatStore';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

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

// Format tool display name
const formatToolName = (tool: string): string => {
    // Check for MCP signature (double underscore)
    if (tool.includes('__')) {
        const parts = tool.split('__');
        if (parts.length >= 3 && parts[0] === 'mcp') {
            const serverId = parts[1];
            const actualToolName = parts.slice(2).join('__'); // Handle cases if tool name has __
            return `@${serverId}/${actualToolName}`;
        }
    }

    // Check for "old" style MCP (single underscore prefix from previous step)
    // We can't perfectly distinguish without the explicit 'mcp__' prefix, 
    // but we can try to handle the previous safePrefix format if needed. 
    // For now, let's assume 'tool' names with no slashes are built-in or legacy.

    // If it already has a slash (unlikely from OpenAI, but maybe from internal mapping), return as is
    if (tool.includes('/')) return tool;

    // Default: Assume built-in if no special prefix found
    return `@builtin/${tool}`;
};

// Truncate path: keep tail for long paths
const truncatePath = (p: string, max = 50): string =>
    p.length > max ? '...' + p.slice(-max) : p;

// Truncate generic string
const truncateStr = (s: string, max = 50): string =>
    s.length > max ? s.slice(0, max) + '...' : s;

// Extract key info from tool input
const extractKeyInfo = (tool: string, input?: string): string => {
    if (!input) return '';
    try {
        const parsed = JSON.parse(input);
        const lower = tool.toLowerCase();

        // Bash / command execution
        if (lower.includes('bash') || lower.includes('command')) {
            const cmd = parsed.command || parsed.cmd;
            if (cmd) return truncateStr(cmd, 60);
        }

        // File write / read / edit — extract path
        const filePath = parsed.path || parsed.file_path || parsed.filepath
            || parsed.target_file || parsed.filename;
        if (filePath && (lower.includes('file') || lower.includes('write')
            || lower.includes('read') || lower.includes('edit')
            || lower.includes('fs') || lower.includes('patch'))) {
            return truncatePath(filePath);
        }

        // Glob / pattern matching
        if (lower.includes('glob') || lower.includes('find') || lower.includes('list_dir')) {
            const pattern = parsed.pattern || parsed.glob || parsed.include;
            const dir = parsed.path || parsed.directory || parsed.root_dir;
            if (pattern && dir) return `${truncatePath(dir, 30)}  ${pattern}`;
            if (pattern) return pattern;
            if (dir) return truncatePath(dir);
        }

        // Search / grep
        if (lower.includes('search') || lower.includes('grep') || lower.includes('ripgrep')) {
            const query = parsed.query || parsed.pattern || parsed.regex || parsed.search_term;
            if (query) return truncateStr(query, 50);
        }

        // Code interpreter / python
        if (lower.includes('python') || lower.includes('code')) {
            const code = parsed.code || parsed.script;
            if (code) return truncateStr(code.split('\n')[0], 50);
        }

        // Todo
        if (lower.includes('todo')) {
            const todos = parsed.todos;
            if (Array.isArray(todos) && todos.length > 0) {
                return `${todos.length} item(s)`;
            }
        }

        // Generic: if there is a recognizable path-like field, show it
        if (filePath) return truncatePath(filePath);

        // Fallback: show the first key-value
        const firstKey = Object.keys(parsed)[0];
        if (firstKey) {
            const val = String(parsed[firstKey]);
            return truncateStr(val, 40);
        }
        return '';
    } catch {
        return truncateStr(input, 50);
    }
};

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

const TodoCard: React.FC<{ observation: string }> = ({ observation }) => {
    const parsed = parseTodoOutput(observation);
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
};

// ─── Inline Authorization UI Component ──────────────────────────────


interface InlineAuthorizationUIProps {
    reason?: string;
    onAuthorize: (approved: boolean, remember?: boolean) => void;
}

const InlineAuthorizationUI: React.FC<InlineAuthorizationUIProps> = ({ reason, onAuthorize }) => {
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
};

// Tool Call Card Component
const ToolCallCard: React.FC<{ step: ThoughtStep; isLast?: boolean }> = ({ step, isLast }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const isTodoTool = step.tool === 'todowrite' || step.tool === 'todoread';

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        const textToCopy = step.observation || step.toolInput || '';
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleAuthorization = (approved: boolean, remember: boolean = false) => {
        if (step.authRequestId) {
            window.electronAPI.agent.respondToAuthorization({
                requestId: step.authRequestId,
                approved,
                remember
            });
        }
    };

    const isArtifactTool = step.tool === 'write' || step.tool === 'edit' || step.tool === 'read' || step.tool === 'bash';

    const handleOpenArtifact = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!step.toolInput && !step.observation) return;

        let path = '';
        let content = '';

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
            content: content
        });
    };

    // Clean tool name
    const getCleanName = (tool: string) => {
        if (!tool) return 'Unknown';
        let n = tool;
        if (n.includes('__')) n = n.split('__').pop() || n;
        if (n.includes('/')) n = n.split('/').pop() || n;
        return n.charAt(0).toUpperCase() + n.slice(1);
    };

    const displayName = getCleanName(step.tool || '');

    // Format input inline
    const formatInputInline = (tool: string, input?: string) => {
        if (!input) return '';

        const extractByRegex = () => {
            const lower = tool.toLowerCase();
            if (lower.includes('bash') || lower.includes('command')) {
                const cmdMatch = input.match(/"(?:command|cmd)"\s*:\s*"([^"]*)/);
                if (cmdMatch) return cmdMatch[1];
            }
            if (lower.includes('file') || lower.includes('write') || lower.includes('read') || lower.includes('edit')) {
                const pathMatch = input.match(/"(?:path|file_path|target_file)"\s*:\s*"([^"]*)/);
                if (pathMatch) return pathMatch[1];
            }
            // Add a small cleanup just in case
            const clean = input.replace(/\\n/g, ' ').replace(/\\"/g, '"');
            return clean.length > 50 ? clean.slice(0, 50) + '...' : clean;
        };

        try {
            const parsed = JSON.parse(input);
            const lower = tool.toLowerCase();

            if (lower.includes('bash') || lower.includes('command')) {
                return parsed.command || parsed.cmd || '';
            }
            if (lower.includes('file') || lower.includes('write') || lower.includes('read') || lower.includes('edit')) {
                return parsed.path || parsed.file_path || parsed.target_file || '';
            }
            // Format single line JSON
            const str = JSON.stringify(parsed);
            return str.length > 50 ? str.slice(0, 50) + '...' : str;
        } catch {
            return extractByRegex();
        }
    };

    const inlineInput = formatInputInline(step.tool || '', step.toolInput);

    // Output stats
    const getOutputLines = (obs?: string) => {
        if (!obs) return 0;
        return obs.split('\n').length;
    };
    const outLines = getOutputLines(step.observation || step.streamingObservation);

    const getStatusText = () => {
        if (step.isWaitingAuthorization) return '等待授权...';

        const isWrite = step.tool?.toLowerCase().includes('write') || step.tool?.toLowerCase().includes('edit');
        const isBash = step.tool?.toLowerCase().includes('bash') || step.tool?.toLowerCase().includes('command');
        const isRead = step.tool?.toLowerCase().includes('read');

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
    };
    const outStats = getStatusText();

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
                                <span className="text-[12.5px] text-slate-400 dark:text-zinc-500 break-all select-text font-normal pt-0.5">
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
                    <div className="flex flex-col gap-2">
                        {/* 2. Hide Raw JSON by default, parse it if possible into key-value pills */}
                        {step.toolInput && (
                            <div className="flex flex-wrap items-start gap-1.5 opacity-90">
                                {(() => {
                                    try {
                                        const parsed = JSON.parse(step.toolInput);
                                        return Object.entries(parsed).map(([key, val], i) => (
                                            <div key={i} className="flex max-w-full text-[11px] leading-relaxed break-all bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 rounded pl-1.5 pr-2 py-0.5">
                                                <span className="text-slate-400 dark:text-zinc-500 select-none mr-2 font-medium">{key}:</span>
                                                <span className="text-slate-600 dark:text-zinc-300 select-text font-mono">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                                            </div>
                                        ));
                                    } catch {
                                        // Fallback if not valid JSON
                                        return (
                                            <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/60 rounded px-2 py-0.5 whitespace-pre-wrap break-all">
                                                {step.toolInput}
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                        )}

                        {/* 3. Terminal/Output View - Dark theme with diff support */}
                        {(step.observation || step.streamingObservation) && (
                            <div className="group/output relative overflow-hidden rounded-lg mt-1 border border-slate-800/10 dark:border-white/10 shadow-sm bg-[#0d1117]">
                                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/output:opacity-100 transition-opacity">
                                    <button
                                        onClick={handleCopy}
                                        className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-slate-300 transition-colors backdrop-blur-sm shadow-sm"
                                        title="Copy output"
                                    >
                                        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                    </button>
                                </div>
                                <div className="flex items-center px-3 py-1.5 bg-white/5 border-b border-white/5">
                                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-sans font-medium">
                                        Output{step.isComplete ? '' : ' (Streaming...)'}
                                    </span>
                                </div>
                                <pre className={cn(
                                    "flex flex-col-reverse max-h-[400px] overflow-auto py-3 px-3.5 text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-all",
                                    step.isError ? "text-red-400/90" : "text-slate-300"
                                )}>
                                    <div className="overflow-visible !flex !flex-col justify-end">
                                        {(() => {
                                            const obs = step.observation || step.streamingObservation || '';
                                            const truncatedObs = obs.length > 50000 ? obs.slice(0, 50000) + '\n\n... (truncated for UI performance)' : obs;

                                            // Simple diff/error highlighting
                                            return truncatedObs.split('\n').map((line, i) => {
                                                if (line.startsWith('+')) {
                                                    return <span key={i} className="text-emerald-400 bg-emerald-500/10 block -mx-3 px-3">{line}</span>;
                                                }
                                                if (line.startsWith('-')) {
                                                    return <span key={i} className="text-red-400 bg-red-500/10 block -mx-3 px-3">{line}</span>;
                                                }
                                                if (line.match(/^Error:/i) || line.match(/failed/i) || line.match(/denied/i)) {
                                                    return <span key={i} className="text-red-400 font-semibold block">{line}</span>;
                                                }
                                                return <span key={i} className="block">{line}</span>;
                                            });
                                        })()}
                                    </div>
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Thought Text Component (AI's internal monologue)
const ThoughtText: React.FC<{ thought: string }> = ({ thought }) => {
    if (!thought) return null;

    // 清理首尾空白并预处理 Markdown
    const cleanThought = preprocessMarkdown(thought.trim());
    if (!cleanThought) return null;

    return (
        <div className="select-text prose prose-slate dark:prose-invert max-w-none 
            text-[14.5px] text-slate-800 dark:text-zinc-200 leading-relaxed my-1.5 px-0.5 font-medium
            prose-p:my-1.5 prose-p:last:mb-0
            prose-headings:font-bold prose-headings:text-[15px] prose-headings:my-2
            prose-ul:my-1.5 prose-ul:list-disc prose-ul:pl-5
            prose-ol:my-1.5 prose-ol:list-decimal prose-ol:pl-5
            prose-li:my-0.5
            prose-strong:text-slate-900 dark:prose-strong:text-zinc-100
            prose-code:text-indigo-600 dark:prose-code:text-indigo-400 prose-code:bg-indigo-50 dark:prose-code:bg-indigo-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none"
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {cleanThought}
            </ReactMarkdown>
        </div>
    );
};

const HIDDEN_TOOLS = new Set(['memorize']);

const ThoughtTrace: React.FC<ThoughtTraceProps> = ({ steps, contextContent }) => {
    const visibleSteps = steps.filter(s => !s.tool || !HIDDEN_TOOLS.has(s.tool));
    if (visibleSteps.length === 0) return null;

    return (
        <div className="flex flex-col mb-2">
            {visibleSteps.map((step, idx) => (
                <div key={idx} className="flex flex-col w-full">
                    {/* Always show thought if exists to maintain Intent -> Action flow */}
                    {step.thought && <ThoughtText thought={step.thought} />}

                    {/* Show tool call card if exists */}
                    {step.tool && <ToolCallCard step={step} isLast={idx === visibleSteps.length - 1} />}
                </div>
            ))}
        </div>
    );
};

export default ThoughtTrace;

