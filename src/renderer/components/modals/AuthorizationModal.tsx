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
                        <p className="ui-text-meta text-amber-500/80 font-medium uppercase tracking-wider">
                            高风险操作拦截
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="ui-text-meta font-semibold text-gray-500 uppercase">
                            请求执行工具
                        </label>
                        <div className="ui-text-code rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-indigo-400">
                            {authRequest.toolName}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="ui-text-meta font-semibold text-gray-500 uppercase">
                            执行参数
                        </label>
                        <div className="ui-text-code max-h-40 overflow-auto rounded-lg border border-white/5 bg-black/40 p-3 text-gray-300">
                            <pre>{JSON.stringify(authRequest.args, null, 2)}</pre>
                        </div>
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
                        <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="ui-text-body">
                            <p className="font-medium text-amber-200">安全提示</p>
                            <p className="mt-1 leading-relaxed text-amber-200/60">
                                {authRequest.reason}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-5 bg-white/[0.02] border-t border-white/5 flex flex-wrap gap-3 items-center justify-between">
                    <button
                        onClick={handleDeny}
                        className="ui-text-body rounded-lg px-4 py-2 font-medium text-gray-400 transition-colors hover:text-white"
                    >
                        拒绝执行
                    </button>

                    <div className="flex gap-2">
                        <button
                            onClick={() => handleAction(true, true)}
                            className="ui-text-body flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 font-medium text-indigo-400 transition-all hover:bg-indigo-500/20 active:scale-95"
                        >
                            <Clock className="w-4 h-4" />
                            允许并记住 (1h)
                        </button>
                        <button
                            onClick={() => handleAction(true)}
                            autoFocus
                            className="ui-text-body flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-2 font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-600 active:scale-95"
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
