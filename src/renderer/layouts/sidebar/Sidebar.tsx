import React from 'react'
import { Bot, Settings, ToyBrick, MessageSquare, Sun, Moon } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { clsx } from 'clsx'

export function Sidebar() {
    const { activeTab, setActiveTab } = useChatStore()

    const navItems = [
        { id: 'chat', icon: MessageSquare, label: 'Chat' },
    ] as const

    return (
        <aside className="w-18 flex flex-col items-center py-6 bg-slate-50 border-r border-slate-200 dark:bg-[#18181b] dark:border-white/5 shrink-0 z-20 h-full transition-colors duration-300">
            {/* Brand Icon */}
            <div className="mb-8 p-3 rounded-2xl bg-indigo-600 shadow-sm shadow-indigo-500/30">
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
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/5"
            )}
        >
            <Icon size={22} strokeWidth={isActive ? 2 : 1.5} />
        </button>
    )
}
