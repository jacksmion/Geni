import React from 'react';
import { Check, RotateCcw, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

interface SaveStatusBarProps {
    isDirty: boolean;
    isSaving: boolean;
    onSave: () => void;
    onReset: () => void;
    message?: string;
}

export const SaveStatusBar: React.FC<SaveStatusBarProps> = ({
    isDirty,
    isSaving,
    onSave,
    onReset,
    message
}) => {
    const { t } = useTranslation();

    if (!isDirty && !isSaving) return null;

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-500 ease-out">
            <div className="flex items-center gap-2 p-1.5 pl-4 bg-white/70 dark:bg-[#1c1c1f]/80 backdrop-blur-2xl border border-slate-200/60 dark:border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                <div className="flex items-center gap-2 pr-3 mr-1 border-r border-slate-200 dark:border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse" />
                    <span className="ui-text-meta font-medium text-slate-600 dark:text-zinc-400 whitespace-nowrap">
                        {message || t('settings.unsavedChanges')}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={onReset}
                        disabled={isSaving}
                        className="ui-text-meta flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-all disabled:opacity-50"
                    >
                        <RotateCcw size={12} />
                        {t('settings.reset')}
                    </button>
                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className="ui-text-meta flex min-w-[70px] items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-1.5 font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:shadow-none"
                    >
                        {isSaving ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Check size={13} strokeWidth={3} />
                                {t('settings.save')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}; 
