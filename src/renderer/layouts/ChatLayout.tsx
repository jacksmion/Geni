import React from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import { MessageList } from '../modules/chat/MessageList'
import { Composer } from '../modules/chat/Composer'

export function ChatLayout() {
    const { activeTab, startNewChat, isSending } = useChatStore()

    return (
        <main className="flex-1 flex flex-col overflow-hidden relative h-full">
            {/* Header */}
            <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 draggable shrink-0 bg-black/10 backdrop-blur-sm z-10">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    <span className="text-indigo-400">Assistant Core</span>
                    <ChevronRight size={12} className="text-gray-600" />
                    <span className="text-gray-200">
                        {activeTab === 'chat' && 'Agent Chat'}
                        {activeTab === 'skills' && 'Skill Hub'}
                        {activeTab === 'settings' && 'System Settings'}
                    </span>
                </div>

                {/* New Chat Button */}
                {activeTab === 'chat' && (
                    <button
                        onClick={startNewChat}
                        disabled={isSending}
                        className="no-drag flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus size={14} />
                        <span>新对话</span>
                    </button>
                )}
            </header>

            {/* Main Content Area */}
            <div className="flex-1 overflow-auto scroll-smooth relative">
                <MessageList />
            </div>

            {/* Input Area */}
            <Composer />
        </main>
    )
}
