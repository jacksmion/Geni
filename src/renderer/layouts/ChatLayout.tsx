import React from 'react'
import { ChevronRight, Plus, PanelLeftClose, PanelLeftOpen, Star, Presentation, BarChart3, GraduationCap, Globe, Bot } from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import { useLayoutStore } from '../store/useLayoutStore'
import { MessageList } from '../modules/chat/MessageList'
import { Composer } from '../modules/chat/Composer'
import { SessionSidebar } from './sidebar/SessionSidebar'
import { StatusIndicator } from '../components/StatusIndicator'
import { useTranslation } from 'react-i18next'

import { GeniLogo } from '../components/GeniLogo'
import { ArtifactPanel } from '../components/ArtifactPanel'

export function ChatLayout() {
    const { activeTab, sessions, activeSessionId, activeArtifact } = useChatStore()
    const { sidebarCollapsed, toggleSidebar } = useLayoutStore()
    const { t } = useTranslation()
    const currentSession = sessions[activeSessionId]
    const hasMessages = currentSession && currentSession.messages && currentSession.messages.length > 0;

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Session List Sidebar */}
            <SessionSidebar />
            <div className="flex-1 flex overflow-hidden relative">
                <main className="flex flex-col overflow-hidden relative h-full min-w-0 bg-white dark:bg-[#0a0a0c] w-full">
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

                            {currentSession ? (
                                <div className="flex items-center gap-2 min-w-0">
                                    <h1 className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200 truncate max-w-md">
                                        {currentSession.title || '新任务'}
                                    </h1>
                                    <span className="text-[10px] text-slate-300 dark:text-zinc-600 shrink-0 tabular-nums hidden md:inline">
                                        {new Date(currentSession.updatedAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            ) : (
                                <div className="text-xs text-slate-400 dark:text-zinc-600">选择一个任务...</div>
                            )}
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
                            <div className="shrink-0 bg-white dark:bg-[#0a0a0c]">
                                <Composer />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto w-full h-full pb-[10vh] animate-in fade-in zoom-in-95 duration-500">
                            {/* Logo */}
                            <div className="w-16 h-16 rounded-[1.25rem] bg-gradient-to-br from-[#ff512f] to-[#dd2476] flex items-center justify-center text-white mb-6 shadow-lg shadow-red-500/20">
                                <Bot size={32} strokeWidth={2.2} className="text-white" />
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
                {activeArtifact && (
                    <aside className="absolute bottom-6 right-6 w-[480px] h-[550px] max-h-[80vh] max-w-[calc(100vw-300px)] bg-[#0d1117] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300 ease-out z-50 rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border border-slate-800 dark:border-white/10">
                        <ArtifactPanel />
                    </aside>
                )}
            </div>
        </div>
    )
}
