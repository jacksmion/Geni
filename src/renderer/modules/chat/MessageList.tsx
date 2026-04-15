import React, { useEffect, useRef, useState, MutableRefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useStaffStore } from '../../store/useStaffStore'
import { ChatMessage } from '../../../common/types/chat'
import ThoughtTrace from '../../components/ThoughtTrace'
import { MarkdownRenderer, CopyButton, ThinkingBlock } from '../../components/MarkdownRenderer'
import { useVirtualizer } from '@tanstack/react-virtual'
import { preprocessMarkdown } from '../../utils/markdown'
import { cn } from '../../utils/cn'

const EMPTY_ARRAY: ChatMessage[] = []
const GAP = 32 // space-y-8 = 32px gap between items

export function MessageList({ scrollContainerRef }: { scrollContainerRef: MutableRefObject<HTMLDivElement | null> }) {
    const messages = useChatStore(s => s.sessions[s.activeSessionId]?.messages || EMPTY_ARRAY)
    const isSending = useChatStore(s => s.runningSessions.has(s.activeSessionId))
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const staffId = sessions[activeSessionId]?.staffId

    const isNearBottomRef = useRef(true)
    const prevSessionIdRef = useRef(activeSessionId)
    const [containerHeight, setContainerHeight] = useState(0)

    // Message Grouping Logic
    const lastMsg = messages[messages.length - 1];
    const groupedMessages = React.useMemo(() => {
        const groups: ChatMessage[] = [];
        const skipIndices = new Set<number>();

        for (let i = 0; i < messages.length; i++) {
            if (skipIndices.has(i)) continue;
            const msg = messages[i];

            if (msg.role === 'tool') continue;

            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                const chainSteps: any[] = [...(msg.steps || [])];
                let lastContent = msg.content || '';
                let j = i + 1;

                while (j < messages.length) {
                    if (messages[j].role === 'tool') {
                        skipIndices.add(j);
                        j++;
                        continue;
                    }

                    if (messages[j].role === 'assistant') {
                        const nextAssistant = messages[j];

                        if (nextAssistant.tool_calls && nextAssistant.tool_calls.length > 0) {
                            if (nextAssistant.steps) chainSteps.push(...nextAssistant.steps);
                            if (nextAssistant.content) lastContent = nextAssistant.content;
                            skipIndices.add(j);
                            j++;
                            continue;
                        }

                        if (!nextAssistant.tool_calls && nextAssistant.content) {
                            lastContent = nextAssistant.content;
                            if (nextAssistant.steps) chainSteps.push(...nextAssistant.steps);
                            skipIndices.add(j);
                            break;
                        }
                    }

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

    const virtualizer = useVirtualizer({
        count: groupedMessages.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: (index) => {
            const msg = groupedMessages[index];
            if (msg.role === 'user') return 80;
            if (msg.steps && msg.steps.length > 0) return 400;
            return 200;
        },
        overscan: 5,
        gap: GAP,
        getItemKey: (index) => groupedMessages[index].id ?? index,
    });

    // Track scroll position to know if user is near bottom
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;

        const onScroll = () => {
            const threshold = 100;
            isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [scrollContainerRef]);

    // Track container height for bottom-alignment padding
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });
        ro.observe(el);
        setContainerHeight(el.clientHeight);
        return () => ro.disconnect();
    }, [scrollContainerRef]);

    // Auto-scroll: streaming or new messages when near bottom
    // NOTE: isSending ? totalSize : 0 ensures re-trigger during streaming
    // (content grows → totalSize changes → scroll follows). Without this,
    // only groupedMessages.length changes trigger scroll, which misses
    // in-place content growth on the 2nd+ message.
    const totalSize = virtualizer.getTotalSize();

    useEffect(() => {
        if (groupedMessages.length === 0) return;
        if (!isNearBottomRef.current) return;

        const lastIndex = groupedMessages.length - 1;
        virtualizer.scrollToIndex(lastIndex, { align: 'end', behavior: isSending ? 'auto' : 'smooth' });
    }, [groupedMessages.length, isSending, virtualizer, isSending ? totalSize : 0]);

    // Session switch: scroll to bottom
    useEffect(() => {
        if (activeSessionId !== prevSessionIdRef.current) {
            prevSessionIdRef.current = activeSessionId;
            isNearBottomRef.current = true;

            // Reset virtualizer cached sizes for new session
            virtualizer.measure();

            requestAnimationFrame(() => {
                if (groupedMessages.length > 0) {
                    virtualizer.scrollToIndex(groupedMessages.length - 1, { align: 'end', behavior: 'auto' });
                }
            });
        }
    }, [activeSessionId, groupedMessages.length, virtualizer]);

    const paddingTop = Math.max(0, containerHeight - totalSize);

    return (
        <div
            className="w-full max-w-3xl mx-auto px-4 md:px-8 pt-6 pb-4"
            style={{ height: totalSize + paddingTop, paddingTop }}
        >
            <div style={{ height: totalSize, position: 'relative' }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const msg = groupedMessages[virtualItem.index];
                    return (
                        <div
                            key={virtualItem.key}
                            data-index={virtualItem.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <MessageItem
                                message={msg}
                                isStreaming={isSending && virtualItem.index === groupedMessages.length - 1}
                                staffId={staffId}
                                skillIds={msg.skillIds}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    )
}

const MessageItem = React.memo(function MessageItem({ message, isStreaming, staffId, skillIds }: { message: ChatMessage, isStreaming?: boolean, staffId?: string, skillIds?: string[] }) {
    const { profiles } = useStaffStore()
    const [skills, setSkills] = useState<{id: string; name: string}[]>([])
    const staff = staffId ? profiles.find(p => p.id === staffId) : undefined
    const isUser = message.role === 'user';

    useEffect(() => {
        if (skillIds && skillIds.length > 0) {
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
                                    <MarkdownRenderer
                                        content={displayContent}
                                        isStreaming={!!isStreaming}
                                        rawContent={textContent}
                                    />
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
                                <MarkdownRenderer
                                    content={displayContent}
                                    isStreaming={!!isStreaming}
                                    rawContent={textContent}
                                />
                            );
                        })()}



                        {/* Bottom Meta & Actions */}
                        <div className={cn(
                            "flex items-center gap-3 text-[10px] text-slate-400 dark:text-zinc-500 font-medium mt-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
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


