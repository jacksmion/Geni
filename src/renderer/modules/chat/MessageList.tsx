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
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSettingsStore } from '../../store/useSettingsStore'
import { preprocessMarkdown } from '../../utils/markdown'

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

    // Message Grouping Logic
    // Merges consecutive ReAct iterations (assistant+tool pairs) into a single visual message.
    // The final answer (assistant without tool_calls) is merged with preceding tool iterations.
    const groupedMessages = React.useMemo(() => {
        const groups: ChatMessage[] = [];
        const skipIndices = new Set<number>();

        for (let i = 0; i < messages.length; i++) {
            if (skipIndices.has(i)) continue;
            const msg = messages[i];

            // Skip standalone tool messages (handled within steps)
            if (msg.role === 'tool') continue;

            // Detect start of a ReAct chain: assistant with tool_calls
            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                // Walk forward, collecting all consecutive (assistant+tool) rounds
                const chainSteps: any[] = [...(msg.steps || [])];
                let lastContent = msg.content || '';
                let j = i + 1;

                while (j < messages.length) {
                    // Skip tool result messages
                    if (messages[j].role === 'tool') {
                        skipIndices.add(j);
                        j++;
                        continue;
                    }

                    // Next assistant message - part of the chain?
                    if (messages[j].role === 'assistant') {
                        const nextAssistant = messages[j];

                        if (nextAssistant.tool_calls && nextAssistant.tool_calls.length > 0) {
                            // Another tool call round - merge its steps and continue
                            if (nextAssistant.steps) chainSteps.push(...nextAssistant.steps);
                            if (nextAssistant.content) lastContent = nextAssistant.content;
                            skipIndices.add(j);
                            j++;
                            continue;
                        }

                        if (!nextAssistant.tool_calls && nextAssistant.content) {
                            // Final answer - merge and stop
                            lastContent = nextAssistant.content;
                            if (nextAssistant.steps) chainSteps.push(...nextAssistant.steps);
                            skipIndices.add(j);
                            break;
                        }
                    }

                    // Non-assistant, non-tool message - chain ends
                    break;
                }

                groups.push({
                    ...msg,
                    content: lastContent,
                    steps: chainSteps.length > 0 ? chainSteps : msg.steps,
                });
                continue;
            }

            groups.push(msg);
        }
        return groups;
    }, [messages]);

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 pb-4 space-y-8 min-h-full flex flex-col justify-end">
            {groupedMessages.map((msg) => (
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
    const [isExpanded, setIsExpanded] = useState(!isComplete)
    const prevCompleteRef = useRef(isComplete)

    useEffect(() => {
        if (!prevCompleteRef.current && isComplete) {
            setIsExpanded(false)
        }
        prevCompleteRef.current = isComplete
    }, [isComplete])

    return (
        <div className="my-4 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden bg-white dark:bg-[#0c0c0e]">
            <div
                className="flex items-center justify-between px-4 py-2 bg-slate-50/50 dark:bg-white/[0.02] cursor-pointer hover:bg-slate-100/80 dark:hover:bg-white/5 transition-colors select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
                    <Brain size={13} className="text-indigo-500/70" />
                    <span>Thinking Process</span>
                </div>
                {isExpanded ? <ChevronUp size={14} className="text-slate-400/70" /> : <ChevronDown size={14} className="text-slate-400/70" />}
            </div>
            {isExpanded && (
                <div className="not-prose select-text p-4 bg-slate-50/30 dark:bg-white/[0.01] text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-500 border-t border-slate-200 dark:border-white/5 font-mono whitespace-pre-wrap">
                    {content}
                    {!isComplete && (
                        <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-500/50 animate-pulse" />
                    )}
                </div>
            )}
        </div>
    )
}



function MessageItem({ message }: { message: ChatMessage }) {
    const isUser = message.role === 'user'
    const content = message.content || '';
    const processedContent = !isUser ? preprocessMarkdown(content) : content;
    const { settings } = useSettingsStore();
    const isDark = settings.theme === 'dark';
    const syntaxTheme = isDark ? vscDarkPlus : oneLight;

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
                        {/* Thoughts/Tools */}
                        {message.steps && message.steps.length > 0 && (
                            <div className="mb-4 w-full">
                                <ThoughtTrace steps={message.steps} contextContent={message.content || ''} />
                            </div>
                        )}

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
                                            <div className="not-prose group/code rounded-xl overflow-hidden my-6 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
                                                <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                                                    <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase tracking-tight">{match[1]}</span>
                                                    <div className="opacity-0 group-hover/code:opacity-100 transition-opacity duration-200">
                                                        <CopyButton text={codeString} className="p-1 hover:bg-slate-200 dark:hover:bg-white/10" />
                                                    </div>
                                                </div>
                                                <SyntaxHighlighter
                                                    style={syntaxTheme}
                                                    language={match[1]}
                                                    PreTag="div"
                                                    customStyle={{
                                                        margin: 0,
                                                        padding: '1.25rem',
                                                        background: 'transparent',
                                                        fontSize: '13px',
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
                                }}
                            >
                                {processedContent}
                            </ReactMarkdown>
                        </div>



                        {/* Bottom Meta & Actions */}
                        <div className={cn(
                            "flex items-center gap-3 text-[11px] text-slate-400 dark:text-zinc-500 font-medium mt-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                            isUser ? "flex-reverse" : ""
                        )}>
                            {isUser ? (
                                <>
                                    <CopyButton text={content} className="p-0.5" />
                                    <span>{new Date(message.timestamp || Date.now()).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · You</span>
                                </>
                            ) : (
                                <>
                                    <span>Geni · {new Date(message.timestamp || Date.now()).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
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



