import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Square, Plus, Settings2, Folder, ChevronDown, X, FileText, ArrowUp, Check, Shield, ShieldCheck, Search, FolderOpen, ExternalLink, Globe, Zap } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { DEFAULT_PROVIDER_CONFIGS } from '../../../common/types/settings'
import { Skill } from '../../../common/types/skill'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
    OpenAIIcon, AnthropicIcon, DeepSeekIcon, ZhipuIcon,
    MiniMaxIcon, QwenIcon, OllamaIcon, VolcengineIcon,
    CustomProviderIcon
} from '../../components/icons/providers'

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

// Provider display metadata
const PROVIDER_DISPLAY: Record<string, { icon: any, color: string, label: string }> = {
    'OpenAI': { icon: OpenAIIcon, color: '#10a37f', label: 'OpenAI' },
    'Anthropic': { icon: AnthropicIcon, color: '#d97757', label: 'Anthropic' },
    'DeepSeek': { icon: DeepSeekIcon, color: '#4d6df1', label: 'DeepSeek' },
    'ZhipuAI': { icon: ZhipuIcon, color: '#343b4d', label: '智谱 AI' },
    'Volcengine': { icon: VolcengineIcon, color: '#ff4d4f', label: '火山引擎' },
    'Qwen': { icon: QwenIcon, label: '通义千问', color: '#6340ff' },
    'MiniMax': { icon: MiniMaxIcon, label: 'MiniMax', color: '#ff7a00' },
    'Ollama': { icon: OllamaIcon, color: '#444', label: 'Ollama' },
}


