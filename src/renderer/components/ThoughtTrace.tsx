import React, { useState } from 'react';
import { ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
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
    duration?: number; // 耗时(毫秒)
}

interface ThoughtTraceProps {
    steps: ThoughtStep[];
}

// 格式化工具输入为简洁命令
const formatToolCommand = (tool: string, input?: string): string => {
    if (!input) return tool;

    try {
        const parsed = JSON.parse(input);
        // 根据工具类型格式化显示
        if (tool === 'bash' && parsed.command) {
            return parsed.command;
        }
        if (tool === 'file_system' && parsed.operation) {
            return `${parsed.operation} ${parsed.path || ''}`.trim();
        }
        if (tool === 'python_exec') {
            return 'Python 代码执行';
        }
        if (tool === 'read_skill') {
            return `读取技能: ${parsed.skill_id}`;
        }
        // 默认返回工具名
        return tool;
    } catch {
        // 如果不是JSON，直接返回input的前50个字符
        return input.length > 50 ? input.slice(0, 50) + '...' : input;
    }
};

// 单个步骤组件
const StepItem: React.FC<{ step: ThoughtStep; index: number }> = ({ step, index }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const durationText = step.duration
        ? `${(step.duration / 1000).toFixed(2)}s`
        : step.isComplete ? '完成' : '处理中';

    // 如果只有工具调用，显示紧凑格式
    if (step.tool && !step.thought) {
        return (
            <div className="flex items-center gap-2 py-1.5 text-sm">
                {step.isComplete ? (
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                ) : (
                    <Loader2 size={14} className="text-amber-500 animate-spin shrink-0" />
                )}
                <span className="text-gray-400">
                    {step.isComplete ? '已完成' : '执行中'}
                </span>
                <span className="text-indigo-400 font-medium">命令行执行</span>
                <code className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded font-mono truncate max-w-[400px]">
                    {formatToolCommand(step.tool, step.toolInput)}
                </code>
            </div>
        );
    }

    // 有思考内容时，显示可展开格式
    return (
        <div className="py-1">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 text-sm hover:bg-white/5 rounded px-1 -ml-1 transition-colors w-full text-left"
            >
                <ChevronRight
                    size={14}
                    className={cn(
                        "text-gray-500 transition-transform shrink-0",
                        isExpanded && "rotate-90"
                    )}
                />
                <span className="text-indigo-400">已思考</span>
                <span className="text-gray-500 text-xs">{durationText}</span>
                {!step.isComplete && (
                    <Loader2 size={12} className="text-amber-500 animate-spin" />
                )}
            </button>

            {isExpanded && step.thought && (
                <div className="ml-5 mt-2 mb-3 text-sm text-gray-300 leading-relaxed border-l-2 border-indigo-500/30 pl-3">
                    {step.thought}
                </div>
            )}

            {/* 工具调用（如果有） */}
            {step.tool && (
                <div className="ml-5 flex items-center gap-2 py-1 text-sm">
                    {step.isComplete && step.observation ? (
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    ) : (
                        <Loader2 size={14} className="text-amber-500 animate-spin shrink-0" />
                    )}
                    <span className="text-gray-400">
                        {step.observation ? '已完成' : '执行中'}
                    </span>
                    <span className="text-indigo-400 font-medium">命令行执行</span>
                    <code className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded font-mono truncate max-w-[400px]">
                        {formatToolCommand(step.tool, step.toolInput)}
                    </code>
                </div>
            )}
        </div>
    );
};

const ThoughtTrace: React.FC<ThoughtTraceProps> = ({ steps }) => {
    if (steps.length === 0) return null;

    return (
        <div className="my-2 space-y-0.5">
            {steps.map((step, idx) => (
                <StepItem key={idx} step={step} index={idx} />
            ))}
        </div>
    );
};

export default ThoughtTrace;
