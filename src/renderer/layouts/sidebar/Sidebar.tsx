import React from 'react'
import { Bot, Settings, ToyBrick, MessageSquare, Sun, Moon } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { clsx } from 'clsx'

export function Sidebar() {
    const { activeTab, setActiveTab } = useChatStore()

    const navItems = [
        { id: 'chat', icon: MessageSquare, label: 'Chat' },
        { id: 'skills', icon: ToyBrick, label: 'Skills' },
    ] as const

    return (
        <aside className="w-18 flex flex-col items-center py-6 backdrop-blur-xl border-r shrink-0 z-20 h-full transition-colors duration-300"
            style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}>
            {/* Brand Icon */}
            <div className="mb-8 p-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">
                <Bot size={24} className="text-white" />
            </div>

            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-4 w-full px-3">
                {navItems.map((item) => (
                    <NavButton
                        key={item.id}
                        isActive={activeTab === item.id}
                        onClick={() => setActiveTab(item.id)}
                        icon={item.icon}
                    />
                ))}
            </nav>

            {/* Bottom Actions */}
            <div className="px-3 w-full flex flex-col gap-2">
                <ThemeToggle />

                <NavButton
                    isActive={activeTab === 'settings'}
                    onClick={() => setActiveTab('settings')}
                    icon={Settings}
                />
            </div>
        </aside>
    )
}

function ThemeToggle() {
    const { settings, setTheme } = useSettingsStore()
    const isDark = settings.theme === 'dark'

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-3 w-full flex justify-center rounded-xl transition-all duration-300 text-slate-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/5"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
            {isDark ? <Sun size={22} strokeWidth={1.5} /> : <Moon size={22} strokeWidth={1.5} />}
        </button>
    )
}



function NavButton({ isActive, onClick, icon: Icon }: { isActive: boolean, onClick: () => void, icon: any }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "p-3 w-full flex justify-center rounded-xl transition-all duration-300 group relative",
                isActive
                    ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                    : "text-slate-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/5"
            )}
        >
            <Icon size={22} strokeWidth={1.5} />
            {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3 bg-indigo-500 rounded-r-full" />
            )}
        </button>
    )
}
