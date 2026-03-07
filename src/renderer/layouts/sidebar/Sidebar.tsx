import { Settings, MessageSquare, Zap, Clock, Sun, Moon } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { clsx } from 'clsx'
import { GeniLogo } from '../../components/GeniLogo'

export function Sidebar() {
    const activeTab = useChatStore(s => s.activeTab)
    const setActiveTab = useChatStore(s => s.setActiveTab)

    const navItems = [
        { id: 'chat', icon: MessageSquare, label: 'Chat' },
        { id: 'skills', icon: Zap, label: 'Skills' },
        { id: 'scheduler', icon: Clock, label: 'Scheduler' },
    ] as const

    return (
        <aside className="w-[50px] flex flex-col items-center py-4 bg-[#f9fafb] dark:bg-[#18181b] shrink-0 z-20 h-full transition-all duration-300">
            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-2 w-full px-2">
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
            <div className="px-2 w-full flex flex-col gap-2 pb-4">
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
    const theme = useSettingsStore(s => s.settings.theme)
    const setTheme = useSettingsStore(s => s.setTheme)
    const isDark = theme === 'dark'

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="w-full aspect-square flex items-center justify-center rounded-lg transition-all duration-200 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-white/5"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
            {isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
        </button>
    )
}



function NavButton({ isActive, onClick, icon: Icon }: { isActive: boolean, onClick: () => void, icon: any }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "w-full aspect-square flex items-center justify-center rounded-lg transition-all duration-200 group relative",
                isActive
                    ? "bg-slate-200/80 text-slate-800 dark:bg-white/10 dark:text-zinc-200"
                    : "text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/5"
            )}
        >
            <Icon size={20} strokeWidth={1.5} className="transition-transform duration-200 group-hover:scale-105" />
        </button>
    )
}
