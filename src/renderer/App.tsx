import React, { useEffect } from 'react'
import Settings from './pages/Settings'
import SkillSettings from './pages/settings/SkillSettings'
import SchedulerPage from './pages/SchedulerPage'
import StaffPage from './pages/StaffPage'
import { Sidebar } from './layouts/sidebar/Sidebar'
import { ChatLayout } from './layouts/ChatLayout'
import { PageTransition } from './components/PageTransition'

import { useChatStore } from './store/useChatStore'
import { useSettingsStore } from './store/useSettingsStore'
import { useLayoutStore } from './store/useLayoutStore'

import { useBreakpoint } from './hooks/useBreakpoint'
import { useShortcuts } from './hooks/useShortcuts'
import { ConfirmDialog } from './components/modals/ConfirmDialog'
import { CommandPalette } from './components/CommandPalette'

function App() {
    const activeTab = useChatStore(s => s.activeTab)
    const loadSettings = useSettingsStore(s => s.loadSettings)
    const loadHistory = useChatStore(s => s.loadHistory)

    const toggleSidebar = useLayoutStore(s => s.toggleSidebar)
    const setSidebarCollapsed = useLayoutStore(s => s.setSidebarCollapsed)

    const { isMobile } = useBreakpoint()

    // Register global shortcuts
    useShortcuts()

    useEffect(() => {
        loadSettings()
        loadHistory()
    }, [loadSettings, loadHistory])

    useEffect(() => {
        if (!window.electronAPI?.tray) return;

        const cleanupSettings = window.electronAPI.tray.onNavigateToSettings(() => {
            useChatStore.getState().setActiveTab('settings')
        });

        const cleanupNewTask = window.electronAPI.tray.onNewTask(() => {
            // Force chat tab and start a new session
            useChatStore.getState().setActiveTab('chat')
            useChatStore.getState().createSession()
        });

        return () => {
            cleanupSettings();
            cleanupNewTask();
        };
    }, []);

    // Auto collapse on mobile
    useEffect(() => {
        if (isMobile) {
            setSidebarCollapsed(true)
        }
    }, [isMobile, setSidebarCollapsed])

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
        <div className="flex h-screen w-full bg-transparent text-slate-900 dark:text-gray-100 font-sans overflow-hidden selection:bg-indigo-500/30">
            {activeTab !== 'chat' && <Sidebar />}

            <PageTransition pageKey={activeTab}>
                {activeTab === 'chat' ? (
                    <ChatLayout />
                ) : (
                    <main className="flex-1 h-full overflow-hidden bg-transparent">
                        {activeTab === 'skills' && <SkillSettings />}
                        {activeTab === 'staff' && <StaffPage />}
                        {activeTab === 'scheduler' && <SchedulerPage />}
                        {activeTab === 'settings' && <Settings />}
                    </main>
                )}
            </PageTransition>

            <ConfirmDialog />
            <CommandPalette />
        </div>
    )
}

export default App

