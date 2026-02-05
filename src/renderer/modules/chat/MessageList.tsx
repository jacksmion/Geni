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

function MessageItem({ message }: { message: ChatMessage }) {
    const isUser = message.role === 'user'

    return (
        <div className={cn(
            "flex gap-5 group animate-in slide-in-from-bottom-2 duration-500 fade-in",
            isUser && "flex-row-reverse"
        )}>
            {/* Avatar */}
            <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/10",
                isUser
                    ? "bg-indigo-600 shadow-indigo-500/20"
                    : "bg-white dark:bg-zinc-800 shadow-sm"
            )}>
                {isUser ? <User size={20} className="text-white" /> : <Bot size={20} className="text-indigo-600 dark:text-indigo-400" />}
            </div>

            {/* Content */}
            <div className={cn("max-w-[85%] space-y-2 min-w-0", isUser && "items-end flex flex-col")}>

                {/* Helper for Assistant: Thoughts/Tools */}
                {!isUser && message.steps && message.steps.length > 0 && (
                    <div className="w-full mb-2">
                        <ThoughtTrace steps={message.steps} />
                    </div>
                )}

                {/* Message Bubble */}
                <div className={cn(
                    "p-6 rounded-3xl shadow-sm border leading-relaxed text-[15px] overflow-hidden",
                    isUser
                        ? "bg-indigo-600 border-indigo-500 rounded-tr-none text-white shadow-indigo-900/10"
                        : "bg-white dark:bg-[#1A1A1A]/80 border-slate-200 dark:border-white/5 rounded-tl-none text-slate-700 dark:text-gray-200 shadow-black/5"
                )}>
                    {isUser ? (
                        <div className="whitespace-pre-wrap font-sans tracking-wide text-white/95">{message.content}</div>
                    ) : (
                        <div className="prose prose-slate dark:prose-invert max-w-none 
                            prose-headings:font-semibold prose-headings:tracking-tight 
                            prose-p:leading-7 prose-p:mb-4
                            prose-li:my-1
                            prose-strong:font-semibold
                            prose-pre:p-0 prose-pre:bg-transparent prose-pre:my-4 prose-pre:border-none">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    code({ node, inline, className, children, ...props }: any) {
                                        const match = /language-(\w+)/.exec(className || '')
                                        const codeString = String(children).replace(/\n$/, '')
                                        return !inline && match ? (
                                            <div className="rounded-lg overflow-hidden my-2 border border-slate-200 dark:border-white/10 shadow-sm bg-slate-50 dark:bg-[#1e1e1e]">
                                                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                                                    <span className="text-xs text-slate-500 dark:text-gray-400 font-mono">{match[1]}</span>
                                                    <CopyButton text={codeString} className="p-1" />
                                                </div>
                                                <SyntaxHighlighter
                                                    style={vscDarkPlus}
                                                    language={match[1]}
                                                    PreTag="div"
                                                    customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
                                                    {...props}
                                                >
                                                    {codeString}
                                                </SyntaxHighlighter>
                                            </div>
                                        ) : (
                                            <code className={cn("bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-rose-500 dark:text-amber-200 font-mono text-[0.9em]", className)} {...props}>
                                                {children}
                                            </code>
                                        )
                                    }
                                }}
                            >
                                {message.content}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>

                {/* Meta Info */}
                <div className={cn(
                    "flex items-center gap-2 text-[10px] text-gray-500 font-medium px-1 opacity-0 group-hover:opacity-100 transition-opacity",
                    isUser ? "flex-reverse justify-end" : ""
                )}>
                    {!isUser && <span>AI Assistant · {new Date(message.timestamp).toLocaleTimeString()}</span>}
                    <CopyButton text={message.content} className="p-0.5" />
                    {isUser && <span>{new Date(message.timestamp).toLocaleTimeString()} · You</span>}
                </div>
            </div>
        </div>
    )
}

