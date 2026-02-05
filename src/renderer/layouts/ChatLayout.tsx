import React from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import { MessageList } from '../modules/chat/MessageList'
import { Composer } from '../modules/chat/Composer'
import { SessionSidebar } from './sidebar/SessionSidebar'

export function ChatLayout() {
    const { activeTab, startNewChat, isSending } = useChatStore()

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Session List Sidebar */}
            <SessionSidebar />

            <main className="flex-1 flex flex-col overflow-hidden relative h-full min-w-0 bg-white dark:bg-[#09090b]">
                {/* Header */}
                <header className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 draggable shrink-0 z-10 bg-white dark:bg-[#09090b]">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                        <span className="text-indigo-500 dark:text-indigo-400">Assistant Core</span>
                        <ChevronRight size={12} className="text-slate-400 dark:text-zinc-600" />
                        <span className="text-slate-700 dark:text-zinc-200">
                            {activeTab === 'chat' && 'Agent Chat'}
                            {activeTab === 'settings' && 'System Settings'}
                        </span>
                    </div>

                    {/* New Chat Button - now handled in sidebar, maybe keep as alternative or remove? Keeping for now but maybe redundant */}
                    {activeTab === 'chat' && (
                        <button
                            onClick={startNewChat}
                            disabled={isSending}
                            className="no-drag flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-indigo-500/30 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm dark:shadow-none"
                        >
                            <Plus size={14} />
                            <span>新对话</span>
                        </button>
                    )}
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
