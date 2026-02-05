import React from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import { MessageList } from '../modules/chat/MessageList'
import { Composer } from '../modules/chat/Composer'
import { SessionSidebar } from './sidebar/SessionSidebar'

export function ChatLayout() {
    const { activeTab, sessions, activeSessionId } = useChatStore()
    const currentSession = sessions[activeSessionId]

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Session List Sidebar */}
            <SessionSidebar />

            <main className="flex-1 flex flex-col overflow-hidden relative h-full min-w-0 bg-white dark:bg-[#09090b]">
                {/* Header */}
                <header className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-4 draggable shrink-0 z-10 bg-white dark:bg-[#09090b]">
                    {/* Left: Title */}
                    <div className="flex items-center gap-3 overflow-hidden">
                        {currentSession ? (
                            <>
                                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                                    <div className="i-lucide-star text-amber-500 w-4 h-4 text-xs font-bold leading-none">★</div>
                                    {/* Using text star for simplicity or import lucide Star if preferred. Let's use text for now or Star icon. I'll import Star. */}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <h1 className="text-sm font-semibold text-slate-800 dark:text-gray-100 truncate max-w-md">
                                        {currentSession.title || '新对话'}
                                    </h1>
                                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium truncate">
                                        {new Date(currentSession.updatedAt).toLocaleString()}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-sm text-slate-400 dark:text-zinc-600 italic">Select a conversation...</div>
                        )}
                    </div>



                </header>

                {/* Main Content Area */}
                <div className="flex-1 overflow-auto relative">
                    <MessageList />
                </div>

                {/* Input Area */}
                <Composer />
            </main>
        </div>
    )
}
