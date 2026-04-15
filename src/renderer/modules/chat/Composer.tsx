import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Square, Plus, X, FileText, ArrowUp, Shield, ShieldCheck } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useStaffStore } from '../../store/useStaffStore'
import { Skill } from '../../../common/types/skill'
import { StaffProfile } from '../../../common/types/staff'
import { cn } from '../../utils/cn'
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
            title={isFullAccess ? "Full access mode: tools run automatically" : "Ask mode: tools require authorization"}
        >
            {isFullAccess
                ? <ShieldCheck size={12} />
                : <Shield size={12} />
            }
            <span className="font-medium">{isFullAccess ? 'Full access' : 'Ask mode'}</span>
        </button>
    )
}

export function Composer() {
    const [input, setInput] = useState('')
    const isSending = useChatStore(s => s.runningSessions.has(s.activeSessionId))
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const sendMessage = useChatStore(s => s.sendMessage)
    
    // Resolve current staff for dynamic placeholder
    const currentStaffId = sessions[activeSessionId]?.staffId
    const { profiles } = useStaffStore()
    const currentStaff = currentStaffId ? profiles.find(p => p.id === currentStaffId) : null
    const pendingAttachments = useChatStore(s => s.pendingAttachments)
    const addPendingAttachment = useChatStore(s => s.addPendingAttachment)
    const removePendingAttachment = useChatStore(s => s.removePendingAttachment)
    const selectedSkillIds = useChatStore(s => s.selectedSkillIds)
    const setSelectedSkillIds = useChatStore(s => s.setSelectedSkillIds)

    const [skills, setSkills] = useState<Skill[]>([])
    const draftSessionId = useChatStore(s => s.draftSessionId)
    const assignStaff = useChatStore(s => s.assignStaff)
    const isDraft = draftSessionId === activeSessionId
    const { t } = useTranslation()

    const placeholderText = (currentStaff || (selectedSkillIds && selectedSkillIds.length > 0))
        ? ''
        : isDraft
            ? t('chatLayout.placeholderDraft')
            : t('chatLayout.placeholderContinue')

    const [showSlashMenu, setShowSlashMenu] = useState(false)
    const [slashSearchText, setSlashSearchText] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [slashMenuPos, setSlashMenuPos] = useState({ top: 0, left: 0 })
    const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([])

    // Build unified menu items: staff (only in draft) + skills
    const filteredStaff = isDraft
        ? profiles.filter(p =>
            p.name.toLowerCase().includes(slashSearchText.toLowerCase()) ||
            (p.description && p.description.toLowerCase().includes(slashSearchText.toLowerCase()))
        ).map(p => ({ type: 'staff' as const, data: p }))
        : []

    const filteredSkillItems = skills.filter(s =>
        s.name.toLowerCase().includes(slashSearchText.toLowerCase()) ||
        s.id.toLowerCase().includes(slashSearchText.toLowerCase())
    ).map(s => ({ type: 'skill' as const, data: s }))

    const menuItems = [...filteredStaff, ...filteredSkillItems]

    // Scroll selected menu item into view
    useEffect(() => {
        if (showSlashMenu) {
            menuItemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
        }
    }, [selectedIndex, showSlashMenu])

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

    const handleSelectMenuItem = (item: { type: 'staff', data: StaffProfile } | { type: 'skill', data: Skill }) => {
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
        <div className="w-full max-w-3xl mx-auto px-4 md:px-8 pb-6 relative z-50 bg-transparent shrink-0">
            <div className="relative w-full">
                {/* Main Composer Box */}
                <div className="relative bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-md rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] transition-all focus-within:shadow-[0_12px_48px_rgba(0,0,0,0.08)] dark:focus-within:bg-[#1e1e1e] ring-1 ring-black/5 dark:ring-white/10 focus-within:ring-1.5 focus-within:ring-indigo-500/40 dark:focus-within:ring-white/20">

                    {/* Slash Command Menu */}
                    {showSlashMenu && (
                        <div
                            className="absolute w-[80vw] max-w-[520px] bg-white dark:bg-[#1c1c1f] rounded-xl shadow-2xl border border-slate-200/80 dark:border-white/[0.08] overflow-hidden z-50 animate-in fade-in duration-150"
                            style={{
                                top: `${slashMenuPos.top}px`,
                                left: `${slashMenuPos.left}px`,
                                transform: 'translateY(-100%)'
                            }}
                        >
                            <div className="max-h-[216px] overflow-y-auto p-1.5">
                                {/* Staff Section */}
                                {filteredStaff.length > 0 && (
                                    <>
                                        <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 select-none">
                                            数字员工
                                        </div>
                                        {filteredStaff.map((item, idx) => {
                                            const staff = item.data
                                            const globalIdx = idx
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
                                                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-zinc-500 ml-2">员工</span>
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
                                            filteredStaff.length > 0 ? "pt-1.5 mt-0.5 border-t border-slate-100 dark:border-white/[0.05]" : "pt-1"
                                        )}>
                                            技能
                                        </div>
                                        {filteredSkillItems.map((item, idx) => {
                                            const skill = item.data
                                            const globalIdx = filteredStaff.length + idx
                                            const isActive = globalIdx === selectedIndex
                                            const sourceLabel = (skill as any).source === 'builtin' ? '内置'
                                                : (skill as any).source === 'project' ? '项目'
                                                : '个人'
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
                                        没有匹配的结果
                                    </div>
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

                    {/* Input Area with Inline Skills */}
                    <div className={cn("flex flex-wrap items-start px-5 py-4 gap-2", pendingAttachments.length > 0 ? "pt-2" : "")}>
                        {/* Skills */}
                        {selectedSkillIds !== null && selectedSkillIds.map((skillId) => {
                            const skill = skills.find(s => s.id === skillId)
                            return (
                                <div key={`skill-${skillId}`} className="flex items-center gap-1.5 mt-[1px] bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 shadow-sm rounded-md px-2 py-0.5 font-medium text-[12.5px] text-violet-700 dark:text-violet-300 transition-all">
                                    <Sparkles size={12} className="text-violet-500" />
                                    <span>{skill?.name || skillId}</span>
                                    <button
                                        onClick={() => {
                                            const newIds = selectedSkillIds.filter(id => id !== skillId);
                                            setSelectedSkillIds(newIds.length === 0 ? [] : newIds);
                                            textareaRef.current?.focus();
                                        }}
                                        className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                                    >
                                        <X size={12} />
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
                                            handleSelectMenuItem(selected)
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
                    <div className="flex items-center justify-between px-3 pb-3 pt-1">
                        {/* Left Tools */}
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                                        ? "bg-slate-900 dark:bg-white text-white dark:text-black shadow-md hover:scale-[1.02] active:scale-95"
                                        : "bg-slate-200/80 text-slate-400 dark:bg-white/10 dark:text-zinc-500 opacity-60 cursor-not-allowed"
                            )}
                        >
                            {isSending ? <Square size={10} fill="currentColor" /> : <ArrowUp size={16} strokeWidth={2.5} />}
                        </button>
                    </div>
                </div>

                {/* Sub-context bar */}
                <div className="flex items-center justify-center gap-4 mt-2.5 opacity-60 hover:opacity-100 transition-opacity">
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
