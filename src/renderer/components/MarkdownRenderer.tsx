import React, { useState, lazy, Suspense } from 'react'
import { Copy, Check, ChevronDown, ChevronRight, Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSettingsStore } from '../store/useSettingsStore'
import { cn } from '../utils/cn'

const MermaidBlock = lazy(() => import('./MermaidBlock'))
const SvgBlock = lazy(() => import('./SvgBlock').then(m => ({ default: m.SvgBlock })))

// ── Sub-components ──────────────────────────────────────────────────

export function CopyButton({ text, className }: { text: string, className?: string }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <button
            onClick={handleCopy}
            className={cn(
                "p-1.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300",
                className
            )}
            title="Copy"
        >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
    )
}

export function ThinkingBlock({ content, isComplete }: { content: string; isComplete: boolean }) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="not-prose my-3">
            <div
                className="inline-flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Brain size={14} className={cn("text-slate-500 dark:text-zinc-500", !isComplete && "animate-pulse")} />
                <span className="text-[13px] text-slate-500 dark:text-zinc-500 font-medium">
                    {isComplete ? '思考过程' : '正在思考'}
                </span>
                {isExpanded ? (
                    <ChevronDown size={14} className="text-slate-400 shrink-0 ml-0.5" />
                ) : (
                    <ChevronRight size={14} className="text-slate-400 shrink-0 ml-0.5" />
                )}
            </div>
            {isExpanded && (
                <div className="mt-2 border-l-2 border-slate-200 dark:border-white/10 pl-4 py-1 overflow-hidden">
                    <div className="text-[13.5px] leading-[1.7] text-slate-600 dark:text-zinc-400 whitespace-pre-wrap select-text">
                        {content.trimStart()}
                        {!isComplete && (
                            <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-500/40 streaming-cursor" />
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Markdown Code Block ─────────────────────────────────────────────

/** Context for passing streaming state into deeply nested code blocks */
const MarkdownContext = React.createContext<{ isStreaming: boolean; rawContent: string }>({
    isStreaming: false,
    rawContent: '',
})

function MarkdownCodeBlock({ node, className, children, ...props }: any) {
    const { isStreaming, rawContent } = React.useContext(MarkdownContext);
    const theme = useSettingsStore(s => s.settings.theme);
    const syntaxTheme = theme === 'dark' ? vscDarkPlus : oneLight;

    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    const isBlock = !!className || codeString.includes('\n');

    if (isBlock && match && match[1] === 'thinking') {
        const isThinkingComplete = /```thinking[\s\S]*?```/.test(rawContent || '');
        return <ThinkingBlock content={codeString} isComplete={isThinkingComplete} />
    }

    if (isBlock && match && match[1] === 'mermaid') {
        const isMermaidComplete = /```mermaid[\s\S]*?```/.test(rawContent || '');
        if (isStreaming && !isMermaidComplete) {
            return (
                <div className="not-prose group/code rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
                    <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                        <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase tracking-tight">mermaid</span>
                    </div>
                    <pre className="m-0 p-5 overflow-x-auto font-mono text-[12.5px] leading-[1.65] text-slate-800 dark:text-zinc-300">
                        <code>{codeString}</code>
                        <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-500/50 animate-pulse" />
                    </pre>
                </div>
            )
        }
        return (
            <Suspense fallback={
                <div className="not-prose rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 p-8 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-zinc-500">
                        <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                        <span>Loading Mermaid...</span>
                    </div>
                </div>
            }>
                <MermaidBlock code={codeString} />
            </Suspense>
        )
    }

    if (isBlock && match && match[1] === 'svg') {
        const isSvgComplete = /```svg[\s\S]*?```/.test(rawContent || '')
        if (isStreaming && !isSvgComplete) {
            return (
                <div className="not-prose group/code rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
                    <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                        <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase tracking-tight">svg</span>
                    </div>
                    <pre className="m-0 p-5 overflow-x-auto font-mono text-[12.5px] leading-[1.65] text-slate-800 dark:text-zinc-300">
                        <code>{codeString}</code>
                        <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-500/50 streaming-cursor" />
                    </pre>
                </div>
            )
        }
        return (
            <Suspense fallback={
                <div className="not-prose rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 p-8 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-zinc-500">
                        <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                        <span>Loading SVG...</span>
                    </div>
                </div>
            }>
                <SvgBlock code={codeString} />
            </Suspense>
        )
    }

    if (isBlock && isStreaming) {
        return (
            <div className="not-prose group/code rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
                <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                    <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase tracking-tight">{match?.[1] || 'code'}</span>
                </div>
                <pre className="m-0 p-5 overflow-x-auto font-mono text-[12.5px] leading-[1.65] text-slate-800 dark:text-zinc-300">
                    <code>{codeString}</code>
                    <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-500/50 streaming-cursor" />
                </pre>
            </div>
        )
    }

    return isBlock ? (
        <div className="not-prose group/code rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
            <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase tracking-tight">{match?.[1] || 'code'}</span>
                <div className="opacity-0 group-hover/code:opacity-100 transition-opacity duration-200">
                    <CopyButton text={codeString} className="p-1 hover:bg-slate-200 dark:hover:bg-white/10" />
                </div>
            </div>
            <SyntaxHighlighter
                style={syntaxTheme}
                language={match?.[1] || 'text'}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    padding: '1.25rem',
                    background: 'transparent',
                    fontSize: '12.5px',
                    lineHeight: '1.65',
                    letterSpacing: '-0.01em'
                }}
                {...props}
            >
                {codeString}
            </SyntaxHighlighter>
        </div>
    ) : (
        <code className={cn("bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded text-indigo-700 dark:text-indigo-300 font-mono text-[0.85em] font-medium", className)} {...props}>
            {children}
        </code>
    )
}

// ── Shared prose styles ─────────────────────────────────────────────

const PROSE_CLASS = `select-text prose prose-slate dark:prose-invert max-w-none
text-slate-900 dark:text-zinc-100
prose-p:text-[14px] prose-p:leading-[1.78] prose-p:my-3 prose-p:last:mb-0
prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-slate-950 dark:prose-headings:text-white
prose-h1:text-[1.15rem] prose-h1:mt-6 prose-h1:mb-3
prose-h2:text-[1.02rem] prose-h2:mt-5 prose-h2:mb-2.5
prose-h3:text-[14px] prose-h3:mt-4 prose-h3:mb-2
prose-ul:my-3 prose-ul:list-disc prose-ul:pl-6 prose-ul:text-[14px] prose-ul:leading-[1.78]
prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-6 prose-ol:text-[14px] prose-ol:leading-[1.78]
prose-li:my-1.5 prose-li:pl-1
prose-li:prose-p:my-0
prose-li:marker:text-indigo-500 dark:prose-li:marker:text-indigo-400
prose-strong:text-slate-900 dark:prose-strong:text-zinc-100 prose-strong:font-bold
prose-hr:border-slate-200 dark:prose-hr:border-white/10 prose-hr:my-8
prose-blockquote:border-l-4 prose-blockquote:border-indigo-500/20 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-[13.5px] prose-blockquote:leading-[1.75] prose-blockquote:text-slate-600 dark:prose-blockquote:text-zinc-400 prose-blockquote:my-4
prose-code:text-indigo-700 dark:prose-code:text-indigo-300 prose-code:bg-indigo-50 dark:prose-code:bg-indigo-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none
prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0`

const MarkdownComponents: any = {
    p: ({ children }: any) => <p>{children}</p>,
    ul: ({ className, ...props }: any) => <ul className={cn("list-disc pl-6 my-3 space-y-1", className)} {...props} />,
    ol: ({ className, ...props }: any) => <ol className={cn("list-decimal pl-6 my-3 space-y-1", className)} {...props} />,
    li: ({ className, ...props }: any) => <li className={cn("pl-1 marker:text-indigo-500 dark:marker:text-indigo-400", className)} {...props} />,
    hr: (props: any) => <hr className="my-10" {...props} />,
    pre: ({ children }: any) => <>{children}</>,
    code: MarkdownCodeBlock,
}

// ── Main Component ──────────────────────────────────────────────────

interface MarkdownRendererProps {
    /** Raw markdown string to render */
    content: string
    /** Whether the content is still being streamed (enables streaming cursor, incomplete block detection) */
    isStreaming?: boolean
    /** The original raw content before preprocessing — used for detecting complete code blocks during streaming */
    rawContent?: string
    /** Additional class names for the container */
    className?: string
}

/**
 * Unified markdown renderer with:
 * - GFM support (tables, autolinks, strikethrough)
 * - Syntax-highlighted code blocks (copy button, streaming cursor)
 * - Mermaid & SVG diagram rendering
 * - Thinking block rendering
 */
export function MarkdownRenderer({ content, isStreaming = false, rawContent, className }: MarkdownRendererProps) {
    const ctxValue = React.useMemo(
        () => ({ isStreaming, rawContent: rawContent ?? content }),
        [isStreaming, rawContent, content]
    )

    return (
        <div className={cn(PROSE_CLASS, className)}>
            <MarkdownContext.Provider value={ctxValue}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={MarkdownComponents}
                >
                    {content}
                </ReactMarkdown>
            </MarkdownContext.Provider>
        </div>
    )
}
