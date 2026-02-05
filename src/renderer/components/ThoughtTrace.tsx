import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BrainCircuit, Activity, CheckCircle2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ThoughtStep {
    thought?: string;
    action?: string;
    actionInput?: string;
    observation?: string;
    isComplete?: boolean;
}

interface ThoughtTraceProps {
    steps: ThoughtStep[];
}

const ThoughtTrace: React.FC<ThoughtTraceProps> = ({ steps }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (steps.length === 0) return null;

    return (
        <div className="my-2 border border-indigo-500/20 bg-black/20 backdrop-blur-sm rounded-xl overflow-hidden transition-all duration-300">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-indigo-500/10 transition-colors"
            >
                <div className="flex items-center gap-2 text-indigo-400">
                    <BrainCircuit size={16} className={cn(!steps[steps.length - 1].isComplete && "animate-pulse")} />
                    <span className="text-[11px] font-bold uppercase tracking-wider">代理推理链</span>
                    <span className="text-[10px] bg-indigo-500/20 px-1.5 py-0.5 rounded text-indigo-300 font-mono">
                        {steps.length} Steps
                    </span>
                </div>
                {isExpanded ? <ChevronDown size={14} className="text-indigo-400" /> : <ChevronRight size={14} className="text-indigo-400" />}
            </button>

            {isExpanded && (
                <div className="px-4 pb-4 space-y-4 mt-2">
                    {steps.map((step, idx) => (
                        <div key={idx} className="relative pl-6 border-l border-indigo-500/20 last:border-transparent pb-2">
                            <div className="absolute left-[-5px] top-1 w-2 h-2 rounded-full bg-indigo-500/40" />

                            {step.thought && (
                                <div className="mb-2">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
                                        <Activity size={10} /> Thought
                                    </div>
                                    <p className="text-xs text-gray-300 italic leading-relaxed">
                                        {step.thought}
                                    </p>
                                </div>
                            )}

                            {step.action && (
                                <div className="mb-2 bg-[#1e1e1e] p-2 rounded-lg border border-[#333]">
                                    <div className="text-[10px] text-amber-500 uppercase font-bold mb-1">
                                        Action: <span className="text-gray-300 font-mono">{step.action}</span>
                                    </div>
                                    {step.actionInput && (
                                        <pre className="text-[10px] text-emerald-400 font-mono overflow-auto max-h-32 p-1">
                                            {step.actionInput}
                                        </pre>
                                    )}
                                </div>
                            )}

                            {step.observation && (
                                <div className="mt-2 text-xs text-gray-400 flex gap-2 items-start">
                                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <div className="bg-[#252526] p-2 rounded w-full border border-emerald-500/10">
                                        <span className="text-[10px] font-bold uppercase block mb-1">Observation</span>
                                        <p className="font-mono text-[10px] leading-tight opacity-80">{step.observation}</p>
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
