import React, { useEffect, useRef, useState, MutableRefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useStaffStore } from '../../store/useStaffStore'
import { ChatMessage, ContentPart } from '../../../common/types/chat'
import ThoughtTrace from '../../components/ThoughtTrace'
import { MarkdownRenderer, CopyButton } from '../../components/MarkdownRenderer'
import { useVirtualizer } from '@tanstack/react-virtual'
import { preprocessMarkdown } from '../../utils/markdown'
import { cn } from '../../utils/cn'
import { MessageArtifacts } from '../../components/MessageArtifacts'

const EMPTY_ARRAY: ChatMessage[] = []
const GAP = 32 // space-y-8 = 32px gap between items
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
}

type SkillNameMap = Record<string, string>
type GroupedMessageMeta = {
    sourceStart: number
    sourceEnd: number
}

let cachedSkillNameMap: SkillNameMap | null = null
let skillNameMapPromise: Promise<SkillNameMap> | null = null

function loadSkillNameMap() {
    if (cachedSkillNameMap) {
        return Promise.resolve(cachedSkillNameMap)
    }

    if (!skillNameMapPromise) {
        skillNameMapPromise = window.electronAPI.tools.getSkills()
            .then((allSkills: Array<{ id: string; name: string }>) => {
                cachedSkillNameMap = allSkills.reduce<SkillNameMap>((acc, skill) => {
                    acc[skill.id] = skill.name
                    return acc
                }, {})
                return cachedSkillNameMap
            })
            .finally(() => {
                skillNameMapPromise = null
            })
    }

    return skillNameMapPromise
}

function buildGroupedMessages(messages: ChatMessage[], startIndex = 0) {
    const groups: ChatMessage[] = []
    const metas: GroupedMessageMeta[] = []
    const skipIndices = new Set<number>()

    for (let i = startIndex; i < messages.length; i++) {
        if (skipIndices.has(i)) continue
        const msg = messages[i]

        if (msg.role === 'tool') continue

        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
            const chainSteps = [...(msg.steps || [])]
            let lastContent = msg.content || ''
            let j = i + 1
            const artifactMap = new Map((msg.artifacts || []).map(artifact => [artifact.path, artifact]))
            let sourceEnd = i

            while (j < messages.length) {
                const nextMessage = messages[j]

                if (nextMessage.role === 'tool') {
                    skipIndices.add(j)
                    for (const artifact of nextMessage.artifacts || []) {
                        artifactMap.set(artifact.path, artifact)
                    }
                    sourceEnd = j
                    j++
                    continue
                }

                if (nextMessage.role === 'assistant') {
                    if (nextMessage.tool_calls && nextMessage.tool_calls.length > 0) {
                        if (nextMessage.steps) chainSteps.push(...nextMessage.steps)
                        if (nextMessage.content) lastContent = nextMessage.content
                        for (const artifact of nextMessage.artifacts || []) {
                            artifactMap.set(artifact.path, artifact)
                        }
                        skipIndices.add(j)
                        sourceEnd = j
                        j++
                        continue
                    }

                    if (!nextMessage.tool_calls && nextMessage.content) {
                        lastContent = nextMessage.content
                        if (nextMessage.steps) chainSteps.push(...nextMessage.steps)
                        for (const artifact of nextMessage.artifacts || []) {
                            artifactMap.set(artifact.path, artifact)
                        }
                        skipIndices.add(j)
                        sourceEnd = j
                    }
                }

                break
            }

            groups.push({
                ...msg,
                content: lastContent,
                steps: chainSteps.length > 0 ? chainSteps : msg.steps,
                artifacts: Array.from(artifactMap.values()),
            })
            metas.push({ sourceStart: i, sourceEnd })
            continue
        }

        groups.push(msg)
        metas.push({ sourceStart: i, sourceEnd: i })
    }

    return { groups, metas }
}

function getSharedPrefixLength(prevMessages: ChatMessage[], nextMessages: ChatMessage[]) {
    const limit = Math.min(prevMessages.length, nextMessages.length)
    let index = 0

    while (index < limit && prevMessages[index] === nextMessages[index]) {
        index++
    }

    return index
}

function contentPartsEqual(prev: ContentPart[], next: ContentPart[]) {
    if (prev.length !== next.length) return false

    for (let i = 0; i < prev.length; i++) {
        const prevPart = prev[i]
        const nextPart = next[i]

        if (prevPart.type !== nextPart.type) return false

        if (prevPart.type === 'text' && nextPart.type === 'text') {
            if (prevPart.text !== nextPart.text) return false
            continue
        }

        if (prevPart.type === 'image_url' && nextPart.type === 'image_url') {
            if (prevPart.image_url.url !== nextPart.image_url.url || prevPart.image_url.detail !== nextPart.image_url.detail) {
                return false
            }
        }
    }

    return true
}

