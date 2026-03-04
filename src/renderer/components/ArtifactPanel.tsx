import React, { useRef, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { FileCode, X } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export const ArtifactPanel: React.FC = () => {
    const { activeArtifact, setActiveArtifact } = useChatStore();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom as content streams in
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [activeArtifact?.content]);

    if (!activeArtifact) return null;

    const ext = activeArtifact.path.split('.').pop() || 'text';
    let language = ext;
    if (ext === 'js' || ext === 'jsx') language = 'javascript';
    if (ext === 'ts' || ext === 'tsx') language = 'typescript';
    if (ext === 'py') language = 'python';

    return (
        <div className="w-full h-full flex flex-col bg-[#0d1117] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 h-11 px-4 bg-[#161b22] border-b border-white/10">
                <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileCode size={15} className="text-blue-400 shrink-0" />
                    <span className="text-[12.5px] font-mono text-slate-200 truncate">
                        {activeArtifact.path || 'Generating...'}
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500 bg-white/5 rounded px-1.5 py-0.5 ml-2">
                        {activeArtifact.toolName}
                    </span>
                </div>
                <button
                    onClick={() => setActiveArtifact(null)}
                    className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                    title="Close preview"
                >
                    <X size={15} />
                </button>
            </div>

            {/* Editor Body */}
            <div className="flex-1 overflow-auto relative bg-[#0d1117]" ref={scrollRef}>
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