function ModelSelector() {
    const llm = useSettingsStore(s => s.settings.llm)
    const updateSettings = useSettingsStore(s => s.updateSettings)
    const setActiveTab = useChatStore(s => s.setActiveTab)
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState('')
    const dropdownRef = useRef<HTMLDivElement>(null)

    const currentSession = sessions[activeSessionId]

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    // Build the list of available models from configured providers
    const allProviderKeys = Array.from(new Set([
        ...Object.keys(DEFAULT_PROVIDER_CONFIGS),
        ...Object.keys(llm.providers || {})
    ]))

    // Filter to only show providers that are enabled
    const availableProviders = allProviderKeys.filter(key => {
        const config = llm.providers?.[key] || DEFAULT_PROVIDER_CONFIGS[key]
        if (!config) return false
        return config.enabled === true
    })

    // Resolve active model: session-level override > global setting
    const sessionModelId = currentSession?.modelId
    let activeProvider = llm.activeProvider || 'OpenAI'
    let activeModelName: string | undefined

    if (sessionModelId) {
        // Parse "Provider/model" format
        const slashIdx = sessionModelId.indexOf('/')
        if (slashIdx >= 0) {
            activeProvider = sessionModelId.slice(0, slashIdx)
            activeModelName = sessionModelId.slice(slashIdx + 1)
        } else {
            activeModelName = sessionModelId
        }
    }

    const activeConfig = llm.providers?.[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider]

    // Get active model display name: session override or global
    let activeDisplayName: string
    if (activeModelName) {
        const matched = activeConfig?.models?.find(m => m.model === activeModelName)
        activeDisplayName = matched?.label || activeModelName
    } else {
        const globalInstance = activeConfig?.models?.find(m => m.id === activeConfig.activeModelId)
        activeDisplayName = globalInstance?.label || activeConfig?.model || 'Select Model'
    }

    const handleSelectModel = async (providerKey: string, modelId: string) => {
        setIsOpen(false)
        // Write to session-level config instead of global
        const config = llm.providers?.[providerKey] || DEFAULT_PROVIDER_CONFIGS[providerKey]
        const modelInstance = config?.models?.find(m => m.id === modelId)
        const fullModelId = modelInstance ? `${providerKey}/${modelInstance.model}` : `${providerKey}/${modelId}`

        useChatStore.getState().setSessionConfig(activeSessionId, { modelId: fullModelId })
    }
    
    const allModels = availableProviders.flatMap(providerKey => {
        const config = llm.providers?.[providerKey] || DEFAULT_PROVIDER_CONFIGS[providerKey]
        return (config?.models || []).filter(m => m.enabled).map(model => ({
            providerKey,
            model,
            isActive: providerKey === activeProvider && (
                activeModelName ? model.model === activeModelName : model.id === config?.activeModelId
            )
        }))
    })

    const filteredModels = allModels.filter(m =>
        m.model.label.toLowerCase().includes(search.toLowerCase()) ||
        m.model.model.toLowerCase().includes(search.toLowerCase()) ||
        (PROVIDER_DISPLAY[m.providerKey]?.label || m.providerKey).toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                onClick={() => {
                    setIsOpen(!isOpen)
                    setSearch('')
                }}
                className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-medium transition-all text-slate-500 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-white/5",
                    isOpen && "text-indigo-600 dark:text-indigo-400 bg-slate-100 dark:bg-white/5"
                )}
            >
                <span className="max-w-[150px] truncate">{activeDisplayName}</span>
                <ChevronDown size={11} className={cn(
                    "opacity-50 transition-transform",
                    isOpen && "rotate-180 opacity-100"
                )} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-[#1e1e20] border border-slate-200/60 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col">
                    {/* Search Input Header */}
                    <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-black/10">
                        <div className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-[#121214] border border-slate-200/50 dark:border-white/5 rounded-lg">
                            <Search size={12} className="text-slate-400 dark:text-zinc-500 shrink-0" />
                            <input
                                type="text"
                                placeholder="搜索模型..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="flex-1 bg-transparent text-xs text-slate-700 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none"
                                autoFocus
                            />
                            {search && (
                                <button onClick={() => setSearch('')}>
                                    <X size={12} className="text-slate-300 hover:text-slate-500" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Model List */}
                    <div className="py-1 max-h-72 overflow-y-auto custom-scrollbar">
                        {filteredModels.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <p className="text-xs text-slate-400 dark:text-zinc-500">{search ? '未找到匹配模型' : '暂无可用模型'}</p>
                            </div>
                        ) : (
                            filteredModels.map(({ providerKey, model, isActive }) => {
                                const meta = PROVIDER_DISPLAY[providerKey] || { label: providerKey }

                                return (
                                    <button
                                        key={`${providerKey}-${model.id}`}
                                        onClick={() => handleSelectModel(providerKey, model.id)}
                                        className={cn(
                                            "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors",
                                            isActive
                                                ? "bg-indigo-50/50 dark:bg-indigo-500/5"
                                                : "hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <div className="flex-1 min-w-0 flex flex-col">
                                            <span className={cn(
                                                "text-[13px] truncate",
                                                isActive ? "text-indigo-600 dark:text-indigo-400 font-medium" : "text-slate-700 dark:text-slate-200"
                                            )}>
                                                {model.label}
                                            </span>
                                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-bold tracking-tight">
                                                {meta.label}
                                            </span>
                                        </div>

                                        {isActive && <Check size={14} className="text-indigo-500 shrink-0 ml-2" />}
                                    </button>
                                )
                            })
                        )}
                    </div>

                    {/* Footer - Jump to Settings */}
                    <button
                        onClick={() => setActiveTab('settings')}
                        className="px-3 py-2 bg-slate-50/50 dark:bg-black/5 border-t border-slate-100 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                        <p className="text-[9px] text-slate-400 dark:text-zinc-600 text-center uppercase tracking-wider font-medium">在设置中管理模型配置</p>
                    </button>
                </div>
            )}
        </div>
    )
}

function AccessIndicator() {
    const coreToolSettings = useSettingsStore(s => s.settings.coreToolSettings)
    const updateSettings = useSettingsStore(s => s.updateSettings)

    // Determine current access mode from core tool settings
    const toolEntries = Object.values(coreToolSettings || {})
    const autoCount = toolEntries.filter((t: any) => t.trustLevel === 'Auto').length
    const isFullAccess = toolEntries.length > 0 && autoCount >= toolEntries.length / 2

    const handleToggle = async () => {
        const newLevel = isFullAccess ? 'Ask' : 'Auto'
        const updated: Record<string, any> = {}
        for (const [name, tool] of Object.entries(coreToolSettings || {})) {
            updated[name] = { ...tool, trustLevel: newLevel }
        }
        await updateSettings({ coreToolSettings: updated })
    }

    return (
        <button
            onClick={handleToggle}
            className={cn(
                "flex items-center gap-1.5 text-[11px] transition-colors",
                isFullAccess
                    ? "text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                    : "text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
            )}
            title={isFullAccess ? "完全访问：工具自动执行" : "确认模式：工具需用户授权"}
        >
            {isFullAccess
                ? <ShieldCheck size={12} />
                : <Shield size={12} />
            }
            <span className="font-medium">{isFullAccess ? 'Full access' : 'Ask mode'}</span>
        </button>
    )
}

