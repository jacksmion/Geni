import React, { useState, lazy, Suspense } from 'react'
import { Copy, Check, ChevronDown, ChevronRight, Brain, ExternalLink, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSettingsStore } from '../store/useSettingsStore'
import { useChatStore } from '../store/useChatStore'
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

// ── Streaming code placeholder (shared by mermaid/svg/generic streaming) ──

function StreamingCodePlaceholder({ label, code, animated }: { label: string; code: string; animated?: boolean }) {
    return (
        <div className="not-prose group/code rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
            <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase tracking-tight">{label}</span>
            </div>
            <pre className="m-0 p-5 overflow-x-auto font-mono text-[12.5px] leading-[1.65] text-slate-800 dark:text-zinc-300">
                <code>{code}</code>
                <span className={cn(
                    "inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-500/50",
                    animated ? "animate-pulse" : "streaming-cursor"
                )} />
            </pre>
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
    const lang = match?.[1] || '';

    if (isBlock && lang === 'thinking') {
        const isThinkingComplete = /```thinking[\s\S]*?```/.test(rawContent || '');
        return <ThinkingBlock content={codeString} isComplete={isThinkingComplete} />
    }

    if (isBlock && lang === 'mermaid') {
        const isMermaidComplete = /```mermaid[\s\S]*?```/.test(rawContent || '');
        if (isStreaming && !isMermaidComplete) {
            return <StreamingCodePlaceholder label="mermaid" code={codeString} animated />
        }
        return (
            <Suspense fallback={<LoadingFallback label="Mermaid" />}>
                <MermaidBlock code={codeString} />
            </Suspense>
        )
    }

    if (isBlock && lang === 'svg') {
        const isSvgComplete = /```svg[\s\S]*?```/.test(rawContent || '')
        if (isStreaming && !isSvgComplete) {
            return <StreamingCodePlaceholder label="svg" code={codeString} />
        }
        return (
            <Suspense fallback={<LoadingFallback label="SVG" />}>
                <SvgBlock code={codeString} />
            </Suspense>
        )
    }

    if (isBlock && isStreaming) {
        return <StreamingCodePlaceholder label={lang || 'code'} code={codeString} />
    }

    return isBlock ? (
        <div className="not-prose group/code rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
            <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase tracking-tight">{lang || 'code'}</span>
                <div className="opacity-0 group-hover/code:opacity-100 transition-opacity duration-200">
                    <CopyButton text={codeString} className="p-1 hover:bg-slate-200 dark:hover:bg-white/10" />
                </div>
            </div>
            <SyntaxHighlighter
                style={syntaxTheme}
                language={lang || 'text'}
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

function LoadingFallback({ label }: { label: string }) {
    return (
        <div className="not-prose rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 p-8 flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-zinc-500">
                <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span>Loading {label}...</span>
            </div>
        </div>
    )
}

// ── Link handler ────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
    'md', 'markdown', 'txt', 'log',
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
    'html', 'htm', 'css', 'scss', 'less', 'vue', 'svelte',
    'json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf', 'env',
    'sh', 'bash', 'zsh', 'fish', 'bat', 'ps1',
    'sql', 'graphql', 'proto',
    'dockerfile', 'gitignore', 'editorconfig', 'prettierrc', 'eslintrc',
    'lua', 'r', 'pl', 'ex', 'exs', 'erl', 'clj', 'hs', 'ml', 'fs',
])

function isLocalFilePath(href: string): boolean {
    if (!href) return false
    // file:// protocol
    if (href.startsWith('file:///')) return true
    // Absolute paths (Unix / or Windows drive letter)
    if (/^\/[a-zA-Z]/.test(href)) return true
    if (/^[A-Za-z]:[\\\/]/.test(href)) return true
    // Relative paths with extension (./foo.ts, ../bar.md, src/baz.js)
    if (/^\.{0,2}[\/\\][^\s]+\.\w+$/.test(href)) return true
    // Bare filename with known text extension
    const ext = href.split('.').pop()?.toLowerCase()
    if (ext && TEXT_EXTENSIONS.has(ext) && !href.includes('://')) return true
    return false
}

function getFileExtension(href: string): string {
    const cleaned = href.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '')
    const ext = cleaned.split('.').pop()?.toLowerCase() || ''
    return ext
}

