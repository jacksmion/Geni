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

    const stateMeta: Record<string, { label: string, icon: any, color: string, bgColor: string, pulse: boolean }> = {
        Thinking: {
            label: 'Thinking...',
            icon: Sparkles,
            color: 'text-indigo-500 dark:text-indigo-400',
            bgColor: 'bg-indigo-50 dark:bg-indigo-500/10',
            pulse: true
        },
        ExecutingHelper: {
            label: 'Processing...',
            icon: Loader2,
            color: 'text-blue-500 dark:text-blue-400',
            bgColor: 'bg-blue-50 dark:bg-blue-500/10',
            pulse: true
        },
        ExecutingTool: {
            label: 'Running tool...',
            icon: Wrench,
            color: 'text-emerald-500 dark:text-emerald-400',
            bgColor: 'bg-emerald-50 dark:bg-emerald-500/10',
            pulse: true
        },
        AwaitingInput: {
            label: 'Awaiting...',
            icon: AlertTriangle,
            color: 'text-amber-500 dark:text-amber-400',
            bgColor: 'bg-amber-50 dark:bg-amber-500/10',
            pulse: true
        },
        Error: {
            label: 'Error',
            icon: XCircle,
            color: 'text-red-500 dark:text-red-400',
            bgColor: 'bg-red-50 dark:bg-red-500/10',
            pulse: false
        },
        Aborted: {
            label: 'Aborted',
            icon: XCircle,
            color: 'text-slate-500 dark:text-slate-400',
            bgColor: 'bg-slate-50 dark:bg-white/5',
            pulse: false
        }
    };

    const meta = stateMeta[event.currentState] || { label: event.currentState, icon: Sparkles, color: 'text-indigo-500', bgColor: 'bg-indigo-50', pulse: true };
    const Icon = meta.icon;
    const statusText = event.message || meta.label;

    return (
        <div className="w-full flex justify-center px-4 py-2 shrink-0">
            <div className={cn(
                "inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full text-[12px] font-medium transition-all duration-300 animate-in fade-in slide-in-from-bottom-2",
                meta.bgColor,
                meta.color
            )}>
                <Icon size={13} className={cn(meta.pulse && "animate-spin")} style={meta.pulse ? { animationDuration: '2s' } : undefined} />

                <span>{statusText}</span>

                {event.metadata?.tool && (
                    <span className="text-[10px] font-mono opacity-70">
                        {event.metadata.tool}
                    </span>
                )}

                {/* Activity dots */}
                {meta.pulse && (
                    <div className="flex gap-0.5 ml-0.5">
                        <div className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" />
                    </div>
                )}
            </div>
        </div>
    );
}

