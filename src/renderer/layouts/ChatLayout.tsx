import React, { useRef } from 'react'
import { PanelLeftClose, PanelLeftOpen, Loader2 } from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore } from '../store/useLayoutStore'
import { useStaffStore } from '../store/useStaffStore'
import { MessageList } from '../modules/chat/MessageList'
import { Composer } from '../modules/chat/Composer'
import { SessionSidebar } from './sidebar/SessionSidebar'
import { StatusIndicator } from '../components/StatusIndicator'
import { StaffAvatar } from '../components/StaffAvatar'
import { useTranslation } from 'react-i18next'
import { cn } from '../utils/cn'
import { ArtifactPanel } from '../components/ArtifactPanel'
import { useDelayedUnmount } from '../hooks/useDelayedUnmount'
import { useBreakpoint } from '../hooks/useBreakpoint'


/** 员工选择标签条（仅空状态页使用） */
function StaffPicker() {
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const assignStaff = useChatStore(s => s.assignStaff)
    const newTaskConfig = useChatStore(s => s.newTaskConfig)
    const { profiles, loadProfiles } = useStaffStore()

    const currentStaffId = activeSessionId ? sessions[activeSessionId]?.staffId : newTaskConfig.staffId

    React.useEffect(() => {
        if (profiles.length === 0) loadProfiles()
    }, [profiles.length, loadProfiles])

    const MAX_VISIBLE = 5

    // Build a recency map: staffId → most recent updatedAt across all sessions
    const staffRecency = React.useMemo(() => {
        const map = new Map<string, number>()
        for (const s of Object.values(sessions)) {
            if (s.staffId) {
                const existing = map.get(s.staffId) || 0
                if (s.updatedAt > existing) map.set(s.staffId, s.updatedAt)
            }
        }
        return map
    }, [sessions])

    const defaultOption = { id: undefined as string | undefined, name: 'AI 助手', description: '默认通用助手', avatar: 'Bot' }

    // Sort profiles by recency (most recently used first), unplaced ones at the end
    const sortedProfiles = React.useMemo(() => {
        return [...profiles].sort((a, b) => {
            const ta = staffRecency.get(a.id) || 0
            const tb = staffRecency.get(b.id) || 0
            return tb - ta
        })
    }, [profiles, staffRecency])

    const allOptions = [
        defaultOption,
        ...sortedProfiles.map(p => ({ id: p.id as string | undefined, name: p.name, description: p.description, avatar: p.avatar }))
    ]

    const visibleOptions = allOptions.slice(0, MAX_VISIBLE)

    return (
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F0F0F2] dark:bg-white/[0.04]">
            {visibleOptions.map(opt => {
                const isActive = currentStaffId === opt.id
                return (
                    <button
                        key={opt.id || '__default__'}
                        onClick={() => assignStaff(activeSessionId, opt.id)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200",
                            isActive
                                ? "bg-white dark:bg-white/10 shadow-sm text-indigo-600 dark:text-indigo-400"
                                : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"
                        )}
                    >
                        <StaffAvatar
                            avatar={opt.avatar}
                            name={opt.name}
                            size={18}
                            iconClassName={isActive ? "text-indigo-500 dark:text-indigo-400" : "text-slate-400 dark:text-zinc-500"}
                        />
                        <span className={cn(
                            "text-[12.5px] truncate transition-colors leading-none",
                            isActive ? "font-medium" : ""
                        )}>
                            {opt.name}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

export function ChatLayout() {
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const isActiveSessionLoading = useChatStore(s => s.activeSessionId ? s.loadingSessionIds.has(s.activeSessionId) : false)
    const hasActiveArtifact = useChatStore(s => !!s.activeArtifact)
    const { shouldRender: showPanel, isExiting: panelExiting } = useDelayedUnmount(hasActiveArtifact, 250)
    const currentSessionMeta = useChatStore(useShallow(s => {
        if (!s.activeSessionId) return null;
        const session = s.sessions[s.activeSessionId];
        if (!session) return null;
        return {
            id: session.id,
            title: session.title,
            updatedAt: session.updatedAt,
            hasMessages: session.messages && session.messages.length > 0,
            staffId: session.staffId,
        };
    }));

    const sidebarCollapsed = useLayoutStore(s => s.sidebarCollapsed)
    const toggleSidebar = useLayoutStore(s => s.toggleSidebar)
    const setSidebarCollapsed = useLayoutStore(s => s.setSidebarCollapsed)
    const sidebarWidth = useLayoutStore(s => s.sidebarWidth)

    const { t } = useTranslation()
    const { profiles } = useStaffStore()
    const { isMobile } = useBreakpoint()

    // Resolve current staff for header display
    const headerStaffId = currentSessionMeta?.staffId
    const headerStaff = headerStaffId ? profiles.find(p => p.id === headerStaffId) : null
    const headerStaffName = headerStaff?.name || 'AI 助手'

    // Artifact 面板宽度与缩放逻辑
    const [panelWidth, setPanelWidth] = React.useState(400)
    const isResizing = React.useRef(false)

    // 智能联动逻辑：当中间区域被挤压过窄时自动折叠侧边栏
    React.useEffect(() => {
        if (hasActiveArtifact && !sidebarCollapsed) {
            // 计算剩余宽度 (窗口总宽 - 面板宽 - 侧边栏宽 - 间距)
            const remainingChatWidth = window.innerWidth - panelWidth - sidebarWidth - 40;
            const THRESHOLD = 500; // 中间区域的最小舒适宽度

            if (remainingChatWidth < THRESHOLD) {
                setSidebarCollapsed(true)
            }
        }
    }, [panelWidth, hasActiveArtifact, sidebarCollapsed, sidebarWidth, setSidebarCollapsed])

    React.useEffect(() => {
        if (!showPanel || isMobile) return
        const comfortableWidth = Math.min(440, Math.max(360, Math.floor(window.innerWidth * 0.3)))
        setPanelWidth((current) => Math.max(360, Math.min(current, comfortableWidth)))
    }, [isMobile, showPanel])

    const startResizing = React.useCallback((e: React.MouseEvent) => {
        isResizing.current = true
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'

        const initialX = e.clientX
        const initialWidth = panelWidth

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isResizing.current) return
            const deltaX = moveEvent.clientX - initialX
            const newWidth = Math.max(360, Math.min(initialWidth - deltaX, window.innerWidth - 400))
            setPanelWidth(newWidth)
        }

        const onMouseUp = () => {
            isResizing.current = false
            document.body.style.cursor = 'default'
            document.body.style.userSelect = 'auto'
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }, [panelWidth])

    const hasMessages = currentSessionMeta?.hasMessages || false;

    const scrollContainerRef = useRef<HTMLDivElement>(null)

    return (
        <div className="flex h-full w-full overflow-hidden bg-[#F5F5F7] dark:bg-[#111111]">
            <SessionSidebar />
            <div className="flex-1 min-w-0 overflow-hidden pt-0 pr-1.5 pb-0 pl-0">
                <div className="relative flex h-full min-w-0 overflow-hidden rounded-[18px] border border-[#ECEDEF] bg-white shadow-[0_8px_24px_-20px_rgba(15,23,42,0.16)] dark:border-white/[0.05] dark:bg-[#141414] dark:shadow-[0_18px_50px_-38px_rgba(0,0,0,0.58)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/18 via-white/4 to-transparent dark:from-white/[0.012] dark:via-transparent" />
                    <main className="flex min-w-0 flex-1 flex-col overflow-hidden relative">
                        <header className={`h-10 flex items-center justify-between px-4 draggable shrink-0 z-10 ${!hasMessages ? 'absolute top-0 w-full bg-white dark:bg-[#141414]' : 'bg-white/92 dark:bg-[#141414]/92 backdrop-blur-md border-b border-[#F0F1F3] dark:border-white/[0.04]'}`}>
                            <div className="flex items-center gap-2.5 overflow-hidden">
                                <button
                                    onClick={toggleSidebar}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[#F5F5F7] dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/5 transition-colors no-drag"
                                    title={sidebarCollapsed ? "展开侧边栏 (Ctrl+B)" : "折叠侧边栏 (Ctrl+B)"}
                                >
                                    {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                                </button>

                                {currentSessionMeta ? (
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="flex items-center justify-center shrink-0 mr-1">
                                            <StaffAvatar
                                                avatar={headerStaff?.avatar}
                                                name={headerStaffName}
                                                size={18}
                                                iconClassName="text-slate-500 dark:text-zinc-400"
                                            />
                                        </div>
                                        <h1 className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200 truncate max-w-md">
                                            {currentSessionMeta.title || '新任务'}
                                        </h1>
                                        {hasMessages && (
                                            <>
                                                <span className="text-[10px] text-slate-300 dark:text-zinc-600 shrink-0">·</span>
                                                <span className="text-[11px] text-slate-400 dark:text-zinc-500 shrink-0 truncate max-w-[120px] hidden md:inline">
                                                    {headerStaffName}
                                                </span>
                                            </>
                                        )}
                                        <span className="text-[11px] text-slate-400 dark:text-zinc-500 shrink-0 tabular-nums hidden lg:inline">
                                            {new Date(currentSessionMeta.updatedAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-400 dark:text-zinc-600">新任务</div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 no-drag pr-[140px]" />
                        </header>

                        {isActiveSessionLoading ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-zinc-500">
                                <Loader2 size={18} className="animate-spin" />
                                <div className="text-[13px]">正在加载任务内容...</div>
                            </div>
                        ) : hasMessages ? (
                            <>
                                <div className="message-scroll flex-1 overflow-auto relative px-2 pt-2" ref={scrollContainerRef}>
                                    <MessageList scrollContainerRef={scrollContainerRef} />
                                </div>

                                <StatusIndicator />

                                <div className="shrink-0 relative z-20 bg-gradient-to-t from-white via-white to-white/96 dark:from-[#141414] dark:via-[#141414] dark:to-[#141414]/96">
                                    <Composer />
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto w-full h-full animate-in fade-in zoom-in-95 duration-500" style={{ marginTop: '-9vh' }}>
                                <div className="mb-3 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-500">
                                    New Workspace
                                </div>
                                <h1 className="text-2xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight mb-1">
                                    {t('chatLayout.greetingTitle')}
                                </h1>
                                <p className="text-[13px] text-slate-400 dark:text-zinc-500 mb-6 text-center max-w-md leading-6">
                                    {t('chatLayout.assistantDesc')}
                                </p>

                                <div className="flex justify-center mb-6 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-100 fill-mode-both">
                                    <StaffPicker />
                                </div>

                                <div className="w-full max-w-3xl animate-in slide-in-from-bottom-4 fade-in duration-500 delay-200 fill-mode-both">
                                    <Composer />
                                </div>
                            </div>
                        )}
                    </main>

                    {showPanel && (
                        isMobile ? (
                            <aside
                                className={cn(
                                    "absolute inset-y-4 right-4 z-50 w-[min(420px,calc(100vw-96px))] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#0d1117]",
                                    panelExiting ? "panel-exit" : "panel-enter"
                                )}
                            >
                                <ArtifactPanel />
                            </aside>
                        ) : (
                            <aside
                                style={{ width: `${panelWidth}px` }}
                                className={cn(
                                    "relative flex h-full shrink-0 overflow-hidden border-l border-[#EDEDF0] bg-[#FBFBFC] dark:border-white/[0.05] dark:bg-[#101214] group",
                                    panelExiting ? "panel-exit" : "panel-enter"
                                )}
                            >
                                <div
                                    onMouseDown={startResizing}
                                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 group"
                                />
                                <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-transparent group-hover:bg-slate-300 dark:group-hover:bg-white/[0.16] transition-colors" />
                                <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-10 w-2 flex items-center justify-center">
                                    <div className="h-8 w-[3px] rounded-full bg-slate-200/80 dark:bg-white/[0.08]" />
                                </div>
                                <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-white/70 dark:bg-white/[0.04]" />
                                <ArtifactPanel />
                            </aside>
                        )
                    )}
                </div>
            </div>
        </div>
    )
}

