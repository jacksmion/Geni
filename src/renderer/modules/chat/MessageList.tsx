import React, { useEffect, useRef, useState } from 'react'
import { Bot, User, CheckCircle2, Terminal, Copy, Check } from 'lucide-react'
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
        // 增加对 steps 的监听，确保思考过程更新时也能滚动到底部
        endRef.current?.scrollIntoView({ behavior: 'auto' })
    }, [messages, messages.length, messages[messages.length - 1]?.content, messages[messages.length - 1]?.steps])

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 pb-4 space-y-8">
            {messages.map((msg) => (
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
    const processedContent = !isUser ? preprocessMarkdown(message.content) : message.content;

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
                    <div className="px-5 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-slate-900 dark:text-zinc-100 text-[14.5px] font-medium leading-relaxed max-w-[85%]">
                        {message.content}
                    </div>
                )}

                {/* Assistant Content - Editorial Style */}
                {!isUser && (
                    <div className="w-full">
                        {/* Thoughts/Tools */}
                        {message.steps && message.steps.length > 0 && (
                            <div className="mb-6 w-full">
                                <ThoughtTrace steps={message.steps} />
                            </div>
                        )}

                        {/* Text Body - High Contrast Fix & Data-Centric Layout */}
                        <div className="prose prose-slate dark:prose-invert max-w-none 
                            text-slate-900 dark:text-zinc-100
                            prose-p:text-[15.5px] prose-p:leading-[1.8] prose-p:mb-5
                            
                            prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-slate-950 dark:prose-headings:text-white
                            prose-h1:text-2xl prose-h1:mt-10 prose-h1:mb-6
                            prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
                            prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
                            
                            prose-ul:my-6 prose-ul:list-disc prose-ul:pl-6
                            prose-ol:my-6 prose-ol:list-decimal prose-ol:pl-6
                            prose-li:text-[15.5px] prose-li:leading-[1.8] prose-li:my-2 prose-li:pl-1
                            prose-li:marker:text-indigo-500 dark:prose-li:marker:text-indigo-400
                            
                            prose-strong:text-black dark:prose-strong:text-white prose-strong:font-bold prose-strong:mx-0.5
                            prose-hr:border-slate-200 dark:prose-hr:border-white/10 prose-hr:my-10
                            
                            prose-blockquote:border-l-4 prose-blockquote:border-indigo-500/20 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-slate-600 dark:prose-blockquote:text-zinc-400
                            
                            prose-code:text-indigo-700 dark:prose-code:text-indigo-300 prose-code:bg-indigo-50 dark:prose-code:bg-indigo-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none
                            prose-pre:p-0 prose-pre:bg-transparent prose-pre:my-8">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    p: ({ children }) => {
                                        const childrenArray = React.Children.toArray(children);

                                        // 智能检测：是否为数据对格式 (**Key**: Value)
                                        // 逻辑：第一个子元素是 strong (Key)，第二个子元素是字符串且包含冒号 (Value 分隔)
                                        if (childrenArray.length >= 2) {
                                            const first = childrenArray[0] as any;
                                            const second = childrenArray[1] as any;

                                            if (first?.type === 'strong' && typeof second === 'string') {
                                                const hasColon = second.trim().startsWith(':') || second.trim().startsWith('：');
                                                if (hasColon) {
                                                    const valuePart = second.replace(/^[:：]\s*/, '');
                                                    const rest = childrenArray.slice(2);

                                                    return (
                                                        <div className="flex items-baseline gap-4 py-1.5 border-b border-slate-50 dark:border-white/[0.02] last:border-none group/row transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                                                            <div className="min-w-[100px] sm:min-w-[120px] text-slate-500 dark:text-zinc-500 font-medium shrink-0">
                                                                {first}
                                                            </div>
                                                            <div className="flex-1 font-variant-numeric tabular-nums text-slate-900 dark:text-zinc-100 font-semibold tracking-wide">
                                                                {valuePart}
                                                                {rest}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            }
                                        }

                                        // 自动检测 Emoji 开头的行并添加间距
                                        const firstChild = childrenArray[0];
                                        if (typeof firstChild === 'string' && /^[\u{1F300}-\u{1F9FF}]/u.test(firstChild)) {
                                            return <p className="mb-5 flex items-start gap-2 h-auto py-1">{children}</p>;
                                        }

                                        return <p className="mb-6 leading-relaxed">{children}</p>;
                                    },
                                    hr: ({ ...props }) => <hr className="my-10" {...props} />,
                                    code({ node, inline, className, children, ...props }: any) {
                                        const match = /language-(\w+)/.exec(className || '')
                                        const codeString = String(children).replace(/\n$/, '')
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
                    </div>
                )}


                {/* Bottom Meta & Actions */}
                <div className={cn(
                    "flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-2 px-1 opacity-10 group-hover:opacity-100 transition-opacity",
                    isUser ? "flex-reverse" : ""
                )}>
                    {isUser ? (
                        <>
                            <CopyButton text={message.content} className="p-0.5" />
                            <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · You</span>
                        </>
                    ) : (
                        <>
                            <span>AI Assistant · {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <CopyButton text={message.content} className="p-0.5" />
                        </>
                    )}
                </div>
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



