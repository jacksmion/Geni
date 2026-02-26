import React from 'react'
import { ChevronRight, Plus, PanelLeftClose, PanelLeftOpen, Star } from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import { useLayoutStore } from '../store/useLayoutStore'
import { MessageList } from '../modules/chat/MessageList'
import { Composer } from '../modules/chat/Composer'
import { SessionSidebar } from './sidebar/SessionSidebar'
import { StatusIndicator } from '../components/StatusIndicator'

export function ChatLayout() {
    const { activeTab, sessions, activeSessionId } = useChatStore()
    const { sidebarCollapsed, toggleSidebar } = useLayoutStore()
    const currentSession = sessions[activeSessionId]

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Session List Sidebar */}
            <SessionSidebar />

            <main className="flex-1 flex flex-col overflow-hidden relative h-full min-w-0 bg-white dark:bg-[#09090b]">
                {/* Header */}
                <header className="h-11 border-b border-slate-100 dark:border-white/5 flex items-center justify-between px-4 draggable shrink-0 z-10 bg-white dark:bg-[#09090b]">
                    {/* Left: Toggle + Title */}
                    <div className="flex items-center gap-2.5 overflow-hidden">
                        <button
                            onClick={toggleSidebar}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/5 transition-colors"
                            title={sidebarCollapsed ? "展开侧边栏 (Ctrl+B)" : "折叠侧边栏 (Ctrl+B)"}
                        >
                            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                        </button>

                        {currentSession ? (
                            <div className="flex items-center gap-2 min-w-0">
                                <h1 className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200 truncate max-w-md">
                                    {currentSession.title || '新对话'}
                                </h1>
                                <span className="text-[10px] text-slate-300 dark:text-zinc-600 shrink-0 tabular-nums">
                                    {new Date(currentSession.updatedAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400 dark:text-zinc-600">选择一个对话...</div>
                        )}
                    </div>

                </header>

                {/* Main Content Area */}
                <div className="flex-1 overflow-auto relative">
                    <MessageList />
                </div>

                {/* Status Indicator */}
                <StatusIndicator />

                {/* Input Area */}
                <Composer />
            </main>
        </div>
    )
}
