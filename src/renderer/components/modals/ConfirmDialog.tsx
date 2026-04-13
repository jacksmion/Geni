import React, { useRef } from 'react';
import { useModalStore } from '../../store/useModalStore';
import { AlertTriangle } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export const ConfirmDialog: React.FC = () => {
    const confirmConfig = useModalStore(s => s.confirmConfig);
    const dismissConfirm = useModalStore(s => s.dismissConfirm);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleCancel = () => {
        confirmConfig?.onCancel?.();
        dismissConfirm();
    };

    // Focus trap: Tab 在对话框内循环，Escape 取消
    useFocusTrap(containerRef, !!confirmConfig, handleCancel);

    if (!confirmConfig) return null;

    const handleConfirm = () => {
        confirmConfig.onConfirm();
        dismissConfirm();
    };

    return (
        // 背景遮罩：点击不关闭（避免误触，需键盘或按钮操作）
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/10 animate-in fade-in duration-200"
            aria-modal="true"
            role="dialog"
            aria-labelledby="confirm-dialog-message"
        >
            <div
                ref={containerRef}
                className="w-full max-w-sm bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            >
                {/* Header */}
                <div className="px-5 pt-5 pb-3 flex items-center gap-3">
                    <div className="p-2 bg-red-50 dark:bg-red-500/10 rounded-lg shrink-0">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                    </div>
                    <p
                        id="confirm-dialog-message"
                        className="text-sm font-medium text-slate-800 dark:text-zinc-200"
                    >
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
                        onClick={handleConfirm}
                        className="px-3.5 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
                        autoFocus
                    >
                        {confirmConfig.confirmText ?? '确认'}
                    </button>
                </div>
            </div>
        </div>
    );
};
