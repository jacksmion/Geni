import React, { useState } from 'react';
import { ChevronRight, CheckCircle2, Loader2, Copy, Check, Terminal, FileText, Search, Code2, Wrench } from 'lucide-react';
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
}

interface ThoughtTraceProps {
    steps: ThoughtStep[];
}

// Tool icon mapping
const getToolIcon = (toolName: string) => {
    const lower = toolName?.toLowerCase() || '';
    if (lower.includes('bash') || lower.includes('command')) return Terminal;
    if (lower.includes('file') || lower.includes('fs') || lower.includes('edit')) return FileText;
    if (lower.includes('search')) return Search;
    if (lower.includes('code') || lower.includes('python')) return Code2;
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

// Extract key info from tool input
const extractKeyInfo = (tool: string, input?: string): string => {
    if (!input) return '';
    try {
        const parsed = JSON.parse(input);
        if (tool.includes('bash') && parsed.command) {
            return parsed.command.length > 60 ? parsed.command.slice(0, 60) + '...' : parsed.command;
        }
        if (tool.includes('file') && (parsed.path || parsed.file_path)) {
            const path = parsed.path || parsed.file_path;
            return path.length > 50 ? '...' + path.slice(-50) : path;
        }
        if (tool.includes('search') && parsed.query) {
            return `"${parsed.query}"`;
        }
        if (parsed.operation) {
            return `${parsed.operation} ${parsed.path || ''}`.trim();
        }
        // Return first key-value for unknown tools
        const firstKey = Object.keys(parsed)[0];
        if (firstKey) {
            const val = String(parsed[firstKey]);
            return val.length > 40 ? val.slice(0, 40) + '...' : val;
        }
        return '';
    } catch {
        return input.length > 50 ? input.slice(0, 50) + '...' : input;
    }
};

// Tool Call Card Component
const ToolCallCard: React.FC<{ step: ThoughtStep }> = ({ step }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const ToolIcon = getToolIcon(step.tool || '');
    const toolDisplayName = formatToolName(step.tool || 'unknown');
    const keyInfo = extractKeyInfo(step.tool || '', step.toolInput);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        const textToCopy = step.observation || step.toolInput || '';
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="my-2">
            {/* Card Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-left",
                    "bg-slate-50 hover:bg-slate-100 border-slate-200",
                    "dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:border-white/10",
                    isExpanded && "rounded-b-none border-b-0"
                )}
            >
                {/* Tool Icon */}
                <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                    step.isComplete
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                        : "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
                )}>
                    <ToolIcon size={14} strokeWidth={2} />
                </div>

                {/* Tool Name */}
                <span className="text-sm font-medium text-slate-700 dark:text-zinc-200 font-mono">
                    {toolDisplayName}
                </span>

                {/* Status Icon */}
                {step.isComplete ? (
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                ) : (
                    <Loader2 size={14} className="text-amber-500 animate-spin shrink-0" />
                )}

                {/* Right Side Actions */}
                <div className="ml-auto flex items-center gap-2">
                    {step.isComplete && (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            已完成
                        </span>
                    )}

                    {/* Copy Button */}
                    <button
                        onClick={handleCopy}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                        title="Copy output"
                    >
                        {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </button>

                    {/* Expand Chevron */}
                    <ChevronRight
                        size={14}
                        className={cn(
                            "text-slate-400 dark:text-zinc-500 transition-transform",
                            isExpanded && "rotate-90"
                        )}
                    />
                </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className={cn(
                    "px-4 py-3 border border-t-0 rounded-b-xl text-xs font-mono space-y-3",
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
        <div className="text-sm text-slate-500 dark:text-zinc-400 italic leading-relaxed pl-1 border-l-2 border-slate-200 dark:border-white/10 ml-1 my-2">
            {thought}
        </div>
    );
};

const ThoughtTrace: React.FC<ThoughtTraceProps> = ({ steps }) => {
    if (steps.length === 0) return null;

    return (
        <div className="space-y-1">
            {steps.map((step, idx) => (
                <div key={idx}>
                    {/* Show thought if exists */}
                    {step.thought && <ThoughtText thought={step.thought} />}

                    {/* Show tool call card if exists */}
                    {step.tool && <ToolCallCard step={step} />}
                </div>
            ))}
        </div>
    );
};

export default ThoughtTrace;
