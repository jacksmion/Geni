import React, { useEffect, useRef } from 'react';
import { useModalStore } from '../../store/useModalStore';
import { AlertTriangle, X } from 'lucide-react';

export const ConfirmDialog: React.FC = () => {
    const confirmConfig = useModalStore(s => s.confirmConfig);
    const dismissConfirm = useModalStore(s => s.dismissConfirm);
    const confirmBtnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (confirmConfig && confirmBtnRef.current) {
            confirmBtnRef.current.focus();
        }
    }, [confirmConfig]);

    if (!confirmConfig) return null;

    const handleConfirm = () => {
        confirmConfig.onConfirm();
        dismissConfirm();
    };

    const handleCancel = () => {
        confirmConfig.onCancel?.();
        dismissConfirm();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/10 animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-5 pt-5 pb-3 flex items-center gap-3">
                    <div className="p-2 bg-red-50 dark:bg-red-500/10 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">
                        {confirmConfig.message}
                    </p>
                </div>

                {/* Actions */}
                <div className="px-5 pb-4 pt-1 flex justify-end gap-2">
                    <button
                        onClick={handleCancel}
                        className="px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors"
                    >
                        {confirmConfig.cancelText ?? '取消'}
                    </button>
                    <button
                        ref={confirmBtnRef}
                        onClick={handleConfirm}
                        className="px-3.5 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
                    >
                        {confirmConfig.confirmText ?? '确认'}
                    </button>
                </div>
            </div>
        </div>
    );
};
