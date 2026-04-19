import React from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import { MessageArtifact } from '../../common/types/chat';
import { useChatStore } from '../store/useChatStore';

interface MessageArtifactsProps {
    artifacts: MessageArtifact[];
}

export function MessageArtifacts({ artifacts }: MessageArtifactsProps) {
    if (artifacts.length === 0) return null;

    const sortedArtifacts = [...artifacts].sort((a, b) => {
        const score = (artifact: MessageArtifact) => {
            const isOffice = ['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx'].includes(artifact.ext.toLowerCase());
            if (isOffice) return 0;
            if (artifact.openMode === 'external') return 1;
            return 2;
        };

        return score(a) - score(b);
    });

    const resolveArtifactPath = (filePath: string): string => {
        const isAbsolute = /^(?:[A-Za-z]:[\\/]|\/)/.test(filePath);
        if (isAbsolute) return filePath;

        const sessionId = useChatStore.getState().activeSessionId;
        const workspace = sessionId ? useChatStore.getState().sessions[sessionId]?.workspacePath : useChatStore.getState().newTaskConfig.workspacePath;
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
        <div className="mt-3 flex flex-col gap-1.5">
            {sortedArtifacts.map((artifact) => (
                <button
                    key={artifact.path}
                    onClick={() => handleOpen(artifact)}
                    className="group w-full text-left rounded-lg border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] px-3 py-2 hover:border-slate-300 dark:hover:border-white/10 hover:bg-slate-100/60 dark:hover:bg-white/[0.04] transition-colors"
                    title={artifact.path}
                >
                    <div className="flex items-center gap-2">
                        <FileText size={14} className="shrink-0 text-slate-400 dark:text-zinc-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                        <span className="truncate text-[12px] font-medium text-slate-700 dark:text-zinc-200">
                            {artifact.name}
                        </span>
                        <ExternalLink size={12} className="shrink-0 ml-auto text-slate-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </button>
            ))}
        </div>
    );
}
