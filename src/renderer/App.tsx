import React, { useEffect } from 'react'
import Settings from './pages/Settings'
import SkillSettings from './pages/settings/SkillSettings'
import SchedulerPage from './pages/SchedulerPage'
import StaffPage from './pages/StaffPage'
import { ChatLayout } from './layouts/ChatLayout'
import { SessionSidebar } from './layouts/sidebar/SessionSidebar'

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
            {activeTab === 'chat' ? (
                <ChatLayout />
            ) : (
                <div className="flex h-full w-full overflow-hidden bg-[var(--workspace-gap-bg)]">
                    <SessionSidebar />
                    <div className="relative z-[1] flex-1 min-w-0 overflow-hidden pt-0 pr-0 pb-0 pl-0" style={{ background: 'linear-gradient(180deg, var(--glass-sidebar-highlight), rgba(255,255,255,0) 22%), linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)), var(--glass-sidebar-bg-strong)', backdropFilter: 'blur(24px) saturate(118%)', WebkitBackdropFilter: 'blur(24px) saturate(118%)' }}>
                        <div
                            className="relative flex h-full min-w-0 overflow-hidden rounded-[18px] border bg-[var(--workspace-content-bg)] shadow-[0_8px_24px_-20px_rgba(15,23,42,0.16)] dark:shadow-[0_18px_50px_-38px_rgba(0,0,0,0.58)]"
                            style={{
                                borderColor: 'var(--workspace-content-border)',
                                borderLeftColor: 'transparent',
                            }}
                        >
                            <main className="flex-1 h-full overflow-hidden bg-[var(--workspace-content-bg)]">
                                {activeTab === 'skills' && <SkillSettings />}
                                {activeTab === 'scheduler' && <SchedulerPage />}
                                {activeTab === 'staff' && <StaffPage />}
                                {activeTab === 'settings' && <Settings />}
                            </main>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog />
            <CommandPalette />
        </div>
    )
}

export default App

