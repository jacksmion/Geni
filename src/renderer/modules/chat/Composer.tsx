import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Square, Plus, X, FileText, ArrowUp, Shield, ShieldCheck } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Skill } from '../../../common/types/skill'
import { cn } from '../../utils/cn'
import { ModelSelector } from './ModelSelector'
import { SkillSelector } from './SkillSelector'
import { WorkspaceSelector } from './WorkspaceSelector'

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

    // 新建/切换会话时自动 focus 输入框
    useEffect(() => {
        textareaRef.current?.focus()
    }, [activeSessionId])


    return (
        <div className="w-full max-w-4xl mx-auto px-4 md:px-8 pb-6 relative z-50 bg-transparent shrink-0">
            <div className="relative w-full">
                {/* Main Composer Box */}
                <div className="relative bg-white/95 dark:bg-[#18181b]/95 backdrop-blur-md rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all focus-within:shadow-[0_12px_48px_rgba(0,0,0,0.08)] dark:focus-within:shadow-[0_12px_48px_rgba(0,0,0,0.6)] focus-within:bg-white dark:focus-within:bg-[#1c1c1f] ring-1 ring-black/5 dark:ring-white/10 focus-within:ring-1.5 focus-within:ring-indigo-500/40 dark:focus-within:ring-indigo-500/30">

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
                        className="composer-textarea w-full bg-transparent px-5 py-4 min-h-[56px] max-h-264 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none resize-none scrollbar-hide"
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
