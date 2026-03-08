import React, { useState, useEffect } from 'react';
import { UserCircle, Sparkles, RotateCcw } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';

const DEFAULT_SYSTEM_PROMPT = `You are Geni, a highly efficient, autonomous general-purpose AI agent.
You excel at complex problem-solving, comprehensive research, data analysis, system operations, and programming.

# Core Guidelines
- Working Language: {{LANGUAGE_INFO}}
- Formatting: Speak naturally. Avoid using pure list and bullet-point formats.

# Operational Best Practices
- Utilize your tools to interact with the system, fetch data, and orchestrate complex workflows step-by-step.
- File Creation: Use \`write\` for new small/medium files. For large files (>100 lines), use \`write\` for structural layout first, then \`edit\` to fill details.
- File Updates: For existing files, ALWAYS prefer \`edit\` to perform surgical updates unless a complete rewrite is necessary.

# Task Management
- Use \`todowrite\` and \`todoread\` to track progress on multi-step tasks or complex research.
- Do NOT use Todo tools for simple Q&A, explanations, or quick single-step operations.
- Break complex goals into concrete, actionable steps. Mark tools 'in_progress' and 'completed' as you work.`;

export function PersonaSettings() {
    const systemPrompt = useSettingsStore(s => s.settings.systemPrompt);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();
    const [localPrompt, setLocalPrompt] = useState(systemPrompt || '');
    const [isDirty, setIsDirty] = useState(false);
    const [prevSystemPrompt, setPrevSystemPrompt] = useState(systemPrompt);

    if (systemPrompt !== prevSystemPrompt) {
        setLocalPrompt(systemPrompt || '');
        setPrevSystemPrompt(systemPrompt);
        setIsDirty(false);
    }

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
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100 mb-1">{t('personaSettings.title')}</h2>
                    <p className="text-sm text-slate-500 dark:text-gray-400">{t('personaSettings.desc')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                    >
                        <RotateCcw size={14} />
                        {t('personaSettings.reset')}
                    </button>
                    <button
                        disabled={!isDirty}
                        onClick={handleSave}
                        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${isDirty
                            ? "bg-indigo-600 text-white shadow-md hover:bg-indigo-700"
                            : "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-zinc-600 cursor-not-allowed"
                            }`}
                    >
                        {t('personaSettings.save')}
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
                    placeholder={t('personaSettings.promptPlaceholder')}
                    className="flex-1 w-full p-6 bg-transparent text-sm text-slate-700 dark:text-gray-300 font-mono leading-relaxed focus:outline-none resize-none"
                    spellCheck={false}
                />
            </div>

            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200/50 dark:border-amber-500/20 rounded-xl p-4 flex items-start gap-3 shrink-0">
                <div className="mt-0.5 text-amber-500">
                    <UserCircle size={18} />
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">{t('personaSettings.expertTip')}</h4>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/60 leading-normal mt-1">
                        {t('personaSettings.expertDesc')}
                    </p>
                </div>
            </div>
        </div>
    );
}