function SkillSelector() {
    const [isOpen, setIsOpen] = useState(false)
    const [skills, setSkills] = useState<Skill[]>([])
    const [search, setSearch] = useState('')
    const selectedSkillIds = useChatStore(s => s.selectedSkillIds)
    const setSelectedSkillIds = useChatStore(s => s.setSelectedSkillIds)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Fetch skills when popover opens
    useEffect(() => {
        if (isOpen) {
            window.electronAPI.tools.getSkills().then(data => {
                setSkills(data)
            })
        }
    }, [isOpen])

    // Outside click to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        if (isOpen) document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    // Effective selected IDs: null means follow global defaults
    const effectiveIds = selectedSkillIds ?? skills.filter(s => s.enabled).map(s => s.id)
    const selectedCount = effectiveIds.length

    const filteredSkills = skills.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase())
    )

    const handleToggle = (id: string) => {
        const ids = [...effectiveIds]
        const newIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
        setSelectedSkillIds(newIds)
    }

    const handleSelectAll = () => setSelectedSkillIds(skills.map(s => s.id))
    const handleDeselectAll = () => setSelectedSkillIds([])
    const handleReset = () => {
        setSelectedSkillIds(null)
        setIsOpen(false)
    }

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                onClick={() => {
                    const nextState = !isOpen;
                    setIsOpen(nextState);
                    if (nextState) setSearch('');
                }}
                className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-medium transition-all max-w-[200px]",
                    "hover:bg-slate-100 dark:hover:bg-white/5",
                    selectedCount > 0
                        ? "text-violet-600 dark:text-violet-400"
                        : "text-slate-500 dark:text-zinc-400"
                )}
            >
                <Sparkles size={12} className="shrink-0" />
                <span className="truncate">
                    {skills.length === 0 ? 'Skills' : `${selectedCount} Skills`}
                </span>
                <ChevronDown size={11} className={cn(
                    "text-slate-400 dark:text-zinc-500 transition-transform shrink-0",
                    isOpen && "rotate-180"
                )} />
            </button>

            {/* Popover */}
            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-[#1e1e20] border border-slate-200/60 dark:border-white/10 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    {/* Header with Search */}
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5">
                        <div className="flex items-center gap-2">
                            <Search size={12} className="text-slate-400 dark:text-zinc-500 shrink-0" />
                            <input
                                type="text"
                                placeholder="搜索技能..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="flex-1 bg-transparent text-xs text-slate-700 dark:text-zinc-300 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none"
                                autoFocus
                            />
                            <span className="text-[10px] text-slate-300 dark:text-zinc-600 tabular-nums shrink-0">
                                {selectedCount}/{skills.length}
                            </span>
                        </div>
                    </div>

                    {/* Skill List */}
                    <div className="py-1 max-h-56 overflow-y-auto">
                        {filteredSkills.length === 0 ? (
                            <div className="px-3 py-4 text-center">
                                <p className="text-xs text-slate-400 dark:text-zinc-500">
                                    {search ? '未找到相关技能' : '暂无可用技能'}
                                </p>
                            </div>
                        ) : (
                            filteredSkills.map(skill => {
                                const isChecked = effectiveIds.includes(skill.id)
                                return (
                                    <button
                                        key={skill.id}
                                        onClick={() => handleToggle(skill.id)}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                                            isChecked
                                                ? "bg-violet-50 dark:bg-violet-500/10"
                                                : "hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        {/* Checkbox */}
                                        <div className={cn(
                                            "w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors",
                                            isChecked
                                                ? "bg-violet-500 border-violet-500"
                                                : "border-slate-300 dark:border-zinc-600"
                                        )}>
                                            {isChecked && <Check size={10} className="text-white" strokeWidth={3} />}
                                        </div>
                                        {/* Skill Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-slate-700 dark:text-zinc-300 truncate">
                                                {skill.name}
                                            </div>
                                            <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                                                {skill.description}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-3 py-2 border-t border-slate-100 dark:border-white/5 flex items-center gap-2">
                        <button
                            onClick={handleSelectAll}
                            className="text-[10px] text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                        >
                            全选
                        </button>
                        <span className="text-slate-200 dark:text-zinc-700">|</span>
                        <button
                            onClick={handleDeselectAll}
                            className="text-[10px] text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                        >
                            全不选
                        </button>
                        <span className="text-slate-200 dark:text-zinc-700">|</span>
                        <button
                            onClick={handleReset}
                            className="text-[10px] text-violet-400 dark:text-violet-500 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                        >
                            重置为默认
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

function WorkspaceSelector() {
    const globalWorkspacePath = useSettingsStore(s => s.settings.workspacePath)
    const recentWorkspaces = useSettingsStore(s => s.settings.recentWorkspaces)
    const updateSettings = useSettingsStore(s => s.updateSettings)
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const currentSession = sessions[activeSessionId]
    const hasMessages = (currentSession?.messages?.length ?? 0) > 0
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Session-level workspace override, fallback to global
    const workspacePath = currentSession?.workspacePath || globalWorkspacePath

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        if (isOpen) document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    const updateWorkspace = async (path: string) => {
        // Update session-level workspace path
        useChatStore.getState().setSessionConfig(activeSessionId, { workspacePath: path })
        // Also update global recents
        const newRecents = [path, ...(recentWorkspaces || []).filter(p => p !== path)].slice(0, 5)
        await updateSettings({
            recentWorkspaces: newRecents
        })
    }

    const handleSelectDirectory = async () => {
        setIsOpen(false)
        const path = await window.electronAPI.system.selectDirectory()
        if (path) {
            updateWorkspace(path)
        }
    }

    const handleOpenExplorer = () => {
        setIsOpen(false)
        if (workspacePath) {
            window.electronAPI.system.openExplorer(workspacePath)
        }
    }

    const displayPath = workspacePath
        ? (workspacePath.length > 25 ? '...' + workspacePath.slice(-25) : workspacePath)
        : '选择工作目录...'

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg text-[11px] transition-all",
                    isOpen ? "bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-zinc-200" : "hover:bg-slate-100 dark:hover:bg-white/5",
                    workspacePath
                        ? (!isOpen && "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300")
                        : (!isOpen && hasMessages ? "text-slate-400 dark:text-zinc-500" : !isOpen && "text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300")
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
                                <span>在文件管理器中打开当前目录</span>
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
                                    const pathName = path.split(/[\\/]/).pop() || path;
                                    const isActive = path === workspacePath;
                                    return (
                                        <button
                                            key={path}
                                            onClick={() => {
                                                setIsOpen(false);
                                                if (!isActive) updateWorkspace(path);
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
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

export function Composer() {
    const [input, setInput] = useState('')
    const isSending = useChatStore(s => s.runningSessions.has(s.activeSessionId))
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sendMessage = useChatStore(s => s.sendMessage)
    const pendingAttachments = useChatStore(s => s.pendingAttachments)
    const addPendingAttachment = useChatStore(s => s.addPendingAttachment)
    const removePendingAttachment = useChatStore(s => s.removePendingAttachment)
    const selectedSkillIds = useChatStore(s => s.selectedSkillIds)
    const setSelectedSkillIds = useChatStore(s => s.setSelectedSkillIds)

    const [skills, setSkills] = useState<Skill[]>([])

    // Fetch skills to display their names in badges
    useEffect(() => {
        window.electronAPI.tools.getSkills().then(setSkills)
    }, [])

    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const handleSelectFile = async () => {
        const path = await window.electronAPI.system.selectFile(true)
        if (path) {
            addPendingAttachment(path)
        }
    }

    const handleSend = async () => {
        if (!input.trim() || isSending) return

        const userInput = input
        const attachments = [...pendingAttachments]
        setInput('')

        await sendMessage(userInput, attachments)
    }

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '56px'
            textareaRef.current.style.height = Math.max(56, textareaRef.current.scrollHeight) + 'px'
        }
    }, [input])


    return (
        <div className="w-full max-w-4xl mx-auto px-4 md:px-8 pb-6 relative z-50 bg-transparent shrink-0">
            <div className="relative w-full">
                {/* Main Composer Box */}
                <div className="relative bg-white/95 dark:bg-[#18181b]/95 backdrop-blur-md rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all focus-within:shadow-[0_12px_48px_rgba(0,0,0,0.08)] dark:focus-within:shadow-[0_12px_48px_rgba(0,0,0,0.6)] focus-within:bg-white dark:focus-within:bg-[#1c1c1f] ring-1 ring-black/5 dark:ring-white/10 focus-within:ring-indigo-500/20 dark:focus-within:ring-indigo-500/40">

                    {/* Active Items Preview (Attachments & Custom Skills) */}
                    {(pendingAttachments.length > 0 || (selectedSkillIds !== null && selectedSkillIds.length > 0)) && (
                        <div className="px-5 pt-4 flex flex-wrap gap-2">
                            {/* Skills */}
                            {selectedSkillIds !== null && selectedSkillIds.map((skillId) => {
                                const skill = skills.find(s => s.id === skillId)
                                return (
                                    <div key={`skill-${skillId}`} className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 shadow-sm rounded-lg px-2.5 py-1 font-medium text-[11.5px] text-violet-700 dark:text-violet-300">
                                        <Sparkles size={12} />
                                        <span>{skill?.name || skillId}</span>
                                        <button
                                            onClick={() => {
                                                const newIds = selectedSkillIds.filter(id => id !== skillId);
                                                setSelectedSkillIds(newIds.length === 0 ? [] : newIds);
                                            }}
                                            className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                )
                            })}
                            {/* Attachments */}
                            {pendingAttachments.map((path, idx) => {
                                const fileName = path.split(/[\\/]/).pop()
                                return (
                                    <div key={`file-${idx}`} className="flex items-center gap-1.5 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 shadow-sm rounded-lg px-2.5 py-1 font-medium text-[11.5px] text-slate-700 dark:text-zinc-300">
                                        <FileText size={12} className="text-indigo-500" />
                                        <span className="max-w-[150px] truncate">{fileName}</span>
                                        <button
                                            onClick={() => removePendingAttachment(path)}
                                            className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* TextArea */}
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                        placeholder="Message Geni..."
                        className="w-full bg-transparent px-5 py-4 min-h-[56px] max-h-264 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none resize-none scrollbar-hide"
                        rows={1}
                        style={{ lineHeight: '1.5' }}
                    />

                    {/* Inner Toolbar: Attach + Model Selector + Send */}
                    <div className="flex items-center justify-between px-3 pb-3 pt-1">
                        {/* Left Tools */}
                        <div className="flex items-center gap-1.5">
                            {/* Add / Attach Button */}
                            <button
                                onClick={handleSelectFile}
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-zinc-200 transition-all"
                                title="Add Attachment"
                            >
                                <Plus size={16} strokeWidth={2} />
                            </button>
                            <ModelSelector />
                            <SkillSelector />
                        </div>

                        {/* Right: Send Button */}
                        <button
                            onClick={() => isSending ? window.electronAPI.agent.stop(activeSessionId) : handleSend()}
                            disabled={!isSending && !input.trim()}
                            className={cn(
                                "flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200",
                                isSending
                                    ? "bg-slate-100 dark:bg-white/10 text-red-500 dark:text-red-400 border-2 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10"
                                    : input.trim()
                                        ? "bg-indigo-600 text-white shadow-[0_4px_16px_rgba(79,70,229,0.3)] hover:bg-indigo-700 hover:shadow-[0_6px_20px_rgba(79,70,229,0.4)] scale-100 hover:scale-[1.02]"
                                        : "bg-slate-200/80 text-slate-400 dark:bg-white/10 dark:text-zinc-500 opacity-60 cursor-not-allowed"
                            )}
                        >
                            {isSending ? <Square size={10} fill="currentColor" /> : <ArrowUp size={16} strokeWidth={2.5} />}
                        </button>
                    </div>
                </div>

                {/* Outer Context Bar: Workspace + Access */}
                <div className="flex items-center gap-3 px-4 pt-2">
                    <WorkspaceSelector />
                    <AccessIndicator />
                </div>
            </div>
        </div>
    )
}

function TooltipButton({ icon: Icon, label, onClick, active }: { icon: any, label: string, onClick?: () => void, active?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "p-2 rounded-lg transition-colors group relative",
                active
                    ? "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/10"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-white/5"
            )}
            title={label}
        >
            <Icon size={18} strokeWidth={1.5} />
        </button>
    )
}
