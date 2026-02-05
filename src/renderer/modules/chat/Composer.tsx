import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Square, Paperclip, Settings2, Folder, ChevronDown, X, FileText } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { AppSettings } from '../../../common/types/settings'

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

export function Composer() {
    const [input, setInput] = useState('')
    const [workspacePath, setWorkspacePath] = useState('')
    const {
        isSending,
        addMessage,
        updateLastMessage,
        setSending,
        pendingAttachments,
        addPendingAttachment,
        removePendingAttachment,
        clearPendingAttachments
    } = useChatStore()
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Load initial settings
    useEffect(() => {
        const loadSettings = async () => {
            const settings: AppSettings = await window.electronAPI.getAppSettings()
            setWorkspacePath(settings.workspacePath || '选择工作目录...')
        }
        loadSettings()
    }, [])

    const handleSelectDirectory = async () => {
        const path = await window.electronAPI.selectDirectory()
        if (path) {
            setWorkspacePath(path)
            // Save to settings
            const settings: AppSettings = await window.electronAPI.getAppSettings()
            await window.electronAPI.saveAppSettings({ ...settings, workspacePath: path })
        }
    }

    const handleSelectFile = async () => {
        const path = await window.electronAPI.selectFile()
        if (path) {
            addPendingAttachment(path)
        }
    }

    const handleSend = async () => {
        if (!input.trim() || isSending) return

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
        const cleanupStream = window.electronAPI.onReplyStream((chunk: string, reset?: boolean) => {
            updateLastMessage((msg) => ({
                ...msg,
                content: reset ? chunk : msg.content + chunk
            }))
        })

        const cleanupTrace = window.electronAPI.onReplyTrace((steps: any[]) => {
            updateLastMessage((msg) => ({
                ...msg,
                steps: steps
            }))
        })

        try {
            const response = await window.electronAPI.sendMessage(finalPrompt)

            // 4. Update with final structured data (thoughts, steps)
            updateLastMessage((msg) => ({
                ...msg,
                content: response.finalAnswer || msg.content,
                steps: response.steps
            }))
        } catch (err: any) {
            updateLastMessage((msg) => ({
                ...msg,
                content: `Error: ${err.message}`,
                isError: true
            }))
        } finally {
            cleanupStream()
            cleanupTrace()
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
        <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-10">
            <div className="max-w-4xl mx-auto relative group">
                {/* Glow Effect */}
                <div className="absolute inset-0 bg-indigo-500/10 blur-3xl rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-1000 -z-10" />

                <div className="relative bg-[#1A1A1A]/80 border border-white/10 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl transition-all focus-within:bg-[#222222]/90 focus-within:border-white/20">

                    {/* Attachment List */}
                    {pendingAttachments.length > 0 && (
                        <div className="px-4 pt-4 flex flex-wrap gap-2">
                            {pendingAttachments.map((path, idx) => {
                                const fileName = path.split(/[\\/]/).pop()
                                return (
                                    <div key={idx} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 group/file animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <FileText size={14} className="text-gray-400" />
                                        <span className="text-xs text-gray-300 font-medium">{fileName}</span>
                                        <button
                                            onClick={() => removePendingAttachment(path)}
                                            className="p-1 hover:bg-white/10 rounded-full text-gray-500 hover:text-red-400 transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}

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
                        placeholder="给 Assistant Core 发送消息"
                        className="w-full bg-transparent p-5 pb-14 text-base focus:outline-none text-gray-100 placeholder:text-gray-500 resize-none max-h-64 min-h-[80px] leading-relaxed"
                        rows={1}
                    />

                    {/* Bottom Controls */}
                    <div className="absolute left-4 bottom-3 flex items-center gap-2">
                        {/* File Upload */}
                        <button
                            onClick={handleSelectFile}
                            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-gray-400 hover:text-white transition-all shadow-sm"
                            title="上传文件"
                        >
                            <Paperclip size={18} />
                        </button>

                        {/* Workspace Path Picker */}
                        <button
                            onClick={handleSelectDirectory}
                            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-gray-400 hover:text-white transition-all shadow-sm group/path"
                        >
                            <Folder size={16} className="text-gray-500 group-hover/path:text-indigo-400 transition-colors" />
                            <span className="text-xs font-medium tracking-wide font-mono truncate max-w-[200px]">
                                {displayPath}
                            </span>
                            <ChevronDown size={14} className="text-gray-600" />
                        </button>
                    </div>

                    {/* Send Button */}
                    <button
                        onClick={() => {
                            if (isSending) {
                                window.electronAPI.abortRequest();
                            } else {
                                handleSend();
                            }
                        }}
                        disabled={!isSending && !input.trim()}
                        className={cn(
                            "absolute right-4 bottom-3 p-2.5 rounded-2xl transition-all disabled:opacity-0 disabled:scale-90 shadow-lg",
                            isSending
                                ? "bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white"
                                : "bg-white text-black hover:bg-gray-200"
                        )}
                    >
                        {isSending ? (
                            <Square size={18} fill="currentColor" />
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
