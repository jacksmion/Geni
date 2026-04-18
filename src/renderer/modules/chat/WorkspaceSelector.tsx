import React, { useState, useRef } from 'react'
import { Folder, FolderOpen, ExternalLink, ChevronDown, Check } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { cn } from '../../utils/cn'
import { useClickOutside } from '../../hooks/useClickOutside'

export function WorkspaceSelector() {
    const globalWorkspacePath = useSettingsStore(s => s.settings.workspacePath)
    const recentWorkspaces = useSettingsStore(s => s.settings.recentWorkspaces)
    const updateSettings = useSettingsStore(s => s.updateSettings)
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const newTaskConfig = useChatStore(s => s.newTaskConfig)
    const currentSession = activeSessionId ? sessions[activeSessionId] : undefined
    const hasMessages = (currentSession?.messages?.length ?? 0) > 0
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const workspacePath = currentSession?.workspacePath || (!activeSessionId ? newTaskConfig.workspacePath : undefined) || globalWorkspacePath

    useClickOutside(dropdownRef, () => setIsOpen(false), isOpen)

    const updateWorkspace = async (path: string) => {
        useChatStore.getState().setSessionConfig(activeSessionId, { workspacePath: path })
        const newRecents = [path, ...(recentWorkspaces || []).filter(p => p !== path)].slice(0, 5)
        await updateSettings({ recentWorkspaces: newRecents })
    }

    const handleSelectDirectory = async () => {
        setIsOpen(false)
        const path = await window.electronAPI.system.selectDirectory()
        if (path) updateWorkspace(path)
    }

    const handleOpenExplorer = () => {
        setIsOpen(false)
        if (workspacePath) window.electronAPI.system.openExplorer(workspacePath)
    }

    const displayPath = workspacePath
        ? (workspacePath.length > 25 ? '...' + workspacePath.slice(-25) : workspacePath)
        : '选择工作目录...'

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex h-8 items-center gap-1.5 px-2.5 rounded-full text-[11px] transition-all bg-transparent border-none",
                    isOpen ? "bg-white dark:bg-[#2a2e34] text-slate-800 dark:text-zinc-200" : "hover:bg-white dark:hover:bg-[#2a2e34]",
                    workspacePath
                        ? (!isOpen && "text-slate-600 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200")
                        : (!isOpen && hasMessages ? "text-slate-500 dark:text-zinc-500" : !isOpen && "text-slate-600 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200")
                )}
                title={workspacePath || !hasMessages ? (workspacePath ? "工作目录" : "请选择工作目录") : "未设置工作目录"}
            >
                <Folder size={12} className={!workspacePath && !hasMessages ? "animate-pulse" : ""} />
                <span className="truncate max-w-[200px] font-medium">{displayPath}</span>
                <ChevronDown size={10} className={cn("transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-3 w-72 bg-white dark:bg-[#1e1e20] border border-slate-200/60 dark:border-white/10 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="p-1 space-y-0.5">
                        {workspacePath && (
                            <button
                                onClick={handleOpenExplorer}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[11.5px] font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors group"
                            >
                                <ExternalLink size={14} className="text-blue-500 group-hover:scale-110 transition-transform" />
                                <span>打开当前目录</span>
                            </button>
                        )}
                        {!hasMessages && (
                            <button
                                onClick={handleSelectDirectory}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[11.5px] font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors group"
                            >
                                <FolderOpen size={14} className="text-emerald-500 group-hover:scale-110 transition-transform" />
                                <span>浏览其他文件夹...</span>
                            </button>
                        )}
                    </div>

                    {!hasMessages && recentWorkspaces && recentWorkspaces.length > 0 && (
                        <>
                            <div className="px-3 py-1.5 border-y border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/10">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">最近使用</span>
                            </div>
                            <div className="p-1 max-h-48 overflow-y-auto space-y-0.5">
                                {recentWorkspaces.map(path => {
                                    const pathName = path.split(/[\\\/]/).pop() || path
                                    const isActive = path === workspacePath
                                    return (
                                        <button
                                            key={path}
                                            onClick={() => {
                                                setIsOpen(false)
                                                if (!isActive) updateWorkspace(path)
                                            }}
                                            className={cn(
                                                "w-full flex flex-col items-start px-3 py-2 text-left rounded-lg transition-colors",
                                                isActive
                                                    ? "bg-indigo-50 dark:bg-indigo-500/10"
                                                    : "hover:bg-slate-50 dark:hover:bg-white/5"
                                            )}
                                        >
                                            <div className="flex items-center gap-2 w-full">
                                                <Folder size={12} className={cn("shrink-0", isActive ? "text-indigo-500" : "text-slate-400 dark:text-zinc-500")} />
                                                <span className={cn(
                                                    "text-[11.5px] font-medium truncate flex-1",
                                                    isActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-zinc-300"
                                                )}>
                                                    {pathName}
                                                </span>
                                                {isActive && <Check size={12} className="text-indigo-500 shrink-0" />}
                                            </div>
                                            <span className="text-[9px] text-slate-400 dark:text-zinc-500 truncate w-full pl-5 mt-0.5" title={path}>
                                                {path}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
