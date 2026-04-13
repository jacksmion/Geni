import React, { useRef } from 'react';
import { useModalStore } from '../../store/useModalStore';
import { ShieldAlert, Check, Clock } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export const AuthorizationModal: React.FC = () => {
    const { authRequest, showAuthModal, popAuthRequest } = useModalStore();
    const containerRef = useRef<HTMLDivElement>(null);

    const handleDeny = () => {
        if (!authRequest) return;
        window.electronAPI.agent.respondToAuthorization({
            requestId: authRequest.requestId,
            runId: authRequest.runId,
            approved: false,
        });
        popAuthRequest();
    };

    // Focus trap: Tab 在模态框内循环，Escape 拒绝
    useFocusTrap(containerRef, !!(showAuthModal && authRequest), handleDeny);

    if (!showAuthModal || !authRequest) return null;

    const handleAction = (approved: boolean, remember: boolean = false) => {
        window.electronAPI.agent.respondToAuthorization({
            requestId: authRequest.requestId,
            runId: authRequest.runId,
            approved,
            remember,
        });
        popAuthRequest();
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            aria-modal="true"
            role="dialog"
            aria-labelledby="auth-modal-title"
        >
            <div
                ref={containerRef}
                className="w-full max-w-lg bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 rounded-lg shrink-0">
                        <ShieldAlert className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                        <h3 id="auth-modal-title" className="text-lg font-semibold text-white">
                            工具执行确认
                        </h3>
                        <p className="text-xs text-amber-500/80 font-medium uppercase tracking-wider">
                            高风险操作拦截
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase">
                            请求执行工具
                        </label>
                        <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/5 font-mono text-sm text-indigo-400">
                            {authRequest.toolName}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase">
                            执行参数
                        </label>
                        <div className="max-h-40 overflow-auto p-3 bg-black/40 rounded-lg border border-white/5 font-mono text-xs text-gray-300">
                            <pre>{JSON.stringify(authRequest.args, null, 2)}</pre>
                        </div>
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
                        <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="text-amber-200 font-medium">安全提示</p>
                            <p className="text-amber-200/60 leading-relaxed mt-1">
                                {authRequest.reason}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-5 bg-white/[0.02] border-t border-white/5 flex flex-wrap gap-3 items-center justify-between">
                    <button
                        onClick={handleDeny}
                        className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors rounded-lg"
                    >
                        拒绝执行
                    </button>

                    <div className="flex gap-2">
                        <button
                            onClick={() => handleAction(true, true)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-sm font-medium border border-indigo-500/20 transition-all active:scale-95"
                        >
                            <Clock className="w-4 h-4" />
                            允许并记住 (1h)
                        </button>
                        <button
                            onClick={() => handleAction(true)}
                            autoFocus
                            className="flex items-center gap-2 px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                        >
                            <Check className="w-4 h-4" />
                            确认允许
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
