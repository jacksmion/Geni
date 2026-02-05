import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BrainCircuit, Activity, CheckCircle2, Terminal } from 'lucide-react';
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
}

interface ThoughtTraceProps {
    steps: ThoughtStep[];
}

const ThoughtTrace: React.FC<ThoughtTraceProps> = ({ steps }) => {
    // Auto-expand if the last step is incomplete (still running)
    const isRunning = steps.length > 0 && !steps[steps.length - 1].isComplete;
    const [isExpanded, setIsExpanded] = useState(true);

    // Effect to auto-expand when new steps arrive or when running
    React.useEffect(() => {
        if (isRunning) {
            setIsExpanded(true);
        }
    }, [steps.length, isRunning]);

    if (steps.length === 0) return null;

    return (
        <div className="my-3 border border-indigo-500/30 bg-black/40 backdrop-blur-md rounded-xl overflow-hidden transition-all duration-300 shadow-lg shadow-indigo-900/20">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                    "w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors",
                    isRunning && "bg-indigo-500/10"
                )}
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "flex items-center justify-center w-6 h-6 rounded-md",
                        isRunning ? "bg-indigo-500 text-white animate-pulse" : "bg-indigo-900/50 text-indigo-300"
                    )}>
                        <BrainCircuit size={14} />
                    </div>

                    <div className="flex flex-col items-start">
                        <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-2">
                            Agent Reasoning
                            {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                        </span>
                        {isRunning && (
                            <span className="text-[10px] text-indigo-400 font-mono">Executing Step {steps.length}...</span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full text-gray-400 font-mono border border-white/5">
                        {steps.length} Actions
                    </span>
                    {isExpanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                </div>
            </button>

            {isExpanded && (
                <div className="px-4 pb-4 space-y-4 mt-2 border-t border-white/5 pt-4">
                    {steps.map((step, idx) => (
                        <div key={idx} className="relative pl-6 border-l border-indigo-500/20 last:border-transparent pb-2 group">
                            {/* Timeline Dot */}
                            <div className={cn(
                                "absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-[#1e1e1e]",
                                !step.isComplete ? "bg-amber-500 animate-pulse" : "bg-indigo-500"
                            )} />

                            {step.thought && (
                                <div className="mb-3">
                                    <div className="text-[10px] text-indigo-300/70 uppercase font-bold mb-1.5 flex items-center gap-1.5">
                                        <Activity size={10} /> Thought Process
                                    </div>
                                    <p className="text-sm text-gray-300 leading-relaxed font-light tracking-wide bg-white/5 p-3 rounded-lg border border-white/5">
                                        {step.thought}
                                    </p>
                                </div>
                            )}

                            {step.tool && (
                                <div className="mb-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] text-amber-500 uppercase font-bold flex items-center gap-1.5">
                                            <Terminal size={10} /> Executing Tool
                                        </div>
                                        <span className="text-[10px] font-mono text-gray-500">{step.tool}</span>
                                    </div>

                                    <div className="bg-[#0d0d0d] rounded-lg border border-white/10 overflow-hidden">
                                        <div className="px-3 py-1.5 border-b border-white/5 bg-white/5 flex items-center gap-2">
                                            <div className="flex gap-1">
                                                <div className="w-2 h-2 rounded-full bg-red-500/20" />
                                                <div className="w-2 h-2 rounded-full bg-yellow-500/20" />
                                                <div className="w-2 h-2 rounded-full bg-green-500/20" />
                                            </div>
                                            <span className="text-[10px] text-gray-500 font-mono">Input Arguments</span>
                                        </div>
                                        <pre className="text-[11px] text-emerald-400 font-mono overflow-x-auto p-3 custom-scrollbar">
                                            {step.toolInput}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {step.observation && (
                                <div className="mt-2 animate-in fade-in zoom-in-95 duration-300">
                                    <div className="text-[10px] text-emerald-500/70 uppercase font-bold mb-1.5 flex items-center gap-1.5">
                                        <CheckCircle2 size={10} /> Tool Output
                                    </div>
                                    <div className="bg-[#1a1b26] p-3 rounded-lg border border-emerald-500/20 relative overflow-hidden group-hover:border-emerald-500/40 transition-colors">
                                        <div className="absolute top-0 right-0 p-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                                        </div>
                                        <p className="font-mono text-[11px] text-gray-300 leading-tight whitespace-pre-wrap">
                                            {step.observation.length > 300
                                                ? step.observation.slice(0, 300) + '...'
                                                : step.observation}
                                        </p>
                                        {step.observation.length > 300 && (
                                            <button className="text-[10px] text-indigo-400 mt-2 hover:underline">
                                                See full output
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ThoughtTrace;