export function MessageList({ scrollContainerRef }: { scrollContainerRef: MutableRefObject<HTMLDivElement | null> }) {
    const messages = useChatStore(s => s.activeSessionId ? (s.sessions[s.activeSessionId]?.messages || EMPTY_ARRAY) : EMPTY_ARRAY)
    const isSending = useChatStore(s => s.activeSessionId ? s.runningSessions.has(s.activeSessionId) : false)
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const staffId = useChatStore(s => s.activeSessionId ? s.sessions[s.activeSessionId]?.staffId : undefined)
    const profiles = useStaffStore(s => s.profiles)

    const isNearBottomRef = useRef(true)
    const prevSessionIdRef = useRef(activeSessionId)
    const groupedCacheRef = useRef<{ messages: ChatMessage[]; groups: ChatMessage[]; metas: GroupedMessageMeta[] } | null>(null)
    const [containerHeight, setContainerHeight] = useState(0)
    const [skillNameMap, setSkillNameMap] = useState<SkillNameMap>({})

    // Message Grouping Logic
    const groupedMessages = React.useMemo(() => {
        const cached = groupedCacheRef.current
        if (!cached || cached.messages === messages) {
            const next = buildGroupedMessages(messages)
            groupedCacheRef.current = { messages, groups: next.groups, metas: next.metas }
            return next.groups
        }

        const sharedPrefixLength = getSharedPrefixLength(cached.messages, messages)
        if (sharedPrefixLength === 0) {
            const next = buildGroupedMessages(messages)
            groupedCacheRef.current = { messages, groups: next.groups, metas: next.metas }
            return next.groups
        }

        const affectedMessageIndex = Math.max(0, sharedPrefixLength - 1)
        const regroupFromGroupIndex = cached.metas.findIndex(meta => meta.sourceEnd >= affectedMessageIndex)
        const stableGroupCount = regroupFromGroupIndex === -1 ? cached.groups.length : regroupFromGroupIndex
        const regroupStartIndex = regroupFromGroupIndex === -1
            ? sharedPrefixLength
            : cached.metas[regroupFromGroupIndex].sourceStart

        const reusedGroups = cached.groups.slice(0, stableGroupCount)
        const reusedMetas = cached.metas.slice(0, stableGroupCount)
        const nextTail = buildGroupedMessages(messages, regroupStartIndex)
        const nextGroups = [...reusedGroups, ...nextTail.groups]
        const nextMetas = [...reusedMetas, ...nextTail.metas]

        groupedCacheRef.current = { messages, groups: nextGroups, metas: nextMetas }
        return nextGroups
    }, [messages])

    const staffName = React.useMemo(
        () => (staffId ? profiles.find(p => p.id === staffId)?.name : undefined),
        [profiles, staffId]
    )

    useEffect(() => {
        const shouldLoadSkills = groupedMessages.some(message => message.skillIds && message.skillIds.length > 0)
        if (!shouldLoadSkills) {
            setSkillNameMap({})
            return
        }

        let cancelled = false

        loadSkillNameMap().then((nextSkillNameMap) => {
            if (cancelled) return

            setSkillNameMap(prev => {
                const prevKeys = Object.keys(prev)
                const nextKeys = Object.keys(nextSkillNameMap)
                if (prevKeys.length === nextKeys.length && prevKeys.every(key => prev[key] === nextSkillNameMap[key])) {
                    return prev
                }
                return nextSkillNameMap
            })
        }).catch(console.error)

        return () => {
            cancelled = true
        }
    }, [groupedMessages])

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
    const autoScrollTrigger = isSending ? totalSize : 0

    useEffect(() => {
        if (groupedMessages.length === 0) return;
        if (!isNearBottomRef.current) return;

        const lastIndex = groupedMessages.length - 1;
        virtualizer.scrollToIndex(lastIndex, { align: 'end', behavior: isSending ? 'auto' : 'smooth' });
    }, [autoScrollTrigger, groupedMessages.length, isSending, virtualizer]);

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
                                staffName={staffName}
                                skillIds={msg.skillIds}
                                skillNameMap={skillNameMap}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    )
}

