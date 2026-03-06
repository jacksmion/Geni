import React, { useRef, useEffect, useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { FileCode, Terminal as TerminalIcon, X, Copy, Check } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useSettingsStore } from '../store/useSettingsStore';

export const ArtifactPanel: React.FC = () => {
    const { activeArtifact, setActiveArtifact } = useChatStore();
    const { settings } = useSettingsStore();
    const isDark = settings.theme === 'dark';
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isCopied, setIsCopied] = useState(false);

    // Auto-scroll to bottom as content streams in
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [activeArtifact?.content]);

    const handleCopy = () => {
        if (!activeArtifact?.content) return;
        navigator.clipboard.writeText(activeArtifact.content);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    if (!activeArtifact) return null;

    const isBash = activeArtifact.toolName === 'bash';
    const isEdit = activeArtifact.toolName === 'edit' || activeArtifact.toolName === 'replace_file_content' || activeArtifact.toolName === 'multi_replace_file_content';
    const ext = activeArtifact.path.split('.').pop() || 'text';
    let language = 'text';
    if (isBash) language = 'bash';
    else if (isEdit) language = 'diff';
    else if (ext === 'js' || ext === 'jsx') language = 'javascript';
    else if (ext === 'ts' || ext === 'tsx') language = 'typescript';
    else if (ext === 'py') language = 'python';
    else if (ext === 'json') language = 'json';
    else if (ext === 'html') language = 'html';

    return (
        <div className="w-full h-full flex flex-col bg-transparent overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 h-14 px-5 border-b border-black/5 dark:border-white/5">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 shadow-sm">
                        {isBash ? (
                            <TerminalIcon size={16} className="text-emerald-500" />
                        ) : (
                            <FileCode size={16} className="text-blue-500" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200 truncate">
                            {activeArtifact.path?.split(/[\\/]/).pop() || 'Generating...'}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono uppercase tracking-wider">
                            {activeArtifact.toolName} • {ext}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleCopy}
                        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition-all active:scale-90"
                        title="Copy content"
                    >
                        {isCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                    <button
                        onClick={() => setActiveArtifact(null)}
                        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition-all active:scale-90"
                        title="Close preview"
                    >
                        <X size={17} />
                    </button>
                </div>
            </div>

            {/* Editor Body */}
            <div className="flex-1 overflow-auto relative select-text scrollbar-thin shadow-[inset_0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-none" ref={scrollRef}>
                <SyntaxHighlighter
                    language={language}
                    style={isDark ? vscDarkPlus : prism}
                    customStyle={{
                        margin: 0,
                        padding: '1.5rem',
                        background: 'transparent',
                        fontSize: '13.5px',
                        lineHeight: '1.7',
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    }}
                    showLineNumbers={true}
                    lineNumberStyle={{
                        minWidth: '2.5em',
                        paddingRight: '1.5em',
                        color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)',
                        textAlign: 'right',
                        userSelect: 'none',
                    }}
                    wrapLines={true}
                >
                    {activeArtifact.content || ' '}
                </SyntaxHighlighter>
                <div className="h-10" />
            </div>
        </div>
    );
};
