import React, { useEffect } from 'react'
import Settings from './pages/Settings'
import SkillSettings from './pages/settings/SkillSettings'
import { Sidebar } from './layouts/sidebar/Sidebar'
import { ChatLayout } from './layouts/ChatLayout'
import { useChatStore } from './store/useChatStore'
import { useSettingsStore } from './store/useSettingsStore'
import { useLayoutStore } from './store/useLayoutStore'
import { useBreakpoint } from './hooks/useBreakpoint'

function App() {
    const { activeTab } = useChatStore()
    const { loadSettings } = useSettingsStore()
    const { loadHistory } = useChatStore()
    const { sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useLayoutStore()
    const { isMobile } = useBreakpoint()
    useEffect(() => {
        loadSettings()
        loadHistory()
    }, [loadSettings, loadHistory])

    // Auto collapse on mobile
    useEffect(() => {
        if (isMobile) {
            setSidebarCollapsed(true)
        }
    }, [isMobile, setSidebarCollapsed])

    // Hotkey for sidebar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault()
                toggleSidebar()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [toggleSidebar])

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
                <main className="flex-1 overflow-auto bg-transparent">
                    {activeTab === 'skills' && <SkillSettings />}
                    {activeTab === 'settings' && <Settings />}
                </main>
            )}
        </div>
    )
}

export default App
