import React, { useState } from 'react';
import { ChevronRight, CheckCircle2, Loader2, Copy, Check, Terminal, FileText, Search, Code2, Wrench, ShieldAlert, ListChecks, Circle, RotateCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ThoughtStep {
    thought?: string;
    tool?: string;
    toolInput?: string;
    observation?: string;
    isComplete?: boolean;
    duration?: number;
    authRequestId?: string;
    isWaitingAuthorization?: boolean;
    authReason?: string;
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

// Tool Call Card Component
const ToolCallCard: React.FC<{ step: ThoughtStep }> = ({ step }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const ToolIcon = getToolIcon(step.tool || '');
    const toolDisplayName = formatToolName(step.tool || 'unknown');
    const keyInfo = extractKeyInfo(step.tool || '', step.toolInput);

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

    return (
        <div className="my-1">
            {/* Card Header */}
            <div
                onClick={() => !isTodoTool && setIsExpanded(!isExpanded)}
                className={cn(
                    "group/card w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-left",
                    !isTodoTool && "cursor-pointer",
                    "bg-slate-50/80 hover:bg-slate-100/80 border-slate-100",
                    "dark:bg-white/[0.02] dark:hover:bg-white/[0.04] dark:border-white/5",
                    !step.isComplete && !step.isWaitingAuthorization && "animate-border-pulse border-amber-500/30 dark:border-amber-500/20",
                    step.isWaitingAuthorization && "border-amber-500/50 bg-amber-50/30 dark:border-amber-500/30 dark:bg-amber-500/5",
                    isExpanded && !isTodoTool && "rounded-b-none border-b-0"
                )}
            >
                {/* Tool Icon */}
                <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center shrink-0",
                    step.isComplete
                        ? "text-emerald-500 dark:text-emerald-400"
                        : step.isWaitingAuthorization
                            ? "text-amber-500"
                            : "text-amber-500 animate-pulse"
                )}>
                    {step.isWaitingAuthorization ? <ShieldAlert size={12} strokeWidth={2.5} /> : <ToolIcon size={12} strokeWidth={2} />}
                </div>

                {/* Tool Name + Key Params */}
                <span className="text-[12px] font-medium text-slate-600 dark:text-zinc-300 font-mono truncate min-w-0">
                    {toolDisplayName}
                </span>
                {keyInfo && (
                    <>
                        <span className="text-[11px] text-slate-300 dark:text-zinc-600 shrink-0 select-none">·</span>
                        <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono truncate min-w-0" title={keyInfo}>
                            {keyInfo}
                        </span>
                    </>
                )}

                {/* Status checkmark */}
                {step.isComplete ? (
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                ) : step.isWaitingAuthorization ? (
                    <ShieldAlert size={12} className="text-amber-500 shrink-0" />
                ) : (
                    <Loader2 size={12} className="text-amber-500 animate-spin shrink-0" />
                )}

                {step.isWaitingAuthorization && (
                    <span className="text-[10px] text-amber-500 font-medium animate-pulse">
                        等待授权...
                    </span>
                )}

                {/* Right Side - Duration + Actions (hover only) */}
                <div className="ml-auto flex items-center gap-1.5">
                    {step.isComplete && step.duration != null && (
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums">
                            {step.duration}ms
                        </span>
                    )}

                    {/* Copy & Expand - visible on hover, hidden for todo tools */}
                    {!isTodoTool && (
                        <div className="hidden group-hover/card:flex items-center gap-0.5">
                            <button
                                onClick={handleCopy}
                                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                                title="Copy output"
                            >
                                {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                            </button>
                            <ChevronRight
                                size={12}
                                className={cn(
                                    "text-slate-400 dark:text-zinc-500 transition-transform",
                                    isExpanded && "rotate-90"
                                )}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Todo: Always-visible card (no expand needed) */}
            {isTodoTool && step.observation && (
                <TodoCard observation={step.observation} />
            )}

            {/* Inline Authorization UI */}
            {step.isWaitingAuthorization && (
                <div className="px-4 py-3 bg-amber-500/5 dark:bg-amber-500/5 border-x border-b border-amber-500/30 dark:border-amber-500/20 rounded-b-xl space-y-3">
                    <div className="flex gap-2.5 items-start">
                        <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800 dark:text-amber-200/80 leading-relaxed font-medium">
                            <span className="font-bold">安全建议: </span>
                            {step.authReason || '此工具涉及高风险操作，请确认是否允许执行。'}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            onClick={() => handleAuthorization(false)}
                            className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 rounded-lg text-[11px] font-semibold hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all active:scale-95"
                        >
                            拒绝
                        </button>
                        <button
                            onClick={() => handleAuthorization(true, true)}
                            className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-amber-200/50 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-[11px] font-semibold hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all active:scale-95"
                        >
                            允许并记住 (1h)
                        </button>
                        <button
                            onClick={() => handleAuthorization(true)}
                            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold shadow-sm shadow-amber-500/20 transition-all active:scale-95"
                        >
                            确认允许
                        </button>
                    </div>
                </div>
            )}

            {/* Expanded Content (non-todo tools only) */}
            {!isTodoTool && isExpanded && (
                <div className={cn(
                    "select-text px-4 py-3 border border-t-0 rounded-b-xl text-xs font-mono space-y-3",
                    "bg-slate-50 border-slate-200 dark:bg-white/[0.02] dark:border-white/10"
                )}>
                    {/* Input */}
                    {step.toolInput && (
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1.5 font-sans font-medium">Input</div>
                            <pre className="text-slate-600 dark:text-zinc-400 whitespace-pre-wrap break-all bg-white dark:bg-black/20 p-2 rounded-lg border border-slate-100 dark:border-white/5 max-h-40 overflow-auto">
                                {(() => {
                                    try {
                                        return JSON.stringify(JSON.parse(step.toolInput), null, 2);
                                    } catch {
                                        return step.toolInput;
                                    }
                                })()}
                            </pre>
                        </div>
                    )}

                    {/* Output */}
                    {step.observation && (
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1.5 font-sans font-medium">Output</div>
                            <pre className="text-slate-600 dark:text-zinc-400 whitespace-pre-wrap break-all bg-white dark:bg-black/20 p-2 rounded-lg border border-slate-100 dark:border-white/5 max-h-60 overflow-auto">
                                {step.observation.length > 2000
                                    ? step.observation.slice(0, 2000) + '\n\n... (truncated)'
                                    : step.observation}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Thought Text Component (AI's internal monologue)
const ThoughtText: React.FC<{ thought: string }> = ({ thought }) => {
    if (!thought) return null;
    return (
        <div className="select-text text-[11px] text-slate-400 dark:text-zinc-500 leading-relaxed pl-3 border-l border-slate-200/60 dark:border-white/5 ml-2 my-1">
            {thought}
        </div>
    );
};

const ThoughtTrace: React.FC<ThoughtTraceProps> = ({ steps, contextContent }) => {
    if (steps.length === 0) return null;

    // Helper to check if thought is a duplicate of main content
    const isDuplicate = (thought?: string): boolean => {
        if (!thought || !contextContent) return false;

        const cleanThought = thought.trim();
        const cleanContext = contextContent.trim();

        // Exact match or if context exactly contains the thought (for robust matching)
        return cleanThought === cleanContext || (cleanContext.length > 0 && cleanContext.includes(cleanThought) && cleanContext.length < cleanThought.length + 20);
    };

    return (
        <div className="space-y-1">
            {steps.map((step, idx) => (
                <div key={idx}>
                    {/* Show thought if exists and not duplicate */}
                    {step.thought && !isDuplicate(step.thought) && <ThoughtText thought={step.thought} />}

                    {/* Show tool call card if exists */}
                    {step.tool && <ToolCallCard step={step} />}
                </div>
            ))}
        </div>
    );
};

export default ThoughtTrace;
