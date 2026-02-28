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
            return JSON.stringify(parsed);
        } catch {
            return input;
        }
    };

    const inlineInput = formatInputInline(step.tool || '', step.toolInput);

    // Output stats
    const getOutputLines = (obs?: string) => {
        if (!obs) return 0;
        return obs.split('\n').length;
    };
    const outLines = getOutputLines(step.observation);
    const outStats = step.isComplete
        ? `${outLines} line${outLines === 1 ? '' : 's'} of output`
        : step.isWaitingAuthorization
            ? 'Wait for authorization...'
            : 'Running...';

    return (
        <div className="font-mono my-1 pl-1.5">
            {/* Inline Header */}
            <div
                className={cn(
                    "flex items-start gap-2.5",
                    !isTodoTool && "cursor-pointer group/card hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors rounded -mx-2 px-2 py-1"
                )}
                onClick={() => !isTodoTool && setIsExpanded(!isExpanded)}
            >
                {/* Dot Indicator */}
                <div className={cn(
                    "mt-1.5 w-[6px] h-[6px] rounded-full shrink-0 shadow-sm",
                    step.isComplete
                        ? "bg-emerald-500 shadow-emerald-500/20"
                        : step.isWaitingAuthorization
                            ? "bg-amber-500 animate-pulse shadow-amber-500/20"
                            : "bg-red-500 animate-pulse shadow-red-500/20"
                )} />

                {/* Content Container */}
                <div className="flex-1 min-w-0 flex flex-col pt-[1px]">
                    {/* Top line: Tool + Input */}
                    <div className="flex flex-col gap-0.5 leading-[1.4]">
                        <span className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 tracking-tight">
                            {displayName}
                        </span>
                        {inlineInput && (
                            <span className="text-[12.5px] text-slate-400 dark:text-zinc-500 break-all select-text font-normal pt-0.5 pr-4">
                                {inlineInput}
                            </span>
                        )}
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
                            <span className="opacity-0 group-hover/card:opacity-100 text-[10.5px] text-slate-400/70 dark:text-zinc-600/70 transition-opacity">
                                · 点击查看
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
                <div className="pl-[19px] mt-2 pr-1">
                    <div className="px-3 py-2.5 bg-amber-50 dark:bg-amber-500/5 border border-amber-500/20 dark:border-amber-500/10 rounded-lg space-y-2">
                        <div className="flex gap-2 items-start">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-800 dark:text-amber-200/80 leading-relaxed font-medium">
                                <span className="font-bold">安全建议: </span>
                                {step.authReason || '此工具涉及高风险操作，确认允许即可执行。'}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1 border-t border-amber-500/10 mt-1">
                            <button
                                onClick={() => handleAuthorization(false)}
                                className="px-3 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 rounded text-[11px] font-medium hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all"
                            >
                                拒绝
                            </button>
                            <button
                                onClick={() => handleAuthorization(true, true)}
                                className="px-3 py-1 bg-white dark:bg-zinc-800 border border-amber-200/50 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 rounded text-[11px] font-medium hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all"
                            >
                                允许并记住 (1h)
                            </button>
                            <button
                                onClick={() => handleAuthorization(true)}
                                className="px-3.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-semibold transition-all"
                            >
                                确认允许
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Expanded Content View */}
            {!isTodoTool && isExpanded && (
                <div className="pl-[19px] mt-2 pr-1">
                    <div className="select-text px-3 py-3 border border-slate-200 dark:border-white/10 rounded-lg text-[11.5px] font-mono space-y-3 bg-slate-50/50 dark:bg-[#0c0c0e]">
                        {/* Input */}
                        {step.toolInput && (
                            <div>
                                <div className="text-[9.5px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1 font-sans font-medium flex justify-between items-center">
                                    <span>Input</span>
                                </div>
                                <pre className="text-slate-600 dark:text-zinc-400 whitespace-pre-wrap break-all bg-white dark:bg-white/[0.02] py-2 px-2.5 rounded-md border border-slate-100 dark:border-white/5 max-h-[160px] overflow-auto shadow-sm">
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
                                <div className="flex items-center justify-between mb-1 mt-3">
                                    <div className="text-[9.5px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-sans font-medium">Output</div>
                                    <button
                                        onClick={handleCopy}
                                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                                        title="Copy output"
                                    >
                                        {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                                    </button>
                                </div>
                                <pre className="text-slate-600 dark:text-zinc-400 whitespace-pre-wrap break-all bg-white dark:bg-white/[0.02] py-2 px-2.5 rounded-md border border-slate-100 dark:border-white/5 max-h-[300px] overflow-auto shadow-sm">
                                    {step.observation.length > 3000
                                        ? step.observation.slice(0, 3000) + '\n\n... (truncated)'
                                        : step.observation}
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
    return (
        <div className="select-text text-[14px] text-slate-700 dark:text-zinc-300 leading-relaxed my-1.5 px-0.5 font-normal">
            {thought.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                    {line}
                    {i !== thought.split('\n').length - 1 && <br />}
                </React.Fragment>
            ))}
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
        <div className="flex flex-col mb-2">
            {steps.map((step, idx) => (
                <div key={idx} className="flex flex-col w-full">
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

