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
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-4 px-5 py-3 bg-white/80 dark:bg-[#1c1c1f]/80 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
                <div className="flex items-center gap-2 pr-4 border-r border-slate-200 dark:border-white/10">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-xs font-bold text-slate-700 dark:text-zinc-200 whitespace-nowrap">
                        {message || t('settings.unsavedChanges', '你有未保存的更改')}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onReset}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-all disabled:opacity-50"
                    >
                        <RotateCcw size={14} />
                        {t('settings.reset', '放弃')}
                    </button>
                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:shadow-none min-w-[80px] justify-center"
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Check size={14} strokeWidth={3} />
                                {t('settings.saveAndApply', '保存并应用')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}; 
