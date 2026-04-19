import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Square, Plus, X, FileText, ArrowUp, Shield, ShieldCheck, Zap, ChevronRight, Check, Search } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useStaffStore } from '../../store/useStaffStore'
import { Skill } from '../../../common/types/skill'
import { StaffProfile } from '../../../common/types/staff'
import { DEFAULT_PROVIDER_CONFIGS } from '../../../common/types/settings'
import { cn } from '../../utils/cn'
import { PROVIDER_DISPLAY } from '../../utils/providers'
import { useTranslation } from 'react-i18next'
import { StaffAvatar } from '../../components/StaffAvatar'
import { ModelSelector } from './ModelSelector'
import { SkillSelector } from './SkillSelector'
import { WorkspaceSelector } from './WorkspaceSelector'

function getCaretCoordinates(element: HTMLTextAreaElement, position: number) {
    const div = document.createElement('div')
    document.body.appendChild(div)

    const style = div.style
    const computed = window.getComputedStyle(element)

    style.whiteSpace = 'pre-wrap'
    style.wordWrap = 'break-word'
    style.position = 'absolute'
    style.visibility = 'hidden'

    const properties = [
        'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
        'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
        'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
    ]
    properties.forEach((prop: any) => {
        style[prop] = computed[prop]
    })

    div.textContent = element.value.substring(0, position)
    const span = document.createElement('span')
    span.textContent = element.value.substring(position) || '.'
    div.appendChild(span)

    const coordinates = {
        top: span.offsetTop + parseInt(computed.borderTopWidth || '0'),
        left: span.offsetLeft + parseInt(computed.borderLeftWidth || '0'),
        height: parseInt(computed.lineHeight || '0')
    }

    document.body.removeChild(div)
    return coordinates
}

function AccessIndicator() {
    const coreToolSettings = useSettingsStore(s => s.settings.coreToolSettings)
    const updateSettings = useSettingsStore(s => s.updateSettings)
    const { t } = useTranslation()

    const toolEntries = Object.values(coreToolSettings || {})
    const autoCount = toolEntries.filter((tool: any) => tool.trustLevel === 'Auto').length
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
                "flex h-7 items-center gap-1 px-2 rounded-full text-[11px] transition-colors bg-transparent hover:bg-slate-100 dark:hover:bg-white/[0.06]",
                isFullAccess
                    ? "text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                    : "text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
            )}
            title={isFullAccess ? t('composer.fullAccessTitle') : t('composer.askModeTitle')}
        >
            {isFullAccess
                ? <ShieldCheck size={12} />
                : <Shield size={12} />
            }
            <span className="font-medium">{isFullAccess ? t('composer.fullAccess') : t('composer.askMode')}</span>
        </button>
    )
}

