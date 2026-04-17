import React, { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X, Check } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { DEFAULT_PROVIDER_CONFIGS } from '../../../common/types/settings'
import { cn } from '../../utils/cn'
import { PROVIDER_DISPLAY } from '../../utils/providers'
import { useClickOutside } from '../../hooks/useClickOutside'
import { ModelListSkeleton } from '../../components/ui/Skeleton'

export function ModelSelector() {
    const llm = useSettingsStore(s => s.settings.llm)
    const setActiveTab = useChatStore(s => s.setActiveTab)
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState('')
    const dropdownRef = useRef<HTMLDivElement>(null)

    const currentSession = sessions[activeSessionId]

    useClickOutside(dropdownRef, () => setIsOpen(false), isOpen)

    const allProviderKeys = Array.from(new Set([
        ...Object.keys(DEFAULT_PROVIDER_CONFIGS),
        ...Object.keys(llm.providers || {})
    ]))

    const availableProviders = allProviderKeys.filter(key => {
        const config = llm.providers?.[key] || DEFAULT_PROVIDER_CONFIGS[key]
        if (!config) return false
        return config.enabled === true
    })

    const sessionModelId = currentSession?.modelId
    let activeProvider = llm.activeProvider || 'OpenAI'
    let activeModelName: string | undefined

    if (sessionModelId) {
        const slashIdx = sessionModelId.indexOf('/')
        if (slashIdx >= 0) {
            activeProvider = sessionModelId.slice(0, slashIdx)
            activeModelName = sessionModelId.slice(slashIdx + 1)
        } else {
            activeModelName = sessionModelId
        }
    }

    const activeConfig = llm.providers?.[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider]

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

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-[#1e1e20] border border-slate-200/60 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col">
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
                                            "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
                                            isActive
                                                ? "bg-indigo-50/50 dark:bg-indigo-500/5"
                                                : "hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <span className={cn(
                                            "text-[12px] font-semibold shrink-0",
                                            isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-zinc-100"
                                        )}>
                                            {model.label}
                                        </span>
                                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-bold tracking-tight">
                                            {meta.label}
                                        </span>
                                        <span className="flex-1" />
                                        {isActive && <Check size={14} className="text-indigo-500 shrink-0" />}
                                    </button>
                                )
                            })
                        )}
                    </div>

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
