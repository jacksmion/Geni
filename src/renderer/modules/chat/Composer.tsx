import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Square } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

export function Composer() {
    const [input, setInput] = useState('')
    const { isSending, addMessage, updateLastMessage, setSending } = useChatStore()
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const handleSend = async () => {
        if (!input.trim() || isSending) return

        const userInput = input
        setInput('')

        // 1. Add User Message
        addMessage({ role: 'user', content: userInput })

        // 2. Add Placeholder for Assistant
        setSending(true)
        addMessage({ role: 'assistant', content: '' })

        // 3. Setup Stream Listeners
        const cleanupStream = window.electronAPI.onReplyStream((chunk: string) => {
            updateLastMessage((msg) => ({
                ...msg,
                content: msg.content + chunk
            }))
        })

        const cleanupTrace = window.electronAPI.onReplyTrace((steps: any[]) => {
            updateLastMessage((msg) => ({
                ...msg,
                steps: steps
            }))
        })

        try {
            const response = await window.electronAPI.sendMessage(userInput)

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

    return (
        <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-10">
            <div className="max-w-4xl mx-auto relative group">
                {/* Glow Effect */}
                <div className="absolute inset-0 bg-indigo-500/10 blur-3xl rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-1000 -z-10" />

                <div className="relative bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl transition-all focus-within:bg-white/10 focus-within:border-indigo-500/30">
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
                        placeholder="Ask me anything directly, or ask me to perform tasks..."
                        className="w-full bg-transparent p-4 pr-14 text-sm focus:outline-none text-gray-200 placeholder:text-gray-500 resize-none max-h-48 min-h-[60px]"
                        rows={1}
                    />

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
                            "absolute right-2 bottom-2 p-2 rounded-xl transition-all disabled:opacity-0 disabled:scale-75",
                            isSending
                                ? "bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white"
                                : "bg-indigo-600 hover:bg-indigo-500 text-white"
                        )}
                    >
                        {isSending ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-square"><rect width="18" height="18" x="3" y="3" rx="2" strokeWidth="0" /></svg>
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
