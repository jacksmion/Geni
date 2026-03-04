import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Square, Plus, Settings2, Folder, ChevronDown, X, FileText, ArrowUp, Bot, Cpu, Check, Shield, ShieldCheck, Search } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { DEFAULT_PROVIDER_CONFIGS } from '../../../common/types/settings'
import { Skill } from '../../../common/types/skill'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

// Provider display metadata
const PROVIDER_DISPLAY: Record<string, { icon: any, color: string }> = {
    'OpenAI': { icon: Bot, color: 'text-emerald-500' },
    'Anthropic': { icon: Bot, color: 'text-orange-500' },
    'DeepSeek': { icon: Bot, color: 'text-blue-500' },
    'Local': { icon: Cpu, color: 'text-purple-500' },
}

function ModelSelector() {
    const { settings, updateSettings } = useSettingsStore()
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

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
        ...Object.keys(settings.llm.providers || {})
    ]))

    // Filter to only show providers that are enabled
    const availableProviders = allProviderKeys.filter(key => {
        const config = settings.llm.providers?.[key] || DEFAULT_PROVIDER_CONFIGS[key]
        if (!config) return false
        return config.enabled === true
    })

    const activeProvider = settings.llm.activeProvider || 'OpenAI'
    const activeConfig = settings.llm.providers?.[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider]
    const activeModelName = activeConfig?.model || 'unknown'
    const activeMeta = PROVIDER_DISPLAY[activeProvider] || { icon: Bot, color: 'text-indigo-500' }
    const ActiveIcon = activeMeta.icon

    const handleSelectProvider = async (providerKey: string) => {
        setIsOpen(false)
        if (providerKey === activeProvider) return
        await updateSettings({
            llm: {
                ...settings.llm,
                activeProvider: providerKey
            }
        })
    }

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-medium transition-all",
                    "hover:bg-slate-100 dark:hover:bg-white/5",
                    "text-slate-500 dark:text-zinc-400"
                )}
            >
                <span className="max-w-[120px] truncate">{activeProvider}</span>
                <ChevronDown size={11} className={cn(
                    "text-slate-400 dark:text-zinc-500 transition-transform",
                    isOpen && "rotate-180"
                )} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-[#1e1e20] border border-slate-200/60 dark:border-white/10 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">选择模型</p>
                    </div>

                    {/* Model List */}
                    <div className="py-1 max-h-64 overflow-y-auto">
                        {availableProviders.length === 0 ? (
                            <div className="px-3 py-4 text-center">
                                <p className="text-xs text-slate-400 dark:text-zinc-500">暂无可用模型</p>
                                <p className="text-[10px] text-slate-300 dark:text-zinc-600 mt-1">请在设置中配置 API Key</p>
                            </div>
                        ) : (
                            availableProviders.map(key => {
                                const config = settings.llm.providers?.[key] || DEFAULT_PROVIDER_CONFIGS[key]
                                const meta = PROVIDER_DISPLAY[key] || { icon: Bot, color: 'text-indigo-500' }
                                const Icon = meta.icon
                                const isActive = key === activeProvider

                                return (
                                    <button
                                        key={key}
                                        onClick={() => handleSelectProvider(key)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                                            isActive
                                                ? "bg-indigo-50 dark:bg-indigo-500/10"
                                                : "hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                                            isActive
                                                ? "bg-indigo-100 dark:bg-indigo-500/20"
                                                : "bg-slate-100 dark:bg-white/5"
                                        )}>
                                            <Icon size={14} className={meta.color} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className={cn(
                                                    "text-xs font-medium truncate",
                                                    isActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-zinc-300"
                                                )}>
                                                    {key}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                                                {config?.model || 'No model configured'}
                                            </p>
                                        </div>
                                        {isActive && (
                                            <Check size={14} className="text-indigo-500 shrink-0" />
                                        )}
                                    </button>
                                )
                            })
                        )}
                    </div>

                    {/* Footer hint */}
                    <div className="px-3 py-2 border-t border-slate-100 dark:border-white/5">
                        <p className="text-[10px] text-slate-400 dark:text-zinc-600">在设置中管理更多模型配置</p>
                    </div>
                </div>
            )}
        </div>
    )
}

function AccessIndicator() {
    const { settings, updateSettings } = useSettingsStore()

    // Determine current access mode from core tool settings
    const coreToolSettings = settings.coreToolSettings || {}
    const toolEntries = Object.values(coreToolSettings)
    const autoCount = toolEntries.filter(t => t.trustLevel === 'Auto').length
    const isFullAccess = toolEntries.length > 0 && autoCount >= toolEntries.length / 2

    const handleToggle = async () => {
        const newLevel = isFullAccess ? 'Ask' : 'Auto'
        const updated: Record<string, any> = {}
        for (const [name, tool] of Object.entries(coreToolSettings)) {
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
    const { selectedSkillIds, setSelectedSkillIds } = useChatStore()
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Fetch skills when popover opens
    useEffect(() => {
        if (isOpen) {
            window.electronAPI.tools.getSkills().then(data => {
                setSkills(data)
            })
            setSearch('')
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
                onClick={() => setIsOpen(!isOpen)}
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

export function Composer() {
    const [input, setInput] = useState('')
    const { settings, updateSettings } = useSettingsStore()
    const workspacePath = settings.workspacePath || '选择工作目录...'

    const {
        isSending,
        sessions,
        activeSessionId,
        sendMessage,
        pendingAttachments,
        addPendingAttachment,
        removePendingAttachment,
        selectedSkillIds,
        setSelectedSkillIds
    } = useChatStore()

    const [skills, setSkills] = useState<Skill[]>([])

    // Fetch skills to display their names in badges
    useEffect(() => {
        window.electronAPI.tools.getSkills().then(setSkills)
    }, [])

    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const handleSelectDirectory = async () => {
        const path = await window.electronAPI.system.selectDirectory()
        if (path) {
            await updateSettings({ workspacePath: path })
        }
    }

    const handleSelectFile = async () => {
        const path = await window.electronAPI.system.selectFile()
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

    // Format path for display (last part of the path)
    const displayPath = workspacePath.length > 25
        ? '...' + workspacePath.slice(-25)
        : workspacePath

    return (
        <div className="w-full max-w-4xl mx-auto px-4 md:px-8 pb-6 z-10 bg-transparent shrink-0">
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
                        className="w-full bg-transparent px-5 py-4 min-h-[56px] max-h-64 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none resize-none scrollbar-hide"
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
                    <button
                        onClick={handleSelectDirectory}
                        className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                        title="切换工作目录"
                    >
                        <Folder size={12} />
                        <span className="truncate max-w-[200px]">{displayPath}</span>
                        <ChevronDown size={10} />
                    </button>

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
