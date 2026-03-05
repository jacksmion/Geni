import React, { useRef, useEffect, useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { FileCode, Terminal as TerminalIcon, X, Copy, Check } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export const ArtifactPanel: React.FC = () => {
    const { activeArtifact, setActiveArtifact } = useChatStore();
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
        <div className="w-full h-full flex flex-col bg-[#0d1117] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 h-11 px-4 bg-[#161b22] border-b border-white/10">
                <div className="flex items-center gap-2.5 overflow-hidden">
                    {isBash ? (
                        <TerminalIcon size={15} className="text-emerald-400 shrink-0" />
                    ) : (
                        <FileCode size={15} className="text-blue-400 shrink-0" />
                    )}
                    <span className="text-[12.5px] font-mono text-slate-200 truncate">
                        {activeArtifact.path || 'Generating...'}
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500 bg-white/5 rounded px-1.5 py-0.5 ml-2">
                        {activeArtifact.toolName}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Copy content"
                    >
                        {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                    <button
                        onClick={() => setActiveArtifact(null)}
                        className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Close preview"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* Editor Body */}
            <div className="flex-1 overflow-auto relative bg-[#0d1117] select-text" ref={scrollRef}>
                <SyntaxHighlighter
                    language={language}
                    style={vscDarkPlus}
                    customStyle={{
                        margin: 0,
                        padding: '1.25rem',
                        background: 'transparent',
                        fontSize: '13px',
                        lineHeight: '1.6',
                    }}
                    showLineNumbers={true}
                    wrapLines={true}
                >
                    {activeArtifact.content || ' '}
                </SyntaxHighlighter>
                <div className="h-10" /> {/* Bottom padding */}
            </div>
        </div>
    );
};
