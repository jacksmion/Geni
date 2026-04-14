import React from 'react'
import { ChevronRight, Plus, PanelLeftClose, PanelLeftOpen, Star, Presentation, BarChart3, GraduationCap, Globe, Cpu, Bot } from 'lucide-react'
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


/** 员工选择卡片网格（仅空状态页使用） */
function StaffPicker() {
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const assignStaff = useChatStore(s => s.assignStaff)
    const { profiles, loadProfiles } = useStaffStore()

    const currentStaffId = sessions[activeSessionId]?.staffId

    React.useEffect(() => {
        if (profiles.length === 0) loadProfiles()
    }, [profiles.length, loadProfiles])

    const allOptions = [
        { id: undefined as string | undefined, name: 'AI 助手', description: '默认通用助手', avatar: 'Bot' },
        ...profiles.map(p => ({ id: p.id as string | undefined, name: p.name, description: p.description, avatar: p.avatar }))
    ]

    return (
        <div className="flex flex-wrap justify-center gap-3 max-w-2xl w-full">
            {allOptions.map(opt => {
                const isActive = currentStaffId === opt.id
                const hasIcon = opt.avatar && STAFF_ICONS[opt.avatar]
                return (
                    <button
                        key={opt.id || '__default__'}
                        onClick={() => assignStaff(activeSessionId, opt.id)}
                        className={cn(
                            "group relative flex flex-col items-center gap-2 w-[110px] py-4 px-3 rounded-2xl transition-all duration-200",
                            "border shadow-sm",
                            isActive
                                ? "border-indigo-400/60 dark:border-indigo-500/50 bg-indigo-50/80 dark:bg-indigo-500/10 shadow-indigo-100 dark:shadow-indigo-500/10"
                                : "border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-white/[0.03] hover:border-slate-300 dark:hover:border-white/15 hover:shadow-md"
                        )}
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
                            hasIcon
                                ? "bg-slate-100 dark:bg-zinc-700/60"
                                : "bg-gradient-to-br from-indigo-500 to-purple-500"
                        )}>
                            <StaffAvatar
                                avatar={opt.avatar}
                                name={opt.name}
                                size={hasIcon ? 18 : 20}
                                iconClassName={hasIcon ? "text-slate-500 dark:text-zinc-400" : undefined}
                                className={hasIcon ? undefined : "text-white"}
                            />
                        </div>
                        <div className="text-center min-w-0 w-full">
                            <div className={cn(
                                "text-[12px] font-semibold truncate",
                                isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-zinc-300"
                            )}>
                                {opt.name}
                            </div>
                            {opt.description && (
                                <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">{opt.description}</div>
                            )}
                        </div>
                        {isActive && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center shadow-sm">
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            </div>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

export function ChatLayout() {
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const hasActiveArtifact = useChatStore(s => !!s.activeArtifact)
    const { shouldRender: showPanel, isExiting: panelExiting } = useDelayedUnmount(hasActiveArtifact, 250)
    const currentSessionMeta = useChatStore(useShallow(s => {
        const session = s.sessions[activeSessionId];
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

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Session List Sidebar */}
            <SessionSidebar />
            <div className="flex-1 flex overflow-hidden relative">
                <main
                    className="flex flex-col overflow-hidden relative h-full min-w-0 bg-white dark:bg-[#0a0a0c] transition-all duration-300 ease-in-out"
                    style={{
                        marginRight: hasActiveArtifact ? `${panelWidth + 12}px` : '0px',
                        width: 'auto',
                        flex: '1 1 0%'
                    }}
                >
                    {/* Header */}
                    <header className={`h-11 flex items-center justify-between px-4 draggable shrink-0 z-10 pt-2 ${!hasMessages ? 'absolute top-0 w-full bg-transparent' : 'bg-white/95 dark:bg-[#0a0a0c]/95 backdrop-blur-md shadow-sm border-b border-slate-100 dark:border-white/5'}`}>
                        {/* Left: Toggle + Title */}
                        <div className="flex items-center gap-2.5 overflow-hidden">
                            <button
                                onClick={toggleSidebar}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/5 transition-colors no-drag"
                                title={sidebarCollapsed ? "展开侧边栏 (Ctrl+B)" : "折叠侧边栏 (Ctrl+B)"}
                            >
                                {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                            </button>

                            {currentSessionMeta ? (
                                <div className="flex items-center gap-2 min-w-0">
                                    {/* Staff avatar in header (read-only) */}
                                    <div className={cn(
                                        "w-5 h-5 rounded-md flex items-center justify-center shrink-0",
                                        headerStaffId
                                            ? (headerStaff?.avatar && STAFF_ICONS[headerStaff.avatar]
                                                ? "bg-slate-100 dark:bg-zinc-700/60"
                                                : "bg-gradient-to-br from-indigo-500 to-purple-500")
                                            : "bg-slate-100 dark:bg-zinc-700/60"
                                    )}>
                                        <StaffAvatar
                                            avatar={headerStaff?.avatar}
                                            name={headerStaffName}
                                            size={11}
                                            iconClassName={headerStaffId && !(headerStaff?.avatar && STAFF_ICONS[headerStaff?.avatar || '']) ? undefined : "text-slate-500 dark:text-zinc-400"}
                                            className={headerStaffId && !(headerStaff?.avatar && STAFF_ICONS[headerStaff?.avatar || '']) ? "text-white" : undefined}
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
                                    <span className="text-[10px] text-slate-300 dark:text-zinc-600 shrink-0 tabular-nums hidden md:inline">
                                        {new Date(currentSessionMeta.updatedAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            ) : (
                                <div className="text-xs text-slate-400 dark:text-zinc-600">选择一个任务...</div>
                            )}
                        </div>

                        {/* Right: Spacer for window controls */}
                        <div className="flex items-center gap-2 no-drag pr-[140px]" />
                    </header>

                    {hasMessages ? (
                        <>
                            {/* Main Content Area */}
                            <div className="message-scroll flex-1 overflow-auto relative">
                                <MessageList />
                            </div>

                            {/* Status Indicator */}
                            <StatusIndicator />

                            {/* Input Area */}
                            <div className="shrink-0 relative z-20 bg-white dark:bg-[#0a0a0c]">
                                <Composer />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto w-full h-full pb-[10vh] animate-in fade-in zoom-in-95 duration-500">
                            {/* Logo */}
                            <div className="w-16 h-16 rounded-[1.25rem] bg-gradient-to-br from-[#ff512f] to-[#dd2476] flex items-center justify-center text-white mb-6 shadow-lg shadow-red-500/20">
                                <Cpu size={32} strokeWidth={2.2} className="text-white" />
                            </div>

                            <h1 className="text-3xl font-bold text-slate-900 dark:text-zinc-100 mb-2 tracking-tight">
                                {t('chatLayout.startCollaborating')}
                            </h1>
                            <p className="text-[13px] text-slate-400 dark:text-zinc-500 mb-8 text-center">
                                选择一个数字员工开始对话
                            </p>

                            {/* Staff Picker Cards */}
                            <div className="mb-8 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-100 fill-mode-both">
                                <StaffPicker />
                            </div>

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