function MarkdownLink({ href, children, ...props }: any) {
    // HTTP links → open in external browser
    if (href && /^https?:\/\//.test(href)) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 dark:text-indigo-400 hover:underline decoration-indigo-400/30 underline-offset-2 inline-flex items-center gap-0.5"
                {...props}
            >
                {children}
                <ExternalLink size={11} className="shrink-0 opacity-50" />
            </a>
        )
    }

    // Local file paths → ArtifactPanel (text) or system app (other)
    if (href && isLocalFilePath(href)) {
        const handleClick = (e: React.MouseEvent) => {
            e.preventDefault()
            let resolvedPath = href.startsWith('file:///') ? decodeURIComponent(href.replace(/^file:\/\/\//, '/')) : href

            // Resolve relative paths against the current session's workspace
            const isAbsolute = /^(?:[A-Za-z]:[\\/]|\/)/.test(resolvedPath)
            if (!isAbsolute) {
                const sessionId = useChatStore.getState().activeSessionId
                const workspace = useChatStore.getState().sessions[sessionId]?.workspacePath
                if (workspace) {
                    // Normalize to forward slashes and join
                    const base = workspace.replace(/\\/g, '/').replace(/\/+$/, '')
                    resolvedPath = base + '/' + resolvedPath.replace(/^\.\//, '')
                }
            }

            const ext = getFileExtension(resolvedPath)

            if (TEXT_EXTENSIONS.has(ext)) {
                // Read file and show in ArtifactPanel
                window.electronAPI.system.readTextFile(resolvedPath).then((result: { content: string; path: string } | null) => {
                    if (result) {
                        useChatStore.getState().setActiveArtifact({
                            toolName: 'preview',
                            path: result.path,
                            content: result.content,
                        })
                    }
                })
            } else {
                // Open with system default app
                window.electronAPI.system.openExplorer(resolvedPath)
            }
        }

        return (
            <button
                onClick={handleClick}
                className="text-indigo-600 dark:text-indigo-400 hover:underline decoration-indigo-400/30 underline-offset-2 inline-flex items-center gap-0.5 cursor-pointer"
                title={href}
                {...props}
            >
                {children}
                <FileText size={11} className="shrink-0 opacity-50" />
            </button>
        )
    }

    return <a href={href} {...props}>{children}</a>
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
prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0
prose-table:my-4 prose-table:w-full prose-table:border-collapse
prose-th:border prose-th:border-slate-200 dark:prose-th:border-white/10 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-[13px] prose-th:font-semibold prose-th:bg-slate-50 dark:prose-th:bg-white/5 prose-th:text-slate-700 dark:prose-th:text-zinc-300
prose-td:border prose-td:border-slate-200 dark:prose-td:border-white/10 prose-td:px-3 prose-td:py-2 prose-td:text-[13.5px] prose-td:text-slate-600 dark:prose-td:text-zinc-400`

const MarkdownComponents: any = {
    p: ({ children }: any) => <p>{children}</p>,
    ul: ({ className, ...props }: any) => <ul className={cn("list-disc pl-6 my-3 space-y-1", className)} {...props} />,
    ol: ({ className, ...props }: any) => <ol className={cn("list-decimal pl-6 my-3 space-y-1", className)} {...props} />,
    li: ({ className, checked, children, ...props }: any) => {
        if (checked !== undefined) {
            return (
                <li className={cn("pl-1 flex items-start gap-2", className)} {...props}>
                    <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="mt-1 h-3.5 w-3.5 rounded border-slate-300 dark:border-zinc-600 text-indigo-500 focus:ring-indigo-500/30 cursor-default shrink-0 accent-indigo-500"
                    />
                    <span className="flex-1 min-w-0">{children}</span>
                </li>
            )
        }
        return <li className={cn("pl-1 marker:text-indigo-500 dark:marker:text-indigo-400", className)} {...props}>{children}</li>
    },
    hr: (props: any) => <hr className="my-10" {...props} />,
    pre: ({ children }: any) => <>{children}</>,
    code: MarkdownCodeBlock,
    a: MarkdownLink,
    img: ({ src, alt, ...props }: any) => (
        <span className="not-prose block my-4">
            <img
                src={src}
                alt={alt || ''}
                loading="lazy"
                className="max-w-full rounded-xl border border-slate-200/50 dark:border-white/10 shadow-sm"
                {...props}
            />
        </span>
    ),
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
 * - GFM support (tables, autolinks, strikethrough, task lists)
 * - Syntax-highlighted code blocks (copy button, streaming cursor)
 * - Mermaid & SVG diagram rendering
 * - Thinking block rendering
 * - External links open in system browser
 * - Responsive images with rounded corners
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
