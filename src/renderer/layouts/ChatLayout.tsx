import React, { useRef } from 'react'
import { ChevronRight, Plus, PanelLeftClose, PanelLeftOpen, Star, Presentation, BarChart3, GraduationCap, Globe, Cpu, Bot, Loader2 } from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore } from '../store/useLayoutStore'
import { useStaffStore } from '../store/useStaffStore'
import { MessageList } from '../modules/chat/MessageList'
import { Composer } from '../modules/chat/Composer'
import { SessionSidebar } from './sidebar/SessionSidebar'
import { StatusIndicator } from '../components/StatusIndicator'
import { StaffAvatar, STAFF_ICONS } from '../components/StaffAvatar'
import { useTranslation } from 'react-i18next'
import { cn } from '../utils/cn'


import { GeniLogo } from '../components/GeniLogo'
import { ArtifactPanel } from '../components/ArtifactPanel'
import { useDelayedUnmount } from '../hooks/useDelayedUnmount'


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

    // Resolve current staff for header display
    const headerStaffId = currentSessionMeta?.staffId
    const headerStaff = headerStaffId ? profiles.find(p => p.id === headerStaffId) : null
    const headerStaffName = headerStaff?.name || 'AI 助手'

    // Artifact 面板宽度与缩放逻辑
    const [panelWidth, setPanelWidth] = React.useState(360)
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
        <div className="flex h-full w-full overflow-hidden">
            {/* Session List Sidebar */}
            <SessionSidebar />
            <div className="flex-1 flex overflow-hidden relative">
                <main
                    className="flex flex-col overflow-hidden relative h-full min-w-0 bg-white dark:bg-[#141414] transition-all duration-300 ease-in-out"
                    style={{
                        marginRight: hasActiveArtifact ? `${panelWidth + 12}px` : '0px',
                        width: 'auto',
                        flex: '1 1 0%'
                    }}
                >
                    {/* Header */}
                    <header className={`h-11 flex items-center justify-between px-4 draggable shrink-0 z-10 pt-2 ${!hasMessages ? 'absolute top-0 w-full bg-transparent' : 'bg-white/80 dark:bg-[#141414]/80 backdrop-blur-md border-b border-[#EDEDF0] dark:border-white/[0.05]'}`}>
                        {/* Left: Toggle + Title */}
                        <div className="flex items-center gap-2.5 overflow-hidden">
                            <button
                                onClick={toggleSidebar}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[#F0F0F2] dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/5 transition-colors no-drag"
                                title={sidebarCollapsed ? "展开侧边栏 (Ctrl+B)" : "折叠侧边栏 (Ctrl+B)"}
                            >
                                {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                            </button>

                            {currentSessionMeta ? (
                                <div className="flex items-center gap-2 min-w-0">
                                    {/* Staff avatar in header (read-only) */}
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
                                            <span className="text-[11px] text-slate-400 dark:text-zinc-500 shrink-0 truncate max-w-[120px]">
                                                {headerStaffName}
                                            </span>
                                        </>
                                    )}
                                    <span className="text-[11px] text-slate-400 dark:text-zinc-500 shrink-0 tabular-nums hidden md:inline">
                                        {new Date(currentSessionMeta.updatedAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            ) : (
                                <div className="text-xs text-slate-400 dark:text-zinc-600">新任务</div>
                            )}
                        </div>

                        {/* Right: Spacer for window controls */}
                        <div className="flex items-center gap-2 no-drag pr-[140px]" />
                    </header>

                    {isActiveSessionLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-zinc-500">
                            <Loader2 size={18} className="animate-spin" />
                            <div className="text-[13px]">正在加载任务内容...</div>
                        </div>
                    ) : hasMessages ? (
                        <>
                            {/* Main Content Area */}
                            <div className="message-scroll flex-1 overflow-auto relative" ref={scrollContainerRef}>
                                <MessageList scrollContainerRef={scrollContainerRef} />
                            </div>

                            {/* Status Indicator */}
                            <StatusIndicator />

                            {/* Input Area */}
                            <div className="shrink-0 relative z-20 bg-white dark:bg-[#141414]">
                                <Composer />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto w-full h-full animate-in fade-in zoom-in-95 duration-500" style={{ marginTop: '-4vh' }}>

                            {/* Title */}
                            <h1 className="text-2xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight mb-1">
                                {t('chatLayout.greetingTitle')}
                            </h1>
                            <p className="text-[13px] text-slate-400 dark:text-zinc-500 mb-6 text-center">
                                {t('chatLayout.assistantDesc')}
                            </p>

                            {/* Staff Picker */}
                            <div className="flex justify-center mb-6 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-100 fill-mode-both">
                                <StaffPicker />
                            </div>

                            {/* Composer */}
                            <div className="w-full max-w-3xl animate-in slide-in-from-bottom-4 fade-in duration-500 delay-200 fill-mode-both">
                                <Composer />
                            </div>

                        </div>
                    )}
                </main>

                {/* Floating Right Panel: Artifact/Code Preview */}
                {showPanel && (
                    <aside
                        style={{ width: `${panelWidth}px` }}
                        className={cn(
                            "absolute top-30 right-2 h-[calc(100vh-180px)] flex flex-col overflow-hidden z-50 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] border border-slate-200/10 dark:border-white/10 bg-white/80 dark:bg-[#0d1117]/85 backdrop-blur-2xl ring-1 ring-black/5",
                            panelExiting
                                ? "panel-exit"
                                : "panel-enter"
                        )}
                    >
                        {/* Left Resize Handle */}
                        <div
                            onMouseDown={startResizing}
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-blue-500/20 active:bg-blue-500/40 transition-colors z-50"
                        />
                        <ArtifactPanel />
                    </aside>
                )}
            </div>
        </div>
    )
}

