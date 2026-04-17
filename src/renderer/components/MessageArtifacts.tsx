import React from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import { MessageArtifact } from '../../common/types/chat';
import { useChatStore } from '../store/useChatStore';

interface MessageArtifactsProps {
    artifacts: MessageArtifact[];
}

export function MessageArtifacts({ artifacts }: MessageArtifactsProps) {
    if (artifacts.length === 0) return null;

    const resolveArtifactPath = (filePath: string): string => {
        const isAbsolute = /^(?:[A-Za-z]:[\\/]|\/)/.test(filePath);
        if (isAbsolute) return filePath;

        const sessionId = useChatStore.getState().activeSessionId;
        const workspace = useChatStore.getState().sessions[sessionId]?.workspacePath;
        if (!workspace) return filePath;

        const base = workspace.replace(/\\/g, '/').replace(/\/+$/, '');
        return `${base}/${filePath.replace(/^\.\//, '')}`;
    };

    const handleOpen = async (artifact: MessageArtifact) => {
        const resolvedPath = resolveArtifactPath(artifact.path);
        if (/^(?:[A-Za-z]:[\\/]|\/)/.test(resolvedPath)) {
            try {
                await window.electronAPI.system.addAllowedPath(resolvedPath);
            } catch {
                // Ignore allow-list failures here and let the open/preview action handle fallback behavior.
            }
        }

        if (artifact.openMode === 'external') {
            window.electronAPI.system.openExplorer(resolvedPath);
            return;
        }

        const ext = artifact.ext.toLowerCase();
        if (ext === 'html' || ext === 'htm' || ext === 'pdf') {
            window.electronAPI.system.createArtifactPreview(resolvedPath).then(result => {
                if (result) {
                    useChatStore.getState().setActiveArtifact({
                        ...result,
                        toolName: artifact.sourceTool || 'preview',
                    });
                }
            });
            return;
        }

        window.electronAPI.system.readTextFile(resolvedPath).then(result => {
            if (result) {
                useChatStore.getState().setActiveArtifact({
                    toolName: artifact.sourceTool || 'preview',
                    path: result.path,
                    kind: 'text',
                    content: result.content,
                });
            }
        });
    };

    return (
        <div className="mt-4 flex flex-col gap-2">
            {artifacts.map((artifact) => (
                <button
                    key={artifact.path}
                    onClick={() => handleOpen(artifact)}
                    className="w-full text-left rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-[#111214] px-4 py-3 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-100/80 dark:hover:bg-[#15161a] transition-colors"
                    title={artifact.path}
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10">
                                <FileText size={16} className="text-blue-500" />
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-[13px] font-medium text-slate-800 dark:text-zinc-100">
                                    {artifact.name}
                                </div>
                                <div className="truncate text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                                    {artifact.path}
                                </div>
                            </div>
                        </div>
                        <div className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[11px] text-slate-600 dark:text-zinc-300">
                            <span>{artifact.openMode === 'external' ? 'Open' : 'Preview'}</span>
                            <ExternalLink size={12} />
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
}
