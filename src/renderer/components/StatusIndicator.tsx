import React from 'react';
import { Sparkles, Loader2, Wrench, AlertTriangle, XCircle, Search, FileText, Terminal } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function StatusIndicator() {
    const { currentAgentEvent } = useChatStore();
    const event = currentAgentEvent;

    if (!event || event.currentState === 'Idle') return null;

    const stateMeta: Record<string, { label: string, icon: any, color: string, pulse: boolean }> = {
        Thinking: {
            label: '正在思考...',
            icon: Sparkles,
            color: 'text-indigo-500 dark:text-indigo-400',
            pulse: true
        },
        ExecutingHelper: {
            label: '正在处理数据...',
            icon: Loader2,
            color: 'text-blue-500 dark:text-blue-400',
            pulse: true
        },
        ExecutingTool: {
            label: '正在执行工具...',
            icon: Wrench,
            color: 'text-emerald-500 dark:text-emerald-400',
            pulse: true
        },
        AwaitingInput: {
            label: '等待确认...',
            icon: AlertTriangle,
            color: 'text-amber-500 dark:text-amber-400',
            pulse: true
        },
        Error: {
            label: '执行出错',
            icon: XCircle,
            color: 'text-red-500 dark:text-red-400',
            pulse: false
        },
        Aborted: {
            label: '已中断',
            icon: XCircle,
            color: 'text-slate-500 dark:text-slate-400',
            pulse: false
        }
    };

    const meta = stateMeta[event.currentState] || { label: event.currentState, icon: Sparkles, color: 'text-indigo-500', pulse: true };
    const Icon = meta.icon;
    const statusText = event.message || meta.label;

    // Specific tool icon if we have one in metadata
    let ToolIcon = null;
    if (event.metadata?.tool) {
        const t = event.metadata.tool.toLowerCase();
        if (t.includes('search')) ToolIcon = Search;
        else if (t.includes('file') || t.includes('edit')) ToolIcon = FileText;
        else if (t.includes('bash') || t.includes('cmd')) ToolIcon = Terminal;
    }

    return (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
            <div className={cn(
                "flex items-center gap-3 px-4 py-2 rounded-full border shadow-2xl backdrop-blur-xl transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 zoom-in-95",
                "bg-white/90 dark:bg-zinc-900/90 border-slate-200 dark:border-white/10",
                meta.pulse && "ring-4 ring-indigo-500/5 dark:ring-indigo-400/5 animate-pulse"
            )}>
                {/* Status Icon with background glow */}
                <div className={cn(
                    "relative w-7 h-7 rounded-full flex items-center justify-center shrink-0 overflow-hidden",
                    meta.color.replace('text-', 'bg-').replace('500', '100').replace('400', '500/10')
                )}>
                    <Icon size={14} className={cn(meta.color, meta.pulse && "animate-spin-slow")} />

                    {/* Scanning sweep effect for thinking/executing */}
                    {meta.pulse && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent -translate-x-full animate-sweep" />
                    )}
                </div>

                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-slate-700 dark:text-zinc-200">
                            {statusText}
                        </span>
                        {event.metadata?.tool && (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded-md border border-slate-200 dark:border-white/10">
                                {ToolIcon && <ToolIcon size={10} className="text-slate-500" />}
                                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-zinc-400">
                                    {event.metadata.tool}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Activity dots */}
                {meta.pulse && (
                    <div className="flex gap-1 pr-1">
                        <div className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" />
                    </div>
                )}
            </div>
        </div>
    );
}
