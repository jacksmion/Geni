import React from 'react'
import SkillHub from './pages/SkillHub'
import Settings from './pages/Settings'
import { Sidebar } from './layouts/sidebar/Sidebar'
import { ChatLayout } from './layouts/ChatLayout'
import { useChatStore } from './store/useChatStore'

function App() {
    const { activeTab } = useChatStore()

    // Check for Electron Env
    if (!window.electronAPI) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#1e1e1e] text-white p-8">
                <div className="max-w-md text-center space-y-4">
                    <div className="text-4xl">⚠️</div>
                    <h1 className="text-xl font-bold">Electron 环境未检测到</h1>
                    <p className="text-gray-400 text-sm">
                        Window.electronAPI is undefined.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-transparent text-gray-100 font-sans overflow-hidden selection:bg-indigo-500/30">
            <Sidebar />

            {activeTab === 'chat' ? (
                <ChatLayout />
            ) : (
                <main className="flex-1 overflow-auto bg-[#1e1e1e]/50">
                    {activeTab === 'skills' && <SkillHub />}
                    {activeTab === 'settings' && <Settings />}
                </main>
            )}
        </div>
    )
}

export default App
