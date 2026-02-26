import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Square, Paperclip, Settings2, Folder, ChevronDown, X, FileText, ArrowUp, Bot, Cpu, Check } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { DEFAULT_PROVIDER_CONFIGS } from '../../../common/types/settings'
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
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all",
                    "bg-slate-100/50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5",
                    "hover:border-indigo-500/30 dark:hover:border-white/20",
                    "text-slate-600 dark:text-zinc-300"
                )}
            >
                <ActiveIcon size={13} className={activeMeta.color} />
                <span className="max-w-[120px] truncate">{activeProvider}</span>
                <ChevronDown size={12} className={cn(
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

export function Composer() {
    const [input, setInput] = useState('')
    const { settings, updateSettings } = useSettingsStore()
    const workspacePath = settings.workspacePath || '选择工作目录...'

    const {
        isSending,
        sessions,
        activeSessionId,
        addMessage,
        updateLastMessage,
        setSending,
        pendingAttachments,
        addPendingAttachment,
        removePendingAttachment,
        clearPendingAttachments
    } = useChatStore()

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

        const currentSession = sessions[activeSessionId]
        if (!currentSession) return

        let finalPrompt = input

        // 如果有附件，在 Prompt 前面追加上下文说明
        if (pendingAttachments.length > 0) {
            const attachmentInfo = pendingAttachments.map(p => `- ${p}`).join('\n')
            finalPrompt = `[用户分享了以下文件供你参考，你可以使用工具读取其内容]:\n${attachmentInfo}\n\n${input}`
        }

        const userInput = input
        setInput('')

        // 1. Add User Message
        addMessage({ role: 'user', content: userInput })

        // 2. Add Placeholder for Assistant
        setSending(true)
        addMessage({ role: 'assistant', content: '' })
        clearPendingAttachments()

        // 3. Setup Stream Listeners
        const cleanupStream = window.electronAPI.agent.onStream((chunk: string, reset?: boolean) => {
            updateLastMessage((msg) => ({
                ...msg,
                content: reset ? chunk : msg.content + chunk
            }))
        })

        const cleanupTrace = window.electronAPI.agent.onStepUpdate((steps: any[]) => {
            updateLastMessage((msg) => ({
                ...msg,
                steps: steps
            }))
        })

        const cleanupError = window.electronAPI.agent.onError((err: any) => {
            updateLastMessage((msg) => ({
                ...msg,
                content: `Error: ${err.message || JSON.stringify(err)}`,
                isError: true
            }))
        })

        const { setAgentEvent } = useChatStore.getState()
        const cleanupState = window.electronAPI.agent.onStateChange((event: any) => {
            console.log('[Composer] Received state change:', event.currentState, event.message);
            setAgentEvent(event)
        })

        try {
            // Start Agent
            await window.electronAPI.agent.start({
                sessionId: activeSessionId,
                prompt: finalPrompt
            });
            // Result comes via stream/events
        } catch (err: any) {
            updateLastMessage((msg) => ({
                ...msg,
                content: `Error: ${err.message}`,
                isError: true
            }))
        } finally {
            cleanupStream()
            cleanupTrace()
            cleanupError()
            cleanupState()
            setAgentEvent(null)
            setSending(false)
        }
    }

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
        }
    }, [input])

    // Format path for display (last part of the path)
    const displayPath = workspacePath.length > 25
        ? '...' + workspacePath.slice(-25)
        : workspacePath

    return (
        <div className="w-full px-4 pb-6 z-10 bg-transparent shrink-0">
            <div className="max-w-4xl mx-auto relative">
                {/* Main Composer Box */}
                <div className="relative bg-white dark:bg-[#1e1e20] border border-slate-200/60 dark:border-white/10 rounded-[26px] shadow-sm hover:shadow-md transition-shadow focus-within:shadow-lg focus-within:border-indigo-500/30 dark:focus-within:border-white/20">

                    {/* Attachment Preview */}
                    {pendingAttachments.length > 0 && (
                        <div className="px-4 pt-3 flex flex-wrap gap-2">
                            {pendingAttachments.map((path, idx) => {
                                const fileName = path.split(/[\\/]/).pop()
                                return (
                                    <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-lg px-2.5 py-1.5 text-xs group/file">
                                        <FileText size={13} className="text-indigo-500" />
                                        <span className="text-slate-600 dark:text-gray-300 max-w-[150px] truncate">{fileName}</span>
                                        <button
                                            onClick={() => removePendingAttachment(path)}
                                            className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
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

                    {/* Toolbar & Send Actions */}
                    <div className="flex items-center justify-between px-3 pb-3 pt-1">

                        {/* Left Tools */}
                        <div className="flex items-center gap-1">

                            {/* Attach File */}
                            <TooltipButton icon={Paperclip} label="Add Attachment" onClick={handleSelectFile} />

                            {/* Model Selector */}
                            <ModelSelector />

                            {/* Directory Picker / Explorer */}
                            <div className="flex items-center bg-slate-100/50 dark:bg-white/5 rounded-xl px-1 py-0.5 ml-1 border border-slate-200/50 dark:border-white/5 hover:border-indigo-500/30 dark:hover:border-white/20 transition-all group/path">
                                <button
                                    onClick={() => window.electronAPI.system.openExplorer(workspacePath)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white dark:text-zinc-500 dark:hover:text-indigo-400 dark:hover:bg-white/5 transition-all"
                                    title="在文件资源管理器中打开"
                                >
                                    <Folder size={14} />
                                </button>
                                <div className="w-[1px] h-3 bg-slate-200 dark:bg-white/10 mx-0.5" />
                                <button
                                    onClick={handleSelectDirectory}
                                    className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200 truncate max-w-[150px] transition-colors"
                                    title="切换工作目录"
                                >
                                    {displayPath}
                                </button>
                            </div>

                        </div>

                        {/* Right: Send Button */}
                        <button
                            onClick={() => isSending ? window.electronAPI.agent.stop(activeSessionId) : handleSend()}
                            disabled={!isSending && !input.trim()}
                            className={cn(
                                "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
                                isSending
                                    ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/20 dark:text-red-400"
                                    : input.trim()
                                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700"
                                        : "bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-zinc-500 cursor-not-allowed"
                            )}
                        >
                            {isSending ? <Square size={14} fill="currentColor" /> : <ArrowUp size={16} strokeWidth={2.5} />}
                        </button>
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