export function Composer() {
    const [input, setInput] = useState('')
    const isSending = useChatStore(s => s.activeSessionId ? s.runningSessions.has(s.activeSessionId) : false)
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const newTaskConfig = useChatStore(s => s.newTaskConfig)
    const sendMessage = useChatStore(s => s.sendMessage)
    
    // Resolve current staff for dynamic placeholder
    const currentStaffId = activeSessionId ? sessions[activeSessionId]?.staffId : newTaskConfig.staffId
    const { profiles } = useStaffStore()
    const currentStaff = currentStaffId ? profiles.find(p => p.id === currentStaffId) : null
    const pendingAttachments = useChatStore(s => s.pendingAttachments)
    const addPendingAttachment = useChatStore(s => s.addPendingAttachment)
    const removePendingAttachment = useChatStore(s => s.removePendingAttachment)
    const selectedSkillIds = useChatStore(s => s.selectedSkillIds)
    const setSelectedSkillIds = useChatStore(s => s.setSelectedSkillIds)

    const [skills, setSkills] = useState<Skill[]>([])
    const assignStaff = useChatStore(s => s.assignStaff)
    const { t } = useTranslation()

    const placeholderText = (currentStaff || (selectedSkillIds && selectedSkillIds.length > 0))
        ? ''
        : !activeSessionId
            ? t('chatLayout.placeholderDraft')
            : t('chatLayout.placeholderContinue')

    const [showSlashMenu, setShowSlashMenu] = useState(false)
    const [slashSearchText, setSlashSearchText] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [slashMenuPos, setSlashMenuPos] = useState({ top: 0, left: 0 })
    const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([])

    // Sub-menu state for model switching
    const [slashSubMenu, setSlashSubMenu] = useState<string | null>(null)
    const [modelSearchText, setModelSearchText] = useState('')
    const [modelSelectedIndex, setModelSelectedIndex] = useState(0)
    const modelItemRefs = useRef<(HTMLButtonElement | null)[]>([])

    // Build model list (same logic as ModelSelector)
    const llm = useSettingsStore(s => s.settings.llm)
    const allProviderKeys = Array.from(new Set([
        ...Object.keys(DEFAULT_PROVIDER_CONFIGS),
        ...Object.keys(llm.providers || {})
    ]))
    const availableProviders = allProviderKeys.filter(key => {
        const config = llm.providers?.[key] || DEFAULT_PROVIDER_CONFIGS[key]
        if (!config) return false
        return config.enabled === true
    })
    const currentSession = activeSessionId ? sessions[activeSessionId] : undefined
    const sessionModelId = currentSession?.modelId || (!activeSessionId ? newTaskConfig.modelId : undefined)
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
        m.model.label.toLowerCase().includes(modelSearchText.toLowerCase()) ||
        m.model.model.toLowerCase().includes(modelSearchText.toLowerCase()) ||
        (PROVIDER_DISPLAY[m.providerKey]?.label || m.providerKey).toLowerCase().includes(modelSearchText.toLowerCase())
    )

    // Build unified menu items: staff (only in draft) + skills
    const modelKeyword = slashSearchText.toLowerCase()
    const showModelItem = !modelKeyword || ['model', '模型', '切换'].some(kw => kw.includes(modelKeyword) || modelKeyword.includes(kw))

    const filteredStaff = !activeSessionId
        ? profiles.filter(p =>
            p.name.toLowerCase().includes(slashSearchText.toLowerCase()) ||
            (p.description && p.description.toLowerCase().includes(slashSearchText.toLowerCase()))
        ).map(p => ({ type: 'staff' as const, data: p }))
        : []

    const filteredSkillItems = skills.filter(s =>
        s.name.toLowerCase().includes(slashSearchText.toLowerCase()) ||
        s.id.toLowerCase().includes(slashSearchText.toLowerCase())
    ).map(s => ({ type: 'skill' as const, data: s }))

    const modelMenuItem = showModelItem ? [{ type: 'model' as const }] : []
    const menuItems = [...modelMenuItem, ...filteredStaff, ...filteredSkillItems]

    // Scroll selected menu item into view
    useEffect(() => {
        if (showSlashMenu) {
            menuItemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
        }
    }, [selectedIndex, showSlashMenu])

    // Scroll selected model item into view
    useEffect(() => {
        if (slashSubMenu === 'model') {
            modelItemRefs.current[modelSelectedIndex]?.scrollIntoView({ block: 'nearest' })
        }
    }, [modelSelectedIndex, slashSubMenu])

    // Reset model index when filter changes
    useEffect(() => {
        setModelSelectedIndex(0)
    }, [modelSearchText])

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

    // Select a model and close the sub-menu
    const selectModel = (providerKey: string, modelId: string) => {
        const config = llm.providers?.[providerKey] || DEFAULT_PROVIDER_CONFIGS[providerKey]
        const modelInstance = config?.models?.find(m => m.id === modelId)
        const fullModelId = modelInstance ? `${providerKey}/${modelInstance.model}` : `${providerKey}/${modelId}`
        useChatStore.getState().setSessionConfig(activeSessionId, { modelId: fullModelId })
        setSlashSubMenu(null)
        setModelSearchText('')
        setShowSlashMenu(false)
        textareaRef.current?.focus()
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value
        setInput(value)

        const cursorPosition = e.target.selectionStart || value.length
        const textBeforeCursor = value.slice(0, cursorPosition)
        
        // Match "/text" at the start or after a space
        const match = textBeforeCursor.match(/(?:^|\s)\/([^\s]*)$/)
        if (match) {
            setShowSlashMenu(true)
            setSlashSearchText(match[1])
            setSelectedIndex(0)

            setTimeout(() => {
                if (textareaRef.current) {
                    const coords = getCaretCoordinates(textareaRef.current, cursorPosition)
                    const top = textareaRef.current.offsetTop + coords.top - textareaRef.current.scrollTop - 8
                    let left = textareaRef.current.offsetLeft + coords.left - textareaRef.current.scrollLeft
                    // constrain left to avoid spilling over Screen right
                    const maxLeft = textareaRef.current.offsetWidth - 320 // 320 is max width of menu
                    if (left > maxLeft) left = maxLeft
                    setSlashMenuPos({ top, left })
                }
            }, 0)
        } else {
            setShowSlashMenu(false)
        }
    }

    const handleSelectMenuItem = (item: { type: 'staff', data: StaffProfile } | { type: 'skill', data: Skill } | { type: 'model' }) => {
        if (item.type === 'model') {
            // Enter model sub-menu: clear the /xxx text from input
            if (textareaRef.current) {
                const cursorPosition = textareaRef.current.selectionStart || input.length
                const textBeforeCursor = input.slice(0, cursorPosition)
                const textAfterCursor = input.slice(cursorPosition)
                const match = textBeforeCursor.match(/(^|\s)\/([^\s]*)$/)
                if (match) {
                    const prefix = match[1]
                    const newTextBefore = textBeforeCursor.slice(0, match.index) + prefix
                    const newValue = newTextBefore + textAfterCursor
                    setInput(newValue)
                    setTimeout(() => {
                        if (textareaRef.current) {
                            textareaRef.current.focus()
                            const newPos = newTextBefore.length
                            textareaRef.current.setSelectionRange(newPos, newPos)
                        }
                    }, 0)
                }
            }
            setSlashSubMenu('model')
            setModelSearchText('')
            setModelSelectedIndex(0)
            return
        }

        if (item.type === 'staff') {
            assignStaff(activeSessionId, item.data.id)
        } else {
            if (!selectedSkillIds?.includes(item.data.id)) {
                setSelectedSkillIds([...(selectedSkillIds || []), item.data.id])
            }
        }

        if (textareaRef.current) {
            const cursorPosition = textareaRef.current.selectionStart || input.length
            const textBeforeCursor = input.slice(0, cursorPosition)
            const textAfterCursor = input.slice(cursorPosition)

            const match = textBeforeCursor.match(/(^|\s)\/([^\s]*)$/)
            if (match) {
                const prefix = match[1]
                const newTextBefore = textBeforeCursor.slice(0, match.index) + prefix
                const newValue = newTextBefore + textAfterCursor
                setInput(newValue)
                setTimeout(() => {
                    if (textareaRef.current) {
                        textareaRef.current.focus()
                        const newPos = newTextBefore.length
                        textareaRef.current.setSelectionRange(newPos, newPos)
                    }
                }, 0)
            }
        } else {
            setInput(input.replace(/(^|\s)\/[^\s]*$/, '$1'))
        }
        setShowSlashMenu(false)
    }

    // Auto-resize textarea (up to max height, then scroll)
    useEffect(() => {
        if (textareaRef.current) {
            const el = textareaRef.current
            const maxHeight = 264
            el.style.height = '24px'
            const targetHeight = Math.min(maxHeight, Math.max(24, el.scrollHeight))
            el.style.height = targetHeight + 'px'
            el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
        }
    }, [input])

    // 新建/切换会话时自动 focus 输入框
    useEffect(() => {
        textareaRef.current?.focus()
    }, [activeSessionId])


    return (
        <div className="w-full max-w-3xl mx-auto px-4 md:px-8 pb-3 pt-2 relative z-50 bg-transparent shrink-0">
            <div className="relative w-full">
                {/* Main Composer Box */}
                <div className="relative rounded-[28px] bg-white dark:bg-[#1b1d21] shadow-[0_18px_45px_-22px_rgba(15,23,42,0.14)] transition-all focus-within:shadow-[0_22px_52px_-24px_rgba(15,23,42,0.18)] ring-1 ring-[#E5E7EB] dark:ring-white/[0.08] focus-within:ring-[#D7DCE3] dark:focus-within:ring-white/[0.12]">

                    {/* Slash Command Menu - Primary */}
                    {showSlashMenu && !slashSubMenu && (
                        <div
                            className="absolute w-[80vw] max-w-[520px] bg-white dark:bg-[#1c1c1f] rounded-xl shadow-2xl border border-slate-200/80 dark:border-white/[0.08] overflow-hidden z-50 animate-in fade-in duration-150"
                            style={{
                                top: `${slashMenuPos.top}px`,
                                left: `${slashMenuPos.left}px`,
                                transform: 'translateY(-100%)'
                            }}
                        >
                            <div className="max-h-[216px] overflow-y-auto p-1.5">
                                {/* Model Switch Item */}
                                {showModelItem && (() => {
                                    const isActive = 0 === selectedIndex
                                    return (
                                        <button
                                            ref={el => { menuItemRefs.current[0] = el }}
                                            onClick={(e) => { e.preventDefault(); handleSelectMenuItem({ type: 'model' }) }}
                                            onMouseEnter={() => setSelectedIndex(0)}
                                            className={cn(
                                                "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
                                                isActive
                                                    ? "bg-slate-100 dark:bg-white/[0.07]"
                                                    : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                                            )}
                                        >
                                            <Zap size={12} className="shrink-0 text-indigo-500 dark:text-indigo-400" />
                                            <span className={cn("text-[12px] font-semibold shrink-0", isActive ? "text-slate-900 dark:text-white" : "text-slate-800 dark:text-zinc-100")}>
                                                {t('composer.slashMenu.switchModel')}
                                            </span>
                                            <span className="text-[11px] text-slate-400 dark:text-zinc-500 truncate flex-1 min-w-0">
                                                {t('composer.slashMenu.switchModelDesc')}
                                            </span>
                                            <ChevronRight size={12} className="shrink-0 text-slate-300 dark:text-zinc-600" />
                                        </button>
                                    )
                                })()}

                                {/* Staff Section */}
                                {filteredStaff.length > 0 && (
                                    <>
                                        <div className={cn(
                                            "px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 select-none",
                                            showModelItem ? "pt-1.5 mt-0.5 border-t border-slate-100 dark:border-white/[0.05]" : "pt-1"
                                        )}>
                                            {t('composer.slashMenu.staff')}
                                        </div>
                                        {filteredStaff.map((item, idx) => {
                                            const staff = item.data
                                            const globalIdx = (showModelItem ? 1 : 0) + idx
                                            const isActive = globalIdx === selectedIndex
                                            return (
                                                <button
                                                    key={`staff-${staff.id}`}
                                                    ref={el => { menuItemRefs.current[globalIdx] = el }}
                                                    onClick={(e) => { e.preventDefault(); handleSelectMenuItem(item) }}
                                                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                                                    className={cn(
                                                        "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
                                                        isActive
                                                            ? "bg-slate-100 dark:bg-white/[0.07]"
                                                            : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                                                    )}
                                                >
                                                    <StaffAvatar
                                                        avatar={staff.avatar}
                                                        name={staff.name}
                                                        size={13}
                                                        iconClassName="text-slate-400 dark:text-zinc-500 shrink-0"
                                                    />
                                                    <span className={cn("text-[12px] font-semibold shrink-0", isActive ? "text-slate-900 dark:text-white" : "text-slate-800 dark:text-zinc-100")}>
                                                        {staff.name}
                                                    </span>
                                                    {staff.description && (
                                                        <span className="text-[11px] text-slate-400 dark:text-zinc-500 truncate flex-1 min-w-0">
                                                            {staff.description}
                                                        </span>
                                                    )}
                                                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-zinc-500 ml-2">{t('composer.slashMenu.staffBadge')}</span>
                                                </button>
                                            )
                                        })}
                                    </>
                                )}

                                {/* Skills Section */}
                                {filteredSkillItems.length > 0 && (
                                    <>
                                        <div className={cn(
                                            "px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 select-none",
                                            (showModelItem || filteredStaff.length > 0) ? "pt-1.5 mt-0.5 border-t border-slate-100 dark:border-white/[0.05]" : "pt-1"
                                        )}>
                                            {t('composer.slashMenu.skills')}
                                        </div>
                                        {filteredSkillItems.map((item, idx) => {
                                            const skill = item.data
                                            const globalIdx = (showModelItem ? 1 : 0) + filteredStaff.length + idx
                                            const isActive = globalIdx === selectedIndex
                                            const sourceLabel = (skill as any).source === 'builtin' ? t('composer.slashMenu.sourceBuiltin')
                                                : (skill as any).source === 'project' ? t('composer.slashMenu.sourceProject')
                                                : t('composer.slashMenu.sourcePersonal')
                                            return (
                                                <button
                                                    key={`skill-${skill.id}`}
                                                    ref={el => { menuItemRefs.current[globalIdx] = el }}
                                                    onClick={(e) => { e.preventDefault(); handleSelectMenuItem(item) }}
                                                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                                                    className={cn(
                                                        "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
                                                        isActive
                                                            ? "bg-slate-100 dark:bg-white/[0.07]"
                                                            : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                                                    )}
                                                >
                                                    <Sparkles size={12} className="shrink-0 text-slate-400 dark:text-zinc-500" />
                                                    <span className={cn("text-[12px] font-semibold shrink-0", isActive ? "text-slate-900 dark:text-white" : "text-slate-800 dark:text-zinc-100")}>
                                                        {skill.name}
                                                    </span>
                                                    {skill.description && (
                                                        <span className="text-[11px] text-slate-400 dark:text-zinc-500 truncate flex-1 min-w-0">
                                                            {skill.description}
                                                        </span>
                                                    )}
                                                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-zinc-500 ml-2">{sourceLabel}</span>
                                                </button>
                                            )
                                        })}
                                    </>
                                )}

                                {menuItems.length === 0 && (
                                    <div className="px-3 py-6 text-center text-[13px] text-slate-400 dark:text-zinc-500">
                                        {t('composer.slashMenu.noMatch')}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Slash Command Menu - Model Sub-menu */}
                    {slashSubMenu === 'model' && (
                        <div
                            className="absolute w-[80vw] max-w-[520px] bg-white dark:bg-[#1c1c1f] rounded-xl shadow-2xl border border-slate-200/80 dark:border-white/[0.08] overflow-hidden z-50 animate-in fade-in slide-in-from-left-1 duration-150 flex flex-col"
                            style={{
                                top: `${slashMenuPos.top}px`,
                                left: `${slashMenuPos.left}px`,
                                transform: 'translateY(-100%)'
                            }}
                        >
                            {/* Search bar */}
                            <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-black/10">
                                <div className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-[#121214] border border-slate-200/50 dark:border-white/5 rounded-lg">
                                    <Search size={12} className="text-slate-400 dark:text-zinc-500 shrink-0" />
                                    <input
                                        ref={(el) => {
                                            if (el) setTimeout(() => el.focus(), 0)
                                        }}
                                        type="text"
                                        placeholder={t('composer.slashMenu.searchModel')}
                                        value={modelSearchText}
                                        onChange={e => setModelSearchText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'ArrowDown') {
                                                e.preventDefault()
                                                setModelSelectedIndex((prev) => Math.min(prev + 1, filteredModels.length - 1))
                                            } else if (e.key === 'ArrowUp') {
                                                e.preventDefault()
                                                setModelSelectedIndex((prev) => Math.max(prev - 1, 0))
                                            } else if (e.key === 'Enter') {
                                                e.preventDefault()
                                                const selected = filteredModels[modelSelectedIndex]
                                                if (selected) selectModel(selected.providerKey, selected.model.id)
                                            } else if (e.key === 'Escape') {
                                                e.preventDefault()
                                                setSlashSubMenu(null)
                                                setModelSearchText('')
                                                setShowSlashMenu(false)
                                                textareaRef.current?.focus()
                                            } else if (e.key === 'Backspace' && !modelSearchText) {
                                                e.preventDefault()
                                                setSlashSubMenu(null)
                                                setModelSearchText('')
                                                textareaRef.current?.focus()
                                            }
                                        }}
                                        className="flex-1 bg-transparent text-xs text-slate-700 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none"
                                    />
                                    {modelSearchText && (
                                        <button onClick={() => setModelSearchText('')}>
                                            <X size={12} className="text-slate-300 hover:text-slate-500" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Model list */}
                            <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
                                {filteredModels.length === 0 ? (
                                    <div className="px-4 py-8 text-center">
                                        <p className="text-xs text-slate-400 dark:text-zinc-500">{t('composer.slashMenu.noModelMatch')}</p>
                                    </div>
                                ) : (
                                    filteredModels.map(({ providerKey, model, isActive }, index) => {
                                        const meta = PROVIDER_DISPLAY[providerKey] || { label: providerKey }
                                        const isHighlighted = index === modelSelectedIndex
                                        return (
                                            <button
                                                key={`${providerKey}-${model.id}`}
                                                ref={el => { modelItemRefs.current[index] = el }}
                                                onClick={() => selectModel(providerKey, model.id)}
                                                onMouseEnter={() => setModelSelectedIndex(index)}
                                                className={cn(
                                                    "w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors",
                                                    isHighlighted
                                                        ? "bg-slate-100 dark:bg-white/[0.07]"
                                                        : isActive
                                                            ? "bg-indigo-50/50 dark:bg-indigo-500/5"
                                                            : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                                                )}
                                            >
                                                <span className={cn(
                                                    "text-[12px] font-semibold shrink-0",
                                                    isActive
                                                        ? "text-indigo-600 dark:text-indigo-400"
                                                        : isHighlighted
                                                            ? "text-slate-900 dark:text-white"
                                                            : "text-slate-800 dark:text-zinc-100"
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
                        </div>
                    )}

                    {/* Active Items Preview (Attachments Only) */}
                    {pendingAttachments.length > 0 && (
                        <div className="px-5 pt-4 flex flex-wrap gap-2">
                            {/* Attachments */}
                            {pendingAttachments.map((path, idx) => {
                                const fileName = path.split(/[\\/]/).pop()
                                return (
                                    <div key={`file-${idx}`} className="flex items-center gap-1.5 bg-white/85 dark:bg-white/5 border border-slate-200/80 dark:border-white/5 shadow-sm rounded-lg px-2.5 py-1 font-medium text-[11.5px] text-slate-700 dark:text-zinc-300">
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

                    {/* Input Area with Inline Staff & Skills */}
                    <div className={cn("flex flex-wrap items-start px-5 pt-4 pb-2 gap-2", pendingAttachments.length > 0 ? "pt-2" : "")}>
                        {/* Staff - avatar only */}
                        {currentStaff && (
                            <div
                                className="mt-[1px] w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 cursor-pointer shadow-sm hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-500/40 transition-all group relative"
                                title={t('composer.staffTooltip', { name: currentStaff.name })}
                                onClick={() => {
                                    assignStaff(activeSessionId, undefined)
                                    textareaRef.current?.focus()
                                }}
                            >
                                <StaffAvatar
                                    avatar={currentStaff.avatar}
                                    name={currentStaff.name}
                                    size={13}
                                    iconClassName="text-indigo-600 dark:text-indigo-300"
                                />
                            </div>
                        )}

                        {/* Skills */}
                        {selectedSkillIds !== null && selectedSkillIds.map((skillId) => {
                            const skill = skills.find(s => s.id === skillId)
                            return (
                                <div key={`skill-${skillId}`} className="group flex items-center gap-1 rounded bg-indigo-500/[0.06] dark:bg-indigo-400/[0.08] px-1.5 py-px text-[11px] font-medium text-indigo-600 dark:text-indigo-300 transition-colors hover:bg-indigo-500/[0.12] dark:hover:bg-indigo-400/[0.14]">
                                    <span>{skill?.name || skillId}</span>
                                    <button
                                        onClick={() => {
                                            const newIds = selectedSkillIds.filter(id => id !== skillId);
                                            setSelectedSkillIds(newIds.length === 0 ? [] : newIds);
                                            textareaRef.current?.focus();
                                        }}
                                        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            )
                        })}

                        {/* TextArea */}
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                                // Model sub-menu keyboard handling (fallback when textarea has focus)
                                if (slashSubMenu === 'model') {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        const selected = filteredModels[modelSelectedIndex]
                                        if (selected) selectModel(selected.providerKey, selected.model.id)
                                        return
                                    }
                                    if (e.key === 'Escape') {
                                        e.preventDefault()
                                        setSlashSubMenu(null)
                                        setModelSearchText('')
                                        setShowSlashMenu(false)
                                        return
                                    }
                                    if (e.key === 'Backspace' && !modelSearchText) {
                                        e.preventDefault()
                                        setSlashSubMenu(null)
                                        setModelSearchText('')
                                        return
                                    }
                                    return
                                }

                                // Primary slash menu keyboard handling
                                if (showSlashMenu) {
                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault()
                                        setSelectedIndex((prev) => Math.min(prev + 1, menuItems.length - 1))
                                        return
                                    }
                                    if (e.key === 'ArrowUp') {
                                        e.preventDefault()
                                        setSelectedIndex((prev) => Math.max(prev - 1, 0))
                                        return
                                    }
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        const selected = menuItems[selectedIndex]
                                        if (selected) {
                                            handleSelectMenuItem(selected as any)
                                        }
                                        return
                                    }
                                    if (e.key === 'Escape') {
                                        e.preventDefault()
                                        setShowSlashMenu(false)
                                        return
                                    }
                                }

                                if (e.key === 'Backspace' && !showSlashMenu) {
                                    if (textareaRef.current?.selectionStart === 0 && textareaRef.current?.selectionEnd === 0) {
                                        if (currentStaff) {
                                            e.preventDefault()
                                            assignStaff(activeSessionId, undefined)
                                            return
                                        }
                                        if (selectedSkillIds && selectedSkillIds.length > 0) {
                                            e.preventDefault()
                                            const newIds = [...selectedSkillIds]
                                            newIds.pop()
                                            setSelectedSkillIds(newIds.length > 0 ? newIds : [])
                                            return
                                        }
                                    }
                                }

                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            placeholder={placeholderText}
                            className="composer-textarea flex-1 min-w-[200px] w-full bg-transparent p-0 m-0 min-h-[24px] max-h-264 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none resize-none"
                            rows={1}
                            style={{ lineHeight: '1.5' }}
                        />
                    </div>
                    {/* Inner Toolbar: Attach + Model Selector + Send */}
                    <div className="flex items-center justify-between px-4 pb-3 pt-1 gap-3">
                        {/* Left Tools */}
                        <div className="flex items-center gap-0.5">
                            <button
                                onClick={handleSelectFile}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/[0.06] transition-all"
                                title={t('composer.addAttachment')}
                            >
                                <Plus size={15} strokeWidth={2} />
                            </button>
                            <ModelSelector />
                            <SkillSelector />
                        </div>

                        {/* Right: Send Button */}
                        <button
                            onClick={() => isSending ? window.electronAPI.agent.stop(activeSessionId ?? undefined) : handleSend()}
                            disabled={!isSending && !input.trim()}
                            className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200",
                                isSending
                                    ? "bg-slate-100 text-red-500 hover:bg-red-50 dark:bg-[#23262b] dark:text-red-400 dark:hover:bg-red-500/10"
                                    : input.trim()
                                        ? "bg-slate-900 text-white shadow-[0_8px_20px_-14px_rgba(15,23,42,0.25)] hover:bg-slate-800 active:scale-95 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                                        : "bg-slate-100 text-slate-400 opacity-70 cursor-not-allowed dark:bg-[#23262b] dark:text-zinc-500"
                            )}
                        >
                            {isSending ? <Square size={10} fill="currentColor" /> : <ArrowUp size={16} strokeWidth={2.5} />}
                        </button>
                    </div>
                </div>

                {/* Sub-context bar */}
                <div className="mt-2 flex items-center justify-center">
                    <div className="flex items-center gap-1">
                    <WorkspaceSelector />
                    <AccessIndicator />
                    </div>
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
