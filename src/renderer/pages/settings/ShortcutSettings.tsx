import React, { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';
import { Command, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';

export function ShortcutSettings() {
    const savedShortcuts = useSettingsStore(s => s.settings.shortcuts);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();
    const [recording, setRecording] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const shortcuts = savedShortcuts || {
        'new_task': 'Ctrl+N',
        'open_settings': 'Ctrl+,',
        'toggle_sidebar': 'Ctrl+B',
        'command_palette': 'Ctrl+K'
    };

    const handleRecord = (id: string) => {
        setRecording(id);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (!recording) return;

        e.preventDefault();
        e.stopPropagation();

        const keys: string[] = [];
        if (e.ctrlKey) keys.push('Ctrl');
        if (e.shiftKey) keys.push('Shift');
        if (e.altKey) keys.push('Alt');
        if (e.metaKey) keys.push('Meta');

        // Check if it's a modifier key itself
        const isModifier = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
        
        if (!isModifier) {
            let key = e.key.toUpperCase();
            if (key === ' ') key = 'Space';
            if (key === ',') key = ','; // Keep it as is
            keys.push(key);

            const combo = keys.join('+');
            const newShortcuts = { ...shortcuts, [recording]: combo };
            updateSettings({ shortcuts: newShortcuts });
            setRecording(null);
        }
    };

    useEffect(() => {
        if (recording) {
            window.addEventListener('keydown', handleKeyDown, true);
        } else {
            window.removeEventListener('keydown', handleKeyDown, true);
        }
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [recording]);

    const items = [
        { id: 'new_task', label: t('shortcuts.new_task') },
        { id: 'open_settings', label: t('shortcuts.open_settings') },
        { id: 'toggle_sidebar', label: t('shortcuts.toggle_sidebar') },
        { id: 'command_palette', label: t('shortcuts.command_palette') },
    ];

    const handleReset = () => {
        updateSettings({
            shortcuts: {
                'new_task': 'Ctrl+N',
                'open_settings': 'Ctrl+,',
                'toggle_sidebar': 'Ctrl+B',
                'command_palette': 'Ctrl+K'
            }
        });
    };

    const handleClear = (id: string) => {
        const newShortcuts = { ...shortcuts };
        delete newShortcuts[id];
        updateSettings({ shortcuts: newShortcuts });
    };

    return (
        <div className="max-w-3xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500" ref={containerRef}>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{t('shortcuts.desc')}</p>
                </div>
                <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                    <RotateCcw size={14} />
                    {t('personaSettings.reset')}
                </button>
            </div>

            <div className="grid gap-3">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className={clsx(
                            "flex items-center justify-between p-3 rounded-xl transition-all duration-200",
                            recording === item.id
                                ? "bg-indigo-50/50 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20"
                                : "hover:bg-slate-50 dark:hover:bg-white/5"
                        )}
                    >
                        <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold text-slate-700 dark:text-gray-200">{item.label}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleRecord(item.id)}
                                className={clsx(
                                    "min-w-[100px] px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center justify-center gap-2",
                                    recording === item.id
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 animate-pulse"
                                        : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/10"
                                )}
                            >
                                {recording === item.id ? (
                                    <>
                                        <Command size={14} className="animate-spin-slow" />
                                        {t('shortcuts.record')}
                                    </>
                                ) : (
                                    shortcuts[item.id] || <span className="text-slate-400 italic">{t('shortcuts.pressKey')}</span>
                                )}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