const MessageItem = React.memo(function MessageItem({
    message,
    isStreaming,
    staffName,
    skillIds,
    skillNameMap,
}: {
    message: ChatMessage
    isStreaming?: boolean
    staffName?: string
    skillIds?: string[]
    skillNameMap: SkillNameMap
}) {
    const isUser = message.role === 'user'
    const isArrayContent = Array.isArray(message.content)
    const contentParts = React.useMemo(() => (
        isArrayContent ? message.content as ContentPart[] : []
    ), [isArrayContent, message.content])

    const textContent = React.useMemo(() => (
        isArrayContent
            ? contentParts.filter(part => part.type === 'text').map(part => part.text).join('\n')
            : (message.content as string) || ''
    ), [contentParts, isArrayContent, message.content])

    const displayContent = React.useMemo(() => {
        if (isUser) return textContent

        let remainingContent = textContent.trim()
        const uniqueThoughts = Array.from(new Set(
            (message.steps || [])
                .map(step => step.thought?.trim())
                .filter((thought): thought is string => !!thought)
        ))

        for (const thought of uniqueThoughts) {
            if (!remainingContent.startsWith(thought)) continue
            remainingContent = remainingContent.slice(thought.length).trimStart()
        }

        if (!remainingContent) return ''

        return preprocessMarkdown(remainingContent)
    }, [isUser, message.steps, textContent])

    const steps = React.useMemo(() => message.steps || [], [message.steps])

    const resolvedSkillNames = React.useMemo(() => (
        (skillIds || [])
            .map(id => ({ id, name: skillNameMap[id] }))
            .filter((skill): skill is { id: string; name: string } => !!skill.name)
    ), [skillIds, skillNameMap])

    const formattedTimestamp = React.useMemo(
        () => message.timestamp ? new Date(message.timestamp).toLocaleString([], DATE_FORMAT_OPTIONS) : '',
        [message.timestamp]
    )

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
                        {resolvedSkillNames.length > 0 && (
                            <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[85%] mt-1">
                                <Sparkles size={10} className="text-violet-400 dark:text-violet-500 shrink-0" />
                                {resolvedSkillNames.map(skill => (
                                    <span key={skill.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400 ring-1 ring-inset ring-violet-200/50 dark:ring-violet-500/20">
                                        {skill.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Assistant Content - Editorial Style */}
                {!isUser && (
                    <div className="w-full">
                        {steps.length > 0 && (
                            <div className="mb-1.5 w-full">
                                <ThoughtTrace steps={steps} contextContent={textContent} />
                            </div>
                        )}

                        {/* TextBody：最终答案始终独立展示在过程折叠之后 */}
                        {steps.length > 0 && displayContent && (
                            <MarkdownRenderer
                                content={displayContent}
                                isStreaming={!!isStreaming}
                                rawContent={textContent}
                            />
                        )}

                        {/* TextBody：无推理/工具时单独渲染 */}
                        {(() => {
                            if (steps.length > 0 || !displayContent) return null
                            return (
                                <MarkdownRenderer
                                    content={displayContent}
                                    isStreaming={!!isStreaming}
                                    rawContent={textContent}
                                />
                            )
                        })()}

                        {message.artifacts && message.artifacts.length > 0 && (
                            <MessageArtifacts artifacts={message.artifacts} />
                        )}


                        {/* Bottom Meta & Actions */}
                        <div className={cn(
                            "flex items-center gap-3 text-[10px] text-slate-400 dark:text-zinc-500 font-medium mt-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                            isUser ? "flex-reverse" : ""
                        )}>
                            {isUser ? (
                                <>
                                    <CopyButton text={textContent} className="p-0.5" />
                                    <span>{formattedTimestamp} · You</span>
                                </>
                            ) : (
                                <>
                                    <span>{staffName || 'Geni'} {formattedTimestamp ? `· ${formattedTimestamp}` : ''}</span>
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
    if (prevProps.staffName !== nextProps.staffName) return false
    if (prevProps.isStreaming !== nextProps.isStreaming) return false
    if (prevProps.skillNameMap !== nextProps.skillNameMap && ((prevProps.skillIds?.length || 0) > 0 || (nextProps.skillIds?.length || 0) > 0)) return false
    if (prevProps.message.id !== nextProps.message.id) return false

    const prevIsArray = Array.isArray(prevProps.message.content)
    const nextIsArray = Array.isArray(nextProps.message.content)
    if (prevIsArray !== nextIsArray) return false
    if (!prevIsArray && prevProps.message.content !== nextProps.message.content) return false
    if (prevIsArray && !contentPartsEqual(prevProps.message.content as ContentPart[], nextProps.message.content as ContentPart[])) return false

    if (prevProps.message.role !== nextProps.message.role) return false
    if (prevProps.message.reasoning_content !== nextProps.message.reasoning_content) return false
    if (prevProps.message.reasoning_parts !== nextProps.message.reasoning_parts) return false
    if (prevProps.message.artifacts !== nextProps.message.artifacts) return false
    if (prevProps.message.timestamp !== nextProps.message.timestamp) return false

    const prevStepsLen = prevProps.message.steps?.length || 0
    const nextStepsLen = nextProps.message.steps?.length || 0
    if (prevStepsLen !== nextStepsLen) return false

    if (prevStepsLen > 0) {
        // 在流式输出工具调用和思考过程中，我们主要关心步骤数量和最后一个步骤的变化
        const prevLastStep = prevProps.message.steps![prevStepsLen - 1]
        const nextLastStep = nextProps.message.steps![nextStepsLen - 1]
        if (
            prevLastStep.thought !== nextLastStep.thought ||
            prevLastStep.observation !== nextLastStep.observation ||
            prevLastStep.streamingObservation !== nextLastStep.streamingObservation ||
            prevLastStep.isComplete !== nextLastStep.isComplete ||
            prevLastStep.isWaitingAuthorization !== nextLastStep.isWaitingAuthorization ||
            prevLastStep.toolInput !== nextLastStep.toolInput
        ) return false
    }

    return true
});


