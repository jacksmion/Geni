import React, { useState } from 'react'
import { Bot, Settings as SettingsIcon, ToyBrick as Brick, MessageSquare, Send, User, ChevronRight } from 'lucide-react'
import SkillHub from './pages/SkillHub'
import Settings from './pages/Settings'
import ThoughtTrace from './components/ThoughtTrace'

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    steps?: any[];
}

type Tab = 'chat' | 'skills' | 'settings';

function App() {
    const [activeTab, setActiveTab] = useState<Tab>('chat')
    const [input, setInput] = useState('')
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: '你好！我是基于 ReAct 模式驱动的本地智能代理。你可以通过技能中心配置我的能力。' }
    ])
    const [isSending, setIsSending] = useState(false)

    const handleSend = async () => {
        if (!input.trim() || isSending) return

        const userMsg: ChatMessage = { role: 'user', content: input }

        // 1. 添加用户消息，并预先添加一个空的助手消息用于流式展示
        setMessages(prev => [
            ...prev,
            userMsg,
            { role: 'assistant', content: '' }
        ])

        const currentInput = input
        setInput('')
        setIsSending(true)

        // 2. 注册流监听器
        const cleanup = window.electronAPI.onReplyStream((chunk: string) => {
            setMessages(prev => {
                const newMsgs = [...prev]
                const lastIdx = newMsgs.length - 1
                const lastMsg = newMsgs[lastIdx]
                // 确保我们更新的是最后一条且是助手消息
                if (lastMsg && lastMsg.role === 'assistant') {
                    newMsgs[lastIdx] = { ...lastMsg, content: lastMsg.content + chunk }
                }
                return newMsgs
            })
        })

        try {
            const response = await window.electronAPI.sendMessage(currentInput)

            // 3. 任务完成，更新完整信息（包括 Thinking Steps）
            setMessages(prev => {
                const newMsgs = [...prev]
                const lastIdx = newMsgs.length - 1
                const lastMsg = newMsgs[lastIdx]

                if (lastMsg && lastMsg.role === 'assistant') {
                    newMsgs[lastIdx] = {
                        ...lastMsg,
                        content: response.finalAnswer || lastMsg.content,
                        steps: response.steps
                    }
                }
                return newMsgs
            })
        } catch (error) {
            console.error('Failed to send message:', error)
            setMessages(prev => {
                const newMsgs = [...prev]
                newMsgs[newMsgs.length - 1] = {
                    role: 'assistant',
                    content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                }
                return newMsgs
            })
        } finally {
            cleanup()
            setIsSending(false)
        }
    }

    // 检查 Electron 环境是否就绪
    if (!window.electronAPI) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#1e1e1e] text-white p-8">
                <div className="max-w-md text-center space-y-4">
                    <div className="text-4xl">⚠️</div>
                    <h1 className="text-xl font-bold">Electron 环境未检测到</h1>
                    <p className="text-gray-400 text-sm">
                        Preload 脚本加载失败，无法与主进程通信。这通常是因为开发环境路径配置问题或沙箱限制。
                    </p>
                    <div className="p-4 bg-black/30 rounded text-left text-xs font-mono text-indigo-300">
                        Error: window.electronAPI is undefined
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-transparent text-gray-100 font-sans overflow-hidden selection:bg-indigo-500/30">
            {/* Sidebar */}
            <aside className="w-18 flex flex-col items-center py-6 bg-black/20 backdrop-blur-xl border-r border-white/5 shrink-0 z-20">
                <div className="mb-8 p-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">
                    <Bot size={24} className="text-white" />
                </div>

                <nav className="flex-1 flex flex-col gap-4 w-full px-3">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`p-3 rounded-xl transition-all duration-300 group relative ${activeTab === 'chat'
                            ? 'bg-white/10 text-white shadow-inner'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                    >
                        <MessageSquare size={22} strokeWidth={1.5} />
                        {activeTab === 'chat' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('skills')}
                        className={`p-3 rounded-xl transition-all duration-300 group relative ${activeTab === 'skills'
                            ? 'bg-white/10 text-white shadow-inner'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                    >
                        <Brick size={22} strokeWidth={1.5} />
                        {activeTab === 'skills' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full" />}
                    </button>
                </nav>

                <div className="px-3 w-full">
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`p-3 w-full rounded-xl transition-all duration-300 flex justify-center ${activeTab === 'settings'
                            ? 'bg-white/10 text-white shadow-inner'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                    >
                        <SettingsIcon size={22} strokeWidth={1.5} />
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                {/* Header */}
                <header className="h-14 border-b border-white/5 flex items-center px-6 draggable shrink-0 bg-black/10 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                        <span className="text-indigo-400">Assistant Core</span>
                        <ChevronRight size={12} className="text-gray-600" />
                        <span className="text-gray-200">
                            {activeTab === 'chat' && 'Agent Chat'}
                            {activeTab === 'skills' && 'Skill Hub'}
                            {activeTab === 'settings' && 'System Settings'}
                        </span>
                    </div>
                </header>

                <div className="flex-1 overflow-auto scroll-smooth">
                    {activeTab === 'chat' && (
                        <div className="max-w-4xl mx-auto p-4 md:p-8 pb-32 space-y-8">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex gap-5 ${msg.role === 'user' ? 'flex-row-reverse' : ''} group animate-in slide-in-from-bottom-2 duration-500 fade-in`}>
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ring-1 ring-white/10 ${msg.role === 'assistant'
                                        ? 'bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] shadow-black/40'
                                        : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20'
                                        }`}>
                                        {msg.role === 'assistant'
                                            ? <Bot size={20} className="text-indigo-400" />
                                            : <User size={20} className="text-white" />}
                                    </div>
                                    <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>

                                        {msg.steps && (
                                            <div className="w-full">
                                                <ThoughtTrace steps={msg.steps} />
                                            </div>
                                        )}

                                        <div className={`p-5 rounded-3xl shadow-sm backdrop-blur-md border leading-relaxed text-[15px] ${msg.role === 'assistant'
                                            ? 'bg-white/5 border-white/5 rounded-tl-none text-gray-200'
                                            : 'bg-gradient-to-br from-indigo-600/90 to-violet-600/90 border-indigo-500/30 rounded-tr-none text-white shadow-indigo-900/10'
                                            }`}>
                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                        </div>

                                        <div className={`text-[10px] text-gray-600 font-medium px-1 opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === 'user' ? 'text-right' : ''}`}>
                                            {msg.role === 'assistant' ? 'AI Assistant' : 'You'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {isSending && (
                                <div className="flex gap-5 animate-pulse">
                                    <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 border border-white/5">
                                        <Bot size={20} className="text-gray-600" />
                                    </div>
                                    <div className="bg-white/5 p-4 rounded-3xl rounded-tl-none border border-white/5 w-32 h-12 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="p-8">
                        {activeTab === 'skills' && <SkillHub />}
                        {activeTab === 'settings' && <Settings />}
                    </div>
                </div>

                {activeTab === 'chat' && (
                    <footer className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent shrink-0 z-10">
                        <div className="max-w-4xl mx-auto relative group">
                            <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-1000 -z-10" />
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSend()
                                    }
                                }}
                                placeholder="输入你的指令，或者问任何问题..."
                                className="w-full bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-4 pr-14 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all resize-none h-24 shadow-2xl text-gray-200 placeholder:text-gray-600"
                            />
                            <button
                                onClick={handleSend}
                                disabled={isSending || !input.trim()}
                                className="absolute right-3 bottom-3 p-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-indigo-600/50"
                            >
                                <Send size={18} fill="currentColor" className="opacity-90" />
                            </button>
                        </div>
                    </footer>
                )}
            </main>
        </div>
    )
}

export default App
