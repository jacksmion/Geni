import React from 'react'
import { ChevronRight, Plus, PanelLeftClose, PanelLeftOpen, Star, Presentation, BarChart3, GraduationCap, Globe, Cpu } from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore } from '../store/useLayoutStore'
import { MessageList } from '../modules/chat/MessageList'
import { Composer } from '../modules/chat/Composer'
import { SessionSidebar } from './sidebar/SessionSidebar'
import { StatusIndicator } from '../components/StatusIndicator'
import { useTranslation } from 'react-i18next'

import { GeniLogo } from '../components/GeniLogo'
import { ArtifactPanel } from '../components/ArtifactPanel'
import { useStaffStore } from '../store/useStaffStore'

export function ChatLayout() {
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const hasActiveArtifact = useChatStore(s => !!s.activeArtifact)
    const currentSessionMeta = useChatStore(useShallow(s => {
        const session = s.sessions[activeSessionId];
        if (!session) return null;
        return {
            id: session.id,
            title: session.title,
            updatedAt: session.updatedAt,
            hasMessages: session.messages && session.messages.length > 0,
            staffId: session.staffId
        };
    }));

    const sidebarCollapsed = useLayoutStore(s => s.sidebarCollapsed)
    const toggleSidebar = useLayoutStore(s => s.toggleSidebar)
    const setSidebarCollapsed = useLayoutStore(s => s.setSidebarCollapsed)
    const sidebarWidth = useLayoutStore(s => s.sidebarWidth)

    const { t } = useTranslation()

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
                                    <h1 className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200 truncate max-w-md">
                                        {currentSessionMeta.title || '新任务'}
                                    </h1>
                                    <span className="text-[10px] text-slate-300 dark:text-zinc-600 shrink-0 tabular-nums hidden md:inline">
                                        {new Date(currentSessionMeta.updatedAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            ) : (
                                <div className="text-xs text-slate-400 dark:text-zinc-600">选择一个任务...</div>
                            )}
                        </div>

                        {/* Right: Staff Selector */}
                        <div className="flex items-center gap-2 no-drag pr-[140px]">
                            {currentSessionMeta && <StaffSelector currentSessionId={currentSessionMeta.id} currentStaffId={currentSessionMeta.staffId} />}
                        </div>
                    </header>

                    {hasMessages ? (
                        <>
                            {/* Main Content Area */}
                            <div className="flex-1 overflow-auto relative">
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


                            <h1 className="text-3xl font-bold text-slate-900 dark:text-zinc-100 mb-3 tracking-tight">
                                {t('chatLayout.startCollaborating')}
                            </h1>
                            <p className="text-[14.5px] text-slate-500 dark:text-zinc-400 mb-10 text-center font-medium">
                                {t('chatLayout.assistantDesc')}
                            </p>

                            <div className="w-full max-w-3xl mb-10 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-100 fill-mode-both">
                                <Composer />
                            </div>

                        </div>
                    )}
                </main>

                {/* Floating Right Panel: Artifact/Code Preview */}
                {hasActiveArtifact && (
                    <aside
                        style={{ width: `${panelWidth}px` }}
                        className="absolute top-30 right-2 h-[calc(100vh-180px)] flex flex-col overflow-hidden animate-in slide-in-from-right-8 fade-in-0 duration-500 ease-out z-50 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] border border-slate-200/10 dark:border-white/10 bg-white/80 dark:bg-[#0d1117]/85 backdrop-blur-2xl ring-1 ring-black/5"
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

function StaffSelector({ currentSessionId, currentStaffId }: { currentSessionId: string, currentStaffId?: string }) {
    const { profiles, loadProfiles } = useStaffStore()
    const assignStaff = useChatStore(s => s.assignStaff)
    const [isOpen, setIsOpen] = React.useState(false)
    const currentStaff = profiles.find(p => p.id === currentStaffId)

    React.useEffect(() => {
        if (profiles.length === 0) loadProfiles()
    }, [profiles.length, loadProfiles])

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700/60 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700/60 transition-colors text-[11px] font-medium text-slate-600 dark:text-zinc-300 shadow-sm"
            >
                <div className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[9px] shrink-0">
                    {currentStaff ? currentStaff.name.charAt(0).toUpperCase() : 'AI'}
                </div>
                <span className="truncate max-w-[80px]">
                    {currentStaff ? currentStaff.name : 'AI 助手 (默认)'}
                </span>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-zinc-800 rounded-xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-slate-100 dark:border-zinc-700/60 z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-700/60 mb-1">
                            指派给员工
                        </div>
                        
                        <button
                            onClick={() => { assignStaff(currentSessionId, undefined); setIsOpen(false) }}
                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-700/40 transition-colors ${!currentStaffId ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-slate-600 dark:text-zinc-300'}`}
                        >
                            <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-zinc-700 flex items-center justify-center font-bold text-[10px] text-slate-500 dark:text-zinc-400">
                                AI
                            </div>
                            AI 助手 (无覆写)
                        </button>
                        
                        <div className="h-px bg-slate-100 dark:bg-zinc-700/60 my-1 line-clamp-1" />
                        
                        <div className="max-h-60 overflow-y-auto">
                            {profiles.length === 0 ? (
                                <div className="px-3 py-4 text-center text-[10px] text-slate-400 dark:text-zinc-500">
                                    暂无其他数字员工
                                </div>
                            ) : (
                                profiles.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => { assignStaff(currentSessionId, p.id); setIsOpen(false) }}
                                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-700/40 transition-colors ${currentStaffId === p.id ? 'text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50/50 dark:bg-indigo-500/10' : 'text-slate-600 dark:text-zinc-300'}`}
                                    >
                                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-[10px] text-white">
                                            {p.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate">{p.name}</div>
                                            {p.description && <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{p.description}</div>}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
