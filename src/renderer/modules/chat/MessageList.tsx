import React, { useEffect, useRef, useState } from 'react'
import { Bot, User, CheckCircle2, Terminal, Copy, Check, Brain, ChevronDown, ChevronUp } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { ChatMessage } from '../../../common/types/chat'
import ThoughtTrace from '../../components/ThoughtTrace'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

export function MessageList() {
    const { sessions, activeSessionId } = useChatStore()
    const messages = sessions[activeSessionId]?.messages || []
    const endRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // 确保新消息或思考过程更新时滚动到底部
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, messages.length])

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 pb-4 space-y-8">
            {messages.filter(msg => msg.role !== 'tool').map((msg) => (
                <MessageItem key={msg.id} message={msg} />
            ))}
            <div ref={endRef} className="h-4" />
        </div>
    )
}

function CopyButton({ text, className }: { text: string, className?: string }) {
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

interface ThinkingBlockProps {
    content: string;
    isComplete: boolean;
}

function ThinkingBlock({ content, isComplete }: ThinkingBlockProps) {
    // 初始状态：如果是已完成的消息（历史记录），默认折叠；如果是正在生成（未完成），默认展开
    // 这里的 isComplete 能够区分历史消息和正在生成的消息
    const [isExpanded, setIsExpanded] = useState(!isComplete)

    // 当思考完成时，自动折叠（针对流式生成场景）
    // 使用 useRef 记录上一次的完成状态，避免重复触发
    const prevCompleteRef = useRef(isComplete)

    useEffect(() => {
        // 只有当状态从 false 变为 true 时（即生成刚结束），才自动折叠
        if (!prevCompleteRef.current && isComplete) {
            setIsExpanded(false)
        }
        prevCompleteRef.current = isComplete
    }, [isComplete])

    return (
        <div className="my-4 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-[#08080a] shadow-sm">
            <div
                className="flex items-center justify-between px-4 py-3 bg-slate-50/50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <div className="p-1 bg-indigo-100/50 dark:bg-indigo-500/20 rounded-md">
                        <Brain size={14} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <span>Deep Thinking Process</span>
                </div>
                {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </div>
            {isExpanded && (
                <div className="select-text p-4 bg-slate-50/30 dark:bg-white/[0.02] text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-white/5 font-mono whitespace-pre-wrap">
                    {content}
                    {!isComplete && (
                        <span className="inline-block w-2 h-4 ml-1 align-middle bg-indigo-500 animate-pulse" />
                    )}
                </div>
            )}
        </div>
    )
}

// Markdown 预处理器：修复大模型常见的格式不规范问题
function preprocessMarkdown(content: string) {
    if (!content) return "";

    let processed = content;

    // 1. 修复标题：确保 # 后面有空格 (例如 ###标题 -> ### 标题)
    processed = processed.replace(/^(#{1,6})([^\s#].*)$/gm, "$1 $2");

    // 2. 修复列表：确保 *、- 或数字列表后面有空格 (例如 *列表 -> * 列表)
    // 仅针对行首的列表符
    processed = processed.replace(/^([\s]*[*+-])([^\s*+-].*)$/gm, "$1 $2");
    processed = processed.replace(/^([\s]*\d+\.)([^\s\d].*)$/gm, "$1 $2");

    // 3. 修复换行：在标题和列表之前强制增加一个空行，如果前面不是空行的话
    // 这样能确保解析器能正确识别块级元素
    processed = processed.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2");
    processed = processed.replace(/([^\n])\n([\s]*[*+-\d]+\.\s)/g, "$1\n\n$2");

    return processed;
}

function MessageItem({ message }: { message: ChatMessage }) {
    const isUser = message.role === 'user'
    const content = message.content || '';
    const processedContent = !isUser ? preprocessMarkdown(content) : content;

    return (
        <div className={cn(
            "flex gap-6 max-w-full group animate-in slide-in-from-bottom-2 duration-500 fade-in",
            isUser && "justify-end"
        )}>
            {/* ... avatar code stays the same ... */}
            {!isUser && (
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/10 shadow-sm mt-1">
                    <Bot size={20} className="text-indigo-600 dark:text-indigo-400" />
                </div>
            )}

            {/* Content Container */}
            <div className={cn(
                "flex-1 min-w-0 flex flex-col",
                isUser ? "items-end" : "items-start"
            )}>
                {/* User Message Bubble - High Contrast */}
                {isUser && (
                    <div className="select-text px-5 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-slate-900 dark:text-zinc-100 text-[14.5px] font-medium leading-relaxed max-w-[85%]">
                        {content}
                    </div>
                )}

                {/* Assistant Content - Editorial Style */}
                {!isUser && (
                    <div className="w-full">
                        {/* Text Body - High Contrast Fix & Data-Centric Layout */}
                        <div className="select-text prose prose-slate dark:prose-invert max-w-none 
                            text-slate-900 dark:text-zinc-100
                            
                            /* Paragraph styling */
                            prose-p:text-[15.5px] prose-p:leading-7 prose-p:my-4 prose-p:last:mb-0
                            
                            /* Heading styling */
                            prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-slate-950 dark:prose-headings:text-white
                            prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-4
                            prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
                            prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2
                            
                            /* List styling - The Core Fix */
                            prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6
                            prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6
                            prose-li:my-1 prose-li:pl-1
                            prose-li:prose-p:my-0 /* Fixes gap in loose lists */
                            prose-li:marker:text-indigo-500 dark:prose-li:marker:text-indigo-400
                            
                            /* Other elements */
                            prose-strong:text-slate-900 dark:prose-strong:text-zinc-100 prose-strong:font-bold
                            prose-hr:border-slate-200 dark:prose-hr:border-white/10 prose-hr:my-8
                            
                            prose-blockquote:border-l-4 prose-blockquote:border-indigo-500/20 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-slate-600 dark:prose-blockquote:text-zinc-400 prose-blockquote:my-4
                            
                            prose-code:text-indigo-700 dark:prose-code:text-indigo-300 prose-code:bg-indigo-50 dark:prose-code:bg-indigo-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none
                            prose-pre:p-0 prose-pre:bg-transparent prose-pre:my-6">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    p: ({ children }) => {
                                        const childrenArray = React.Children.toArray(children);




                                        // 自动检测 Emoji 开头的行并添加间距
                                        const firstChild = childrenArray[0];
                                        if (typeof firstChild === 'string' && /^[\u{1F300}-\u{1F9FF}]/u.test(firstChild)) {
                                            return <p className="flex items-start gap-2 h-auto py-1">{children}</p>;
                                        }

                                        return <p>{children}</p>;
                                    },
                                    ul: ({ className, ...props }) => <ul className={cn("list-disc pl-6 my-3 space-y-1", className)} {...props} />,
                                    ol: ({ className, ...props }) => <ol className={cn("list-decimal pl-6 my-3 space-y-1", className)} {...props} />,
                                    li: ({ className, ...props }) => <li className={cn("pl-1 marker:text-indigo-500 dark:marker:text-indigo-400", className)} {...props} />,
                                    hr: ({ ...props }) => <hr className="my-10" {...props} />,
                                    code({ node, inline, className, children, ...props }: any) {
                                        const match = /language-(\w+)/.exec(className || '')
                                        const codeString = String(children).replace(/\n$/, '')

                                        if (!inline && match && match[1] === 'thinking') {
                                            // 检测思考块是否完整闭合
                                            // 逻辑：检查整个 message.content 中是否存在闭合的 ```thinking ... ``` 结构
                                            // 注意：这里简单判断是否存在闭合标记。更严谨的可能需要判断当前渲染的这个块是否闭合。
                                            // 由于 thinking 只有一个，我们可以用全局判断。
                                            const isThinkingComplete = /```thinking[\s\S]*?```/.test(message.content || '');

                                            return <ThinkingBlock content={codeString} isComplete={isThinkingComplete} />
                                        }

                                        return !inline && match ? (
                                            <div className="rounded-xl overflow-hidden my-8 border border-slate-200 dark:border-white/10 shadow-lg bg-slate-50 dark:bg-[#08080a]">
                                                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                                                    <span className="text-[11px] font-bold text-slate-600 dark:text-gray-400 font-mono uppercase tracking-wider">{match[1]}</span>
                                                    <CopyButton text={codeString} className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10" />
                                                </div>
                                                <SyntaxHighlighter
                                                    style={vscDarkPlus}
                                                    language={match[1]}
                                                    PreTag="div"
                                                    customStyle={{ margin: 0, padding: '1.5rem', background: 'transparent', fontSize: '13.5px', lineHeight: '1.6' }}
                                                    {...props}
                                                >
                                                    {codeString}
                                                </SyntaxHighlighter>
                                            </div>
                                        ) : (
                                            <code className={cn("bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded text-indigo-700 dark:text-indigo-300 font-mono text-[0.9em] font-semibold", className)} {...props}>
                                                {children}
                                            </code>
                                        )
                                    }
                                }}
                            >
                                {processedContent}
                            </ReactMarkdown>
                        </div>

                        {/* Thoughts/Tools */}
                        {message.steps && message.steps.length > 0 && (
                            <div className="mb-2 w-full mt-4">
                                <ThoughtTrace steps={message.steps} contextContent={message.content || ''} />
                            </div>
                        )}

                        {/* Bottom Meta & Actions */}
                        <div className={cn(
                            "flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-2 px-1 opacity-10 group-hover:opacity-100 transition-opacity",
                            isUser ? "flex-reverse" : ""
                        )}>
                            {isUser ? (
                                <>
                                    <CopyButton text={content} className="p-0.5" />
                                    <span>{new Date(message.timestamp).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · You</span>
                                </>
                            ) : (
                                <>
                                    <span>MUSE · {new Date(message.timestamp).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                    <CopyButton text={content} className="p-0.5" />
                                </>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* User Avatar - Right side */}
            {isUser && (
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-indigo-600 shadow-md shadow-indigo-500/20 text-white mt-1">
                    <User size={20} />
                </div>
            )}
        </div>
    )
}



