import React, { useState } from 'react'
import { Bot, Settings, ToyBrick as Brick, MessageSquare } from 'lucide-react'

function App() {
    const [activeTab, setActiveTab] = useState<'chat' | 'skills'>('chat')

    return (
        <div className="flex h-screen bg-[#1e1e1e] text-gray-200 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-16 flex flex-col items-center py-6 bg-[#252526] border-r border-[#333]">
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
                <header className="h-12 border-b border-[#333] flex items-center px-6 draggable">
                    <h1 className="text-sm font-medium tracking-wide text-gray-400">
                        {activeTab === 'chat' ? '智能代理对话' : '技能管理中心'}
                    </h1>
                </header>

                <div className="flex-1 p-6 overflow-auto">
                    {activeTab === 'chat' ? (
                        <div className="max-w-3xl mx-auto space-y-6">
                            <div className="flex gap-4">
                                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                                    <Bot size={18} />
                                </div>
                                <div className="bg-[#2d2d2d] p-4 rounded-2xl rounded-tl-none border border-[#3c3c3c] shadow-sm">
                                    <p className="text-sm leading-relaxed">
                                        你好！我是你的个人智能代理。我已经准备好通过技能扩展来协助你处理本地任务了。
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="bg-[#2d2d2d] p-5 rounded-2xl border border-[#3c3c3c] hover:border-indigo-500/50 transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                        <Brick size={20} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] uppercase font-bold text-gray-500">Auto</span>
                                        <div className="w-8 h-4 bg-indigo-600 rounded-full relative">
                                            <div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                                <h3 className="font-semibold text-white mb-2">Python Executor</h3>
                                <p className="text-xs text-gray-400 leading-relaxed mb-4">
                                    兼容 Claude Skills 标准，允许助手编写并运行 Python 脚本处理本地数据。
                                </p>
                                <div className="flex gap-2">
                                    <span className="px-2 py-1 bg-[#3c3c3c] rounded text-[10px] text-gray-400">Core</span>
                                    <span className="px-2 py-1 bg-[#3c3c3c] rounded text-[10px] text-gray-400">v1.0.0</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {activeTab === 'chat' && (
                    <footer className="p-6 bg-gradient-to-t from-[#1e1e1e] to-transparent">
                        <div className="max-w-3xl mx-auto relative">
                            <textarea
                                placeholder="在此输入您的指令..."
                                className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-2xl p-4 pr-12 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none h-24"
                            />
                            <button className="absolute right-3 bottom-3 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors">
                                <MessageSquare size={18} />
                            </button>
                        </div>
                    </footer>
                )}
            </main>
        </div>
    )
}

export default App
