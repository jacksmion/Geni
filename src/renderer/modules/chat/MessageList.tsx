import React, { useEffect, useRef } from 'react'
import { Bot, User, CheckCircle2, Terminal } from 'lucide-react'
import { useChatStore, ChatMessage } from '../../store/useChatStore'
import ThoughtTrace from '../../components/ThoughtTrace'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

export function MessageList() {
    const { messages } = useChatStore()
    const endRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 pb-32 space-y-8">
            {messages.map((msg) => (
                <MessageItem key={msg.id} message={msg} />
            ))}
            <div ref={endRef} />
        </div>
    )
}

function MessageItem({ message }: { message: ChatMessage }) {
    const isUser = message.role === 'user'

    return (
        <div className={cn(
            "flex gap-5 group animate-in slide-in-from-bottom-2 duration-500 fade-in",
            isUser && "flex-row-reverse"
        )}>
            {/* Avatar */}
            <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ring-1 ring-white/10",
                isUser
                    ? "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20"
                    : "bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] shadow-black/40"
            )}>
                {isUser ? <User size={20} className="text-white" /> : <Bot size={20} className="text-indigo-400" />}
            </div>

            {/* Content */}
            <div className={cn("max-w-[85%] space-y-2", isUser && "items-end flex flex-col")}>

                {/* Helper for Assistant: Thoughts/Tools */}
                {!isUser && message.steps && message.steps.length > 0 && (
                    <div className="w-full mb-2">
                        {/* We can use the existing ThoughtTrace here, or build a better one */}
                        <ThoughtTrace steps={message.steps} />
                    </div>
                )}

                {/* Message Bubble */}
                <div className={cn(
                    "p-5 rounded-3xl shadow-sm backdrop-blur-md border leading-relaxed text-[15px]",
                    isUser
                        ? "bg-gradient-to-br from-indigo-600/90 to-violet-600/90 border-indigo-500/30 rounded-tr-none text-white shadow-indigo-900/10"
                        : "bg-white/5 border-white/5 rounded-tl-none text-gray-200"
                )}>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                </div>

                {/* Meta Info */}
                <div className={cn(
                    "text-[10px] text-gray-600 font-medium px-1 opacity-0 group-hover:opacity-100 transition-opacity",
                    isUser ? "text-right" : ""
                )}>
                    {new Date(message.timestamp).toLocaleTimeString()} · {isUser ? 'You' : 'AI Assistant'}
                </div>
            </div>
        </div>
    )
}
