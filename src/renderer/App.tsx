import React, { useState } from 'react'
import { Bot, Settings, ToyBrick as Brick, MessageSquare, Send } from 'lucide-react'
import SkillHub from './pages/SkillHub'

function App() {
    const [activeTab, setActiveTab] = useState<'chat' | 'skills'>('chat')

    return (
        <div className="flex h-screen bg-[#1e1e1e] text-gray-200 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-16 flex flex-col items-center py-6 bg-[#252526] border-r border-[#333] shrink-0">
                <div className="mb-8 p-2 rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/20">
                    <Bot size={24} className="text-white" />
                </div>

                <nav className="flex-1 flex flex-col gap-6">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`p-2 rounded-lg transition-colors ${activeTab === 'chat' ? 'bg-[#37373d] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <MessageSquare size={22} />
                    </button>
                    <button
                        onClick={() => setActiveTab('skills')}
                        className={`p-2 rounded-lg transition-colors ${activeTab === 'skills' ? 'bg-[#37373d] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Brick size={22} />
                    </button>
                </nav>

                <button className="p-2 text-gray-500 hover:text-gray-300 transition-colors">
                    <Settings size={22} />
                </button>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                <header className="h-12 border-b border-[#333] flex items-center px-6 draggable shrink-0">
                    <h1 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                        Assistant Core / <span className="text-gray-300">{activeTab === 'chat' ? 'Agent Chat' : 'Skill Hub'}</span>
                    </h1>
                </header>

                <div className="flex-1 p-8 overflow-auto">
                    {activeTab === 'chat' ? (
                        <div className="max-w-3xl mx-auto space-y-6">
                            <div className="flex gap-4">
                                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/10">
                                    <Bot size={18} />
                                </div>
                                <div className="bg-[#2d2d2d] p-4 rounded-2xl rounded-tl-none border border-[#3c3c3c] shadow-sm">
                                    <p className="text-sm leading-relaxed text-gray-300">
                                        你好！我是基于 ReAct 模式驱动的本地智能代理。
                                    </p>
                                    <p className="text-xs mt-2 text-indigo-400 font-medium">
                                        你可以通过技能中心配置我的能力。
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <SkillHub />
                    )}
                </div>

                {activeTab === 'chat' && (
                    <footer className="p-6 bg-gradient-to-t from-[#1e1e1e] to-transparent">
                        <div className="max-w-3xl mx-auto relative group">
                            <textarea
                                placeholder="尝试提问：'帮我分析一下桌面的 Excel 文件'..."
                                className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-2xl p-4 pr-12 text-sm focus:outline-none focus:border-indigo-500 transition-all resize-none h-24 shadow-sm"
                            />
                            <button className="absolute right-3 bottom-3 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20">
                                <Send size={18} />
                            </button>
                        </div>
                    </footer>
                )}
            </main>
        </div>
    )
}

export default App
