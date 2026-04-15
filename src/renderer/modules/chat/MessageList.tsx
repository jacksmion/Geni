import React, { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Bot, User, CheckCircle2, Terminal, Copy, Check, ChevronDown, ChevronUp, ChevronRight, Brain, Sparkles } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useStaffStore } from '../../store/useStaffStore'
import { ChatMessage } from '../../../common/types/chat'
import ThoughtTrace from '../../components/ThoughtTrace'
import { StaffAvatar } from '../../components/StaffAvatar'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSettingsStore } from '../../store/useSettingsStore'
import { preprocessMarkdown } from '../../utils/markdown'
import { cn } from '../../utils/cn'

const MermaidBlock = lazy(() => import('../../components/MermaidBlock'))
const SvgBlock = lazy(() => import('../../components/SvgBlock').then(m => ({ default: m.SvgBlock })))

const EMPTY_ARRAY: ChatMessage[] = []

export function MessageList() {
    const messages = useChatStore(s => s.sessions[s.activeSessionId]?.messages || EMPTY_ARRAY)
    const isSending = useChatStore(s => s.runningSessions.has(s.activeSessionId))
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const staffId = sessions[activeSessionId]?.staffId
    const activeSkillIds = sessions[activeSessionId]?.activeSkillIds
    const endRef = useRef<HTMLDivElement>(null)
    const rafScrollRef = useRef<number | null>(null)

    useEffect(() => {
        // Streaming 时禁用 smooth scroll，避免持续动画挤占主线程。
        if (rafScrollRef.current !== null) {
            cancelAnimationFrame(rafScrollRef.current)
        }

        rafScrollRef.current = requestAnimationFrame(() => {
            endRef.current?.scrollIntoView({ behavior: isSending ? 'auto' : 'smooth' })
            rafScrollRef.current = null
        })

        return () => {
            if (rafScrollRef.current !== null) {
                cancelAnimationFrame(rafScrollRef.current)
                rafScrollRef.current = null
            }
        }
    }, [messages, messages.length, isSending])

    // Message Grouping Logic
    // Merges consecutive ReAct iterations (assistant+tool pairs) into a single visual message.
    // The final answer (assistant without tool_calls) is merged with preceding tool iterations.
    // 只有真正影响 grouping 的字段变化时才重新计算，避免 streaming 每帧重算
    const lastMsg = messages[messages.length - 1];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages.length, lastMsg?.content, lastMsg?.steps?.length, lastMsg?.reasoning_parts?.length]);

    // Find the first user message to show skill tags
    const firstUserMsgIdx = groupedMessages.findIndex(m => m.role === 'user');

    return (
        <div className="w-full max-w-3xl mx-auto px-4 md:px-8 pt-6 pb-4 space-y-8 min-h-full flex flex-col justify-end">
            {groupedMessages.map((msg, idx) => (
                <MessageItem
                    key={msg.id}
                    message={msg}
                    isStreaming={isSending && idx === groupedMessages.length - 1}
                    staffId={staffId}
                    skillIds={idx === firstUserMsgIdx ? activeSkillIds : undefined}
                />
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
                    <div className="text-[14px] leading-relaxed text-slate-600 dark:text-zinc-400 whitespace-pre-wrap select-text">
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

const MessageItemContext = React.createContext<{ isStreaming: boolean, messageContent: string }>({ isStreaming: false, messageContent: '' });

const MarkdownComponents: any = {
    p: ({ children }: any) => <p>{children}</p>,
    ul: ({ className, ...props }: any) => <ul className={cn("list-disc pl-6 my-3 space-y-1", className)} {...props} />,
    ol: ({ className, ...props }: any) => <ol className={cn("list-decimal pl-6 my-3 space-y-1", className)} {...props} />,
    li: ({ className, ...props }: any) => <li className={cn("pl-1 marker:text-indigo-500 dark:marker:text-indigo-400", className)} {...props} />,
    hr: (props: any) => <hr className="my-10" {...props} />,
    pre: ({ children }: any) => <>{children}</>,
    code: MarkdownCodeBlock
};

function MarkdownCodeBlock({ node, className, children, ...props }: any) {
    const { isStreaming, messageContent } = React.useContext(MessageItemContext);
    const theme = useSettingsStore(s => s.settings.theme);
    const syntaxTheme = theme === 'dark' ? vscDarkPlus : oneLight;

    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    const isBlock = !!className || codeString.includes('\n');

    if (isBlock && match && match[1] === 'thinking') {
        const isThinkingComplete = /```thinking[\s\S]*?```/.test(messageContent || '');
        return <ThinkingBlock content={codeString} isComplete={isThinkingComplete} />
    }

    if (isBlock && match && match[1] === 'mermaid') {
        // 检测 mermaid 代码块是否已闭合（而非整个消息流是否结束）
        const isMermaidComplete = /```mermaid[\s\S]*?```/.test(messageContent || '');
        if (isStreaming && !isMermaidComplete) {
            return (
                <div className="not-prose group/code rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
                    <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                        <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase tracking-tight">mermaid</span>
                    </div>
                    <pre className="m-0 p-5 overflow-x-auto font-mono text-[13px] leading-[1.65] text-slate-800 dark:text-zinc-300">
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
        // 检测 svg 代码块是否已闭合，与 Mermaid 保护逻辑一致
        const isSvgComplete = /```svg[\s\S]*?```/.test(messageContent || '')
        if (isStreaming && !isSvgComplete) {
            return (
                <div className="not-prose group/code rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50 dark:bg-[#0c0c0e]">
                    <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                        <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-500 font-mono lowercase tracking-tight">svg</span>
                    </div>
                    <pre className="m-0 p-5 overflow-x-auto font-mono text-[13px] leading-[1.65] text-slate-800 dark:text-zinc-300">
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
                <pre className="m-0 p-5 overflow-x-auto font-mono text-[13px] leading-[1.65] text-slate-800 dark:text-zinc-300">
                    <code>{codeString}</code>
                    {isStreaming && <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-indigo-500/50 streaming-cursor" />}
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

const MessageItem = React.memo(function MessageItem({ message, isStreaming, staffId, skillIds }: { message: ChatMessage, isStreaming?: boolean, staffId?: string, skillIds?: string[] }) {
    const { profiles } = useStaffStore()
    const [skills, setSkills] = useState<{id: string; name: string}[]>([])
    const staff = staffId ? profiles.find(p => p.id === staffId) : undefined
    const isUser = message.role === 'user';

    useEffect(() => {
        if (skillIds && skillIds.length > 0 && skills.length === 0) {
            window.electronAPI.tools.getSkills().then((allSkills: any[]) => {
                setSkills(allSkills.map((s: any) => ({ id: s.id, name: s.name })));
            });
        }
    }, [skillIds]);
    const isArrayContent = Array.isArray(message.content);
    const contentParts = isArrayContent ? (message.content as import('../../../common/types/chat').ContentPart[]) : [];
    
    // Fallback for copy, context, and markdown rendering
    const textContent = isArrayContent
        ? contentParts.filter(p => p.type === 'text').map((p: any) => p.text).join('\n')
        : (message.content as string) || '';
        
    const processedContent = !isUser ? preprocessMarkdown(textContent) : textContent;

    // Deduplicate content: if the message starts with the same text as the first step's thought,
    // we hide it from the prose body to avoid double-rendering, since ThoughtTrace now always shows it.
    let displayContent = processedContent;
    if (!isUser && message.steps && message.steps.length > 0) {
        const firstThought = message.steps[0].thought?.trim() || '';
        const cleanContent = processedContent.trim();
        if (firstThought && cleanContent.startsWith(firstThought)) {
            if (cleanContent.length <= firstThought.length + 10) {
                displayContent = '';
            } else {
                displayContent = cleanContent.substring(firstThought.length).trim();
            }
        }
    }

    return (
        <div className={cn(
            "flex gap-4 max-w-full group animate-in slide-in-from-bottom-2 duration-500 fade-in",
            isUser && "justify-end"
        )}>


            {/* Content Container */}
            <div className={cn(
                "flex-1 min-w-0 flex flex-col",
                isUser ? "items-end" : "items-start"
            )}>
                {isUser && (
                    <>
                        <div className="select-text px-5 py-3 rounded-2xl rounded-tr-sm bg-slate-100 dark:bg-[#1e1e20] text-slate-800 dark:text-zinc-200 text-[14.5px] font-medium leading-relaxed max-w-[85%] flex flex-col gap-3">
                            {isArrayContent ? (
                                contentParts.map((part, idx) => {
                                    if (part.type === 'text') {
                                        return <div key={idx} className="whitespace-pre-wrap">{part.text}</div>;
                                    } else if (part.type === 'image_url') {
                                        return <img key={idx} src={part.image_url.url} alt="upload" className="max-w-[300px] border border-slate-200 dark:border-white/10 rounded-lg" />;
                                    }
                                    return null;
                                })
                            ) : (
                                textContent
                            )}
                        </div>
                        {skillIds && skillIds.length > 0 && skills.length > 0 && (
                            <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[85%] mt-1">
                                <Sparkles size={10} className="text-violet-400 dark:text-violet-500 shrink-0" />
                                {skillIds.map(id => {
                                    const skill = skills.find(s => s.id === id);
                                    return skill ? (
                                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400 ring-1 ring-inset ring-violet-200/50 dark:ring-violet-500/20">
                                            {skill.name}
                                        </span>
                                    ) : null;
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* Assistant Content - Editorial Style */}
                {!isUser && (
                    <div className="w-full">
                        {/* Interleave per turn: ThinkingBlock → Text → Tool Calls */}
                        {(() => {
                            const parts = message.reasoning_parts || (message.reasoning_content ? [message.reasoning_content] : []);
                            const steps = message.steps || [];

                            // Group consecutive steps by thought (same turn)
                            const groups: typeof steps[] = [];
                            let lastThought: string | undefined;
                            for (const step of steps) {
                                if (step.thought !== lastThought && groups.length > 0) {
                                    groups.push([]);
                                } else if (groups.length === 0) {
                                    groups.push([]);
                                }
                                groups[groups.length - 1].push(step);
                                lastThought = step.thought;
                            }

                            const totalTurns = Math.max(parts.length, groups.length);
                            if (totalTurns === 0) return null;

                            return (<>
                                {Array.from({ length: totalTurns }, (_, i) => (
                                    <React.Fragment key={i}>
                                        {parts[i] && (
                                            <ThinkingBlock
                                                content={parts[i]}
                                                isComplete={!isStreaming || i < parts.length - 1}
                                            />
                                        )}
                                        {groups[i] && groups[i].length > 0 && (
                                            <div className="mb-4 w-full">
                                                <ThoughtTrace steps={groups[i]} contextContent={textContent} />
                                            </div>
                                        )}
                                    </React.Fragment>
                                ))}
                                {/* TextBody：所有轮次结束后渲染最终回答 */}
                                {displayContent && (
                                    <div className="select-text prose prose-slate dark:prose-invert max-w-none
                                        text-slate-900 dark:text-zinc-100
                                        prose-p:text-[14.5px] prose-p:leading-[1.75] prose-p:my-3 prose-p:last:mb-0
                                        prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-slate-950 dark:prose-headings:text-white
                                        prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3
                                        prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-2.5
                                        prose-h3:text-[15px] prose-h3:mt-4 prose-h3:mb-2
                                        prose-ul:my-3 prose-ul:list-disc prose-ul:pl-6 prose-ul:text-[14.5px] prose-ul:leading-[1.75]
                                        prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-6 prose-ol:text-[14.5px] prose-ol:leading-[1.75]
                                        prose-li:my-1.5 prose-li:pl-1
                                        prose-li:prose-p:my-0
                                        prose-li:marker:text-indigo-500 dark:prose-li:marker:text-indigo-400
                                        prose-strong:text-slate-900 dark:prose-strong:text-zinc-100 prose-strong:font-bold
                                        prose-hr:border-slate-200 dark:prose-hr:border-white/10 prose-hr:my-8
                                        prose-blockquote:border-l-4 prose-blockquote:border-indigo-500/20 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-slate-600 dark:prose-blockquote:text-zinc-400 prose-blockquote:my-4
                                        prose-code:text-indigo-700 dark:prose-code:text-indigo-300 prose-code:bg-indigo-50 dark:prose-code:bg-indigo-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none
                                        prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0">
                                        <MessageItemContext.Provider value={{ isStreaming: !!isStreaming, messageContent: textContent }}>
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={MarkdownComponents}
                                            >
                                                {displayContent}
                                            </ReactMarkdown>
                                        </MessageItemContext.Provider>
                                    </div>
                                )}
                            </>);
                        })()}

                        {/* TextBody：无推理/工具时单独渲染 */}
                        {(() => {
                            const parts = message.reasoning_parts || (message.reasoning_content ? [message.reasoning_content] : []);
                            const steps = message.steps || [];
                            const hasTurns = Math.max(parts.length, steps.length > 0 ? 1 : 0) > 0;
                            if (hasTurns || !displayContent) return null;
                            return (
                                <div className="select-text prose prose-slate dark:prose-invert max-w-none
                                    text-slate-900 dark:text-zinc-100
                                    prose-p:text-[14.5px] prose-p:leading-[1.75] prose-p:my-3 prose-p:last:mb-0
                                    prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-slate-950 dark:prose-headings:text-white
                                    prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3
                                    prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-2.5
                                    prose-h3:text-[15px] prose-h3:mt-4 prose-h3:mb-2
                                    prose-ul:my-3 prose-ul:list-disc prose-ul:pl-6 prose-ul:text-[14.5px] prose-ul:leading-[1.75]
                                    prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-6 prose-ol:text-[14.5px] prose-ol:leading-[1.75]
                                    prose-li:my-1.5 prose-li:pl-1
                                    prose-li:prose-p:my-0
                                    prose-li:marker:text-indigo-500 dark:prose-li:marker:text-indigo-400
                                    prose-strong:text-slate-900 dark:prose-strong:text-zinc-100 prose-strong:font-bold
                                    prose-hr:border-slate-200 dark:prose-hr:border-white/10 prose-hr:my-8
                                    prose-blockquote:border-l-4 prose-blockquote:border-indigo-500/20 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-slate-600 dark:prose-blockquote:text-zinc-400 prose-blockquote:my-4
                                    prose-code:text-indigo-700 dark:prose-code:text-indigo-300 prose-code:bg-indigo-50 dark:prose-code:bg-indigo-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none
                                    prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0">
                                    <MessageItemContext.Provider value={{ isStreaming: !!isStreaming, messageContent: textContent }}>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={MarkdownComponents}
                                        >
                                            {displayContent}
                                        </ReactMarkdown>
                                    </MessageItemContext.Provider>
                                </div>
                            );
                        })()}



                        {/* Bottom Meta & Actions */}
                        <div className={cn(
                            "flex items-center gap-3 text-[11px] text-slate-400 dark:text-zinc-500 font-medium mt-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                            isUser ? "flex-reverse" : ""
                        )}>
                            {isUser ? (
                                <>
                                    <CopyButton text={textContent} className="p-0.5" />
                                    <span>{message.timestamp ? new Date(message.timestamp).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''} · You</span>
                                </>
                            ) : (
                                <>
                                    <span>{staff ? staff.name : 'Geni'} {message.timestamp ? `· ${new Date(message.timestamp).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                                    <CopyButton text={textContent} className="p-0.5" />
                                </>
                            )}
                        </div>
                    </div>
                )}

            </div>


        </div>
    )
}, (prevProps, nextProps) => {
    // 阻止由于 groupedMessages 生成新对象引起的大量无效重渲染
    if (prevProps.staffId !== nextProps.staffId) return false;
    if (prevProps.isStreaming !== nextProps.isStreaming) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    
    const prevIsArray = Array.isArray(prevProps.message.content);
    const nextIsArray = Array.isArray(nextProps.message.content);
    if (prevIsArray !== nextIsArray) return false;
    if (!prevIsArray && prevProps.message.content !== nextProps.message.content) return false;
    if (prevIsArray && JSON.stringify(prevProps.message.content) !== JSON.stringify(nextProps.message.content)) return false;
    
    if (prevProps.message.role !== nextProps.message.role) return false;
    if (prevProps.message.reasoning_content !== nextProps.message.reasoning_content) return false;
    if (prevProps.message.reasoning_parts !== nextProps.message.reasoning_parts) return false;

    const prevStepsLen = prevProps.message.steps?.length || 0;
    const nextStepsLen = nextProps.message.steps?.length || 0;
    if (prevStepsLen !== nextStepsLen) return false;
    
    if (prevStepsLen > 0) {
        // 在流式输出工具调用和思考过程中，我们主要关心步骤数量和最后一个步骤的变化
        const prevLastStep = prevProps.message.steps![prevStepsLen - 1];
        const nextLastStep = nextProps.message.steps![nextStepsLen - 1];
        if (
            prevLastStep.thought !== nextLastStep.thought ||
            prevLastStep.observation !== nextLastStep.observation ||
            prevLastStep.streamingObservation !== nextLastStep.streamingObservation ||
            prevLastStep.isComplete !== nextLastStep.isComplete ||
            prevLastStep.isWaitingAuthorization !== nextLastStep.isWaitingAuthorization ||
            prevLastStep.toolInput !== nextLastStep.toolInput
        ) return false;
    }
    
    return true;
});


