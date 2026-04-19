import React, { useState, useEffect } from 'react';
import { Sparkles, RotateCcw, Fingerprint, Heart, User } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

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

type TabId = 'identity' | 'soul' | 'user' | 'prompt';

export function PersonaSettings() {
    const systemPrompt = useSettingsStore(s => s.settings.systemPrompt);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();

    const [activeTab, setActiveTab] = useState<TabId>('identity');
    const [profileContents, setProfileContents] = useState<Record<string, string>>({
        identity: '',
        soul: '',
        user: ''
    });
    const [localPrompt, setLocalPrompt] = useState(systemPrompt || '');
    const [isDirty, setIsDirty] = useState(false);
    const [loading, setLoading] = useState(true);
    const [prevSystemPrompt, setPrevSystemPrompt] = useState(systemPrompt);

    // Sync external system prompt changes
    if (systemPrompt !== prevSystemPrompt) {
        setLocalPrompt(systemPrompt || '');
        setPrevSystemPrompt(systemPrompt);
    }

    // Load profile files on mount
    useEffect(() => {
        const loadProfiles = async () => {
            try {
                const [identity, soul, user] = await Promise.all([
                    window.electronAPI.system.readProfileFile('IDENTITY'),
                    window.electronAPI.system.readProfileFile('SOUL'),
                    window.electronAPI.system.readProfileFile('USER'),
                ]);
                setProfileContents({ identity: identity || '', soul: soul || '', user: user || '' });
            } catch (error) {
                console.error('Failed to load profile files:', error);
            } finally {
                setLoading(false);
            }
        };
        loadProfiles();
    }, []);

    const handleProfileChange = (key: string, value: string) => {
        setProfileContents(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
    };

    const handlePromptChange = (value: string) => {
        setLocalPrompt(value);
        setIsDirty(true);
    };

    const handleSave = async () => {
        try {
            // Save profile files
            await Promise.all([
                window.electronAPI.system.writeProfileFile('IDENTITY', profileContents.identity),
                window.electronAPI.system.writeProfileFile('SOUL', profileContents.soul),
                window.electronAPI.system.writeProfileFile('USER', profileContents.user),
            ]);
            // Save system prompt
            await updateSettings({ systemPrompt: localPrompt });
            setIsDirty(false);
        } catch (error) {
            console.error('Failed to save persona settings:', error);
        }
    };

    const handleReset = () => {
        if (activeTab === 'prompt') {
            setLocalPrompt(DEFAULT_SYSTEM_PROMPT);
        } else {
            setProfileContents(prev => ({ ...prev, [activeTab]: '' }));
        }
        setIsDirty(true);
    };

    const tabs: { id: TabId; icon: React.ReactNode; label: string }[] = [
        { id: 'identity', icon: <Fingerprint size={14} />, label: t('personaSettings.tabs.identity') },
        { id: 'soul', icon: <Heart size={14} />, label: t('personaSettings.tabs.soul') },
        { id: 'user', icon: <User size={14} />, label: t('personaSettings.tabs.user') },
        { id: 'prompt', icon: <Sparkles size={14} />, label: t('personaSettings.tabs.prompt') },
    ];

    const getTabContent = () => {
        switch (activeTab) {
            case 'identity':
                return {
                    title: t('personaSettings.identity.title'),
                    desc: t('personaSettings.identity.desc'),
                    placeholder: t('personaSettings.identity.placeholder'),
                    value: profileContents.identity,
                    onChange: (v: string) => handleProfileChange('identity', v),
                };
            case 'soul':
                return {
                    title: t('personaSettings.soul.title'),
                    desc: t('personaSettings.soul.desc'),
                    placeholder: t('personaSettings.soul.placeholder'),
                    value: profileContents.soul,
                    onChange: (v: string) => handleProfileChange('soul', v),
                };
            case 'user':
                return {
                    title: t('personaSettings.user.title'),
                    desc: t('personaSettings.user.desc'),
                    placeholder: t('personaSettings.user.placeholder'),
                    value: profileContents.user,
                    onChange: (v: string) => handleProfileChange('user', v),
                };
            case 'prompt':
                return {
                    title: 'System Prompt',
                    desc: t('personaSettings.expertDesc'),
                    placeholder: t('personaSettings.promptPlaceholder'),
                    value: localPrompt,
                    onChange: handlePromptChange,
                };
        }
    };

    const content = getTabContent();

    if (loading) {
        return (
            <div className="max-w-4xl h-full flex items-center justify-center">
                <div className="ui-text-meta text-slate-400">{t('skillSettings.loading')}</div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl h-full flex flex-col space-y-4 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <p className="ui-text-meta text-slate-500 dark:text-gray-400">{t('personaSettings.desc')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className="ui-text-meta flex items-center gap-1.5 px-3 py-1.5 font-medium text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                    >
                        <RotateCcw size={14} />
                        {t('personaSettings.reset')}
                    </button>
                    <button
                        disabled={!isDirty}
                        onClick={handleSave}
                        className={`ui-text-meta px-3 py-1.5 rounded-lg font-semibold transition-all ${isDirty
                            ? "bg-indigo-600 text-white shadow-md hover:bg-indigo-700"
                            : "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-zinc-600 cursor-not-allowed"
                            }`}
                    >
                        {t('personaSettings.save')}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-xl shrink-0">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={clsx(
                            "ui-text-meta flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-all",
                            activeTab === tab.id
                                ? "bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm"
                                : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Editor */}
            <div className="flex-1 flex flex-col bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm min-h-0">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] shrink-0">
                    <h3 className="ui-text-meta font-semibold text-slate-700 dark:text-gray-200">{content.title}</h3>
                    <p className="ui-text-meta mt-0.5 text-slate-400 dark:text-gray-500">{content.desc}</p>
                </div>
                <textarea
                    value={content.value}
                    onChange={(e) => content.onChange(e.target.value)}
                    placeholder={content.placeholder}
                    className="ui-text-code flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-slate-700 focus:outline-none dark:text-gray-300"
                    spellCheck={false}
                />
            </div>
        </div>
    );
}
