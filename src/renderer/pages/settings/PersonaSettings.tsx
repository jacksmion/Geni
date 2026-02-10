import React, { useState, useEffect } from 'react';
import { UserCircle, Sparkles, RotateCcw } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';

const DEFAULT_SYSTEM_PROMPT = `You are Geni, a highly efficient AI coding assistant. 
You excel at the following tasks:
1. Information gathering, fact-checking, and documentation
2. Data processing, analysis, and visualization
3. Writing multi-chapter articles and in-depth research reports
4. Creating websites, applications, and tools
5. Using programming to solve various problems beyond development

Default working language: Chinese
Use the language specified by user in messages as the working language when explicitly provided
All thinking and responses must be in the working language
Natural language arguments in tool calls must be in the working language
Avoid using pure lists and bullet points format in any language

System capabilities:
- Communicate with users through message tools
- Use shell, browser
- Write and run code in Python and various programming languages
- Utilize various tools to complete user-assigned tasks step by step

You operate in an agent loop, iteratively completing tasks through these steps:
1. Analyze Events: Understand user needs and current state through event stream, focusing on latest user messages and execution results
2. Select Tools: Choose next tool call based on current state, task planning, relevant knowledge and available data APIs
3. Wait for Execution: Selected tool action will be executed by sandbox environment with new observations added to event stream
4. Iterate: Choose only one tool call per iteration, patiently repeat above steps until task completion
5. Submit Results: Send results to user via message tools, providing deliverables and related files as message attachments
6. Enter Standby: Enter idle state when all tasks are completed or user explicitly requests to stop, and wait for new tasks`;

export function PersonaSettings() {
    const { settings, updateSettings } = useSettingsStore();
    const [localPrompt, setLocalPrompt] = useState(settings.systemPrompt || '');
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        setLocalPrompt(settings.systemPrompt || '');
    }, [settings.systemPrompt]);

    const handleSave = () => {
        updateSettings({ systemPrompt: localPrompt });
        setIsDirty(false);
    };

    const handleReset = () => {
        setLocalPrompt(DEFAULT_SYSTEM_PROMPT);
        setIsDirty(true);
    };

    return (
        <div className="max-w-4xl h-full flex flex-col space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100 mb-1">个性化提示词 (Persona)</h2>
                    <p className="text-sm text-slate-500 dark:text-gray-400">定义 Agent 的身份、行为准则和回复风格</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                    >
                        <RotateCcw size={14} />
                        恢复默认
                    </button>
                    <button
                        disabled={!isDirty}
                        onClick={handleSave}
                        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${isDirty
                                ? "bg-indigo-600 text-white shadow-md hover:bg-indigo-700"
                                : "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-zinc-600 cursor-not-allowed"
                            }`}
                    >
                        保存修改
                    </button>
                </div>
            </div>

            {/* Prompt Editor */}
            <div className="flex-1 flex flex-col bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                    <Sparkles size={16} className="text-indigo-500" />
                    <span className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">System Prompt</span>
                </div>
                <textarea
                    value={localPrompt}
                    onChange={(e) => {
                        setLocalPrompt(e.target.value);
                        setIsDirty(true);
                    }}
                    placeholder="输入系统提示词以自定义 Agent 的行为..."
                    className="flex-1 w-full p-6 bg-transparent text-sm text-slate-700 dark:text-gray-300 font-mono leading-relaxed focus:outline-none resize-none"
                    spellCheck={false}
                />
            </div>

            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200/50 dark:border-amber-500/20 rounded-xl p-4 flex items-start gap-3 shrink-0">
                <div className="mt-0.5 text-amber-500">
                    <UserCircle size={18} />
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">专家提示</h4>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/60 leading-normal mt-1">
                        系统提示词是 Agent 的“灵魂”。你可以通过修改它来改变 Agent 的工作语言（如强制使用某种语言）、工作风格（如简洁或详尽）以及它对工具使用的优先级。改动将在下一次开启对话时生效。
                    </p>
                </div>
            </div>
        </div>
    );
}
