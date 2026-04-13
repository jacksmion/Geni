import { Settings, MessageSquare, Zap, Clock, Sun, Moon, Users } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

export function Sidebar() {
    const activeTab = useChatStore(s => s.activeTab)
    const setActiveTab = useChatStore(s => s.setActiveTab)
    const { t } = useTranslation()

    const navItems = [
        { id: 'chat', icon: MessageSquare, label: t('sidebar.chat') },
        { id: 'skills', icon: Zap, label: t('sidebar.skills') },
        { id: 'staff', icon: Users, label: t('sidebar.staff') },
        { id: 'scheduler', icon: Clock, label: t('sidebar.scheduler') },
    ] as const

    return (
        <aside className="w-[50px] flex flex-col items-center py-4 bg-[#f9fafb] dark:bg-[var(--sidebar-bg)] shrink-0 z-[100] h-full transition-all duration-300">
            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-1.5 w-full px-2">
                {navItems.map((item) => (
                    <NavButton
                        key={item.id}
                        isActive={activeTab === item.id}
                        onClick={() => setActiveTab(item.id)}
                        icon={item.icon}
                        label={item.label}
                    />
                ))}
            </nav>

            {/* Bottom Actions */}
            <div className="px-2 w-full flex flex-col gap-1.5 pb-4">
                <ThemeToggle />

                <NavButton
                    isActive={activeTab === 'settings'}
                    onClick={() => setActiveTab('settings')}
                    icon={Settings}
                    label={t('sidebar.settings')}
                />
            </div>
        </aside>
    )
}

function ThemeToggle() {
    const theme = useSettingsStore(s => s.settings.theme)
    const setTheme = useSettingsStore(s => s.setTheme)
    const { t } = useTranslation()
    const isDark = theme === 'dark'

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="w-full aspect-square flex items-center justify-center rounded-lg transition-all duration-200 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-white/5 group relative"
        >
            {isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
            
            {/* Tooltip */}
            <div className="absolute left-[calc(100%+8px)] px-2 py-1.5 bg-slate-800 dark:bg-zinc-800 text-white text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 translate-x-[-4px] group-hover:translate-x-0 transition-all duration-200 pointer-events-none whitespace-nowrap z-[60] shadow-xl border border-white/5">
                {isDark ? t('sidebar.lightMode') : t('sidebar.darkMode')}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-[4px] border-transparent border-r-slate-800 dark:border-r-zinc-800" />
            </div>
        </button>
    )
}

function NavButton({ isActive, onClick, icon: Icon, label }: { isActive: boolean, onClick: () => void, icon: any, label: string }) {
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
            
            {/* Tooltip */}
            <div className="absolute left-[calc(100%+8px)] px-2 py-1.5 bg-slate-800 dark:bg-zinc-800 text-white text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 translate-x-[-4px] group-hover:translate-x-0 transition-all duration-200 pointer-events-none whitespace-nowrap z-[60] shadow-xl border border-white/5">
                {label}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-[4px] border-transparent border-r-slate-800 dark:border-r-zinc-800" />
            </div>
        </button>
    )
}
