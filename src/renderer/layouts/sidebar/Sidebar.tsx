import { Settings, MessageSquare, Zap, Clock, Sun, Moon, Users, Search } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useLayoutStore } from '../../store/useLayoutStore'
import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

export function Sidebar() {
    const activeTab = useChatStore(s => s.activeTab)
    const setActiveTab = useChatStore(s => s.setActiveTab)
    const setPaletteOpen = useLayoutStore(s => s.setPaletteOpen)
    const { t } = useTranslation()
    const isChatActive = activeTab === 'chat'

    const navItems = [
        { id: 'skills', icon: Zap, label: t('sidebar.skills') },
        { id: 'staff', icon: Users, label: t('sidebar.staff') },
        { id: 'scheduler', icon: Clock, label: t('sidebar.scheduler') },
    ] as const

    return (
        <aside
            className={clsx(
                "w-[56px] flex flex-col items-center py-4 shrink-0 z-[100] h-full transition-all duration-300 glass-sidebar glass-noise glass-edge-refraction border-r relative overflow-hidden",
                isChatActive
                    ? "before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_58%)] dark:before:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_58%)] before:pointer-events-none before:content-['']"
                    : "opacity-[0.98]"
            )}
        >
            <div className="ui-text-caption mb-3 flex h-8 w-8 items-center justify-center rounded-xl border border-white/50 bg-white/38 font-semibold tracking-[0.18em] text-slate-500 shadow-[0_10px_22px_rgba(90,105,120,0.12)] dark:border-white/8 dark:bg-white/[0.04] dark:text-zinc-400 dark:shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
                G
            </div>
            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-1.5 w-full px-2">
                <NavButton
                    isActive={activeTab === 'chat'}
                    onClick={() => setActiveTab('chat')}
                    icon={MessageSquare}
                    label={t('sidebar.chat')}
                />
                
                {/* Search Button right below Chat/Tasks */}
                <NavButton
                    isActive={false}
                    onClick={() => setPaletteOpen(true)}
                    icon={Search}
                    label={t('sidebar.search', { defaultValue: '全局搜索' })}
                />

                <div className="w-7 h-px bg-gradient-to-r from-transparent via-slate-400/50 to-transparent dark:via-white/[0.1] mx-auto my-1.5" />

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
    const resolvedTheme = useSettingsStore(s => s.resolvedTheme)
    const setTheme = useSettingsStore(s => s.setTheme)
    const { t } = useTranslation()
    const isDark = resolvedTheme === 'dark'

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="w-full aspect-square flex items-center justify-center rounded-lg transition-all duration-200 text-slate-500 hover:bg-[rgba(99,102,241,0.10)] hover:text-indigo-600 hover:border-[rgba(99,102,241,0.18)] border border-transparent dark:text-zinc-500 dark:hover:text-indigo-300 dark:hover:bg-[rgba(129,140,248,0.14)] dark:hover:border-[rgba(129,140,248,0.22)] group relative"
        >
            {isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
            
            {/* Tooltip */}
            <div className="ui-text-meta absolute left-[calc(100%+8px)] rounded-md border border-white/5 bg-slate-800 px-2 py-1.5 font-medium text-white opacity-0 translate-x-[-4px] transition-all duration-200 pointer-events-none whitespace-nowrap z-[60] shadow-xl group-hover:opacity-100 group-hover:translate-x-0 dark:bg-zinc-800">
                {theme === 'system'
                    ? t('generalSettings.themeSystem')
                    : (isDark ? t('sidebar.lightMode') : t('sidebar.darkMode'))}
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
                    ? "border border-white/55 bg-white/50 text-slate-800 shadow-[0_10px_22px_rgba(90,105,120,0.13)] dark:border-white/8 dark:bg-white/[0.07] dark:text-zinc-200 dark:shadow-[0_12px_28px_rgba(0,0,0,0.22)] glass-active-item"
                    : "border border-transparent text-slate-500 hover:border-[rgba(99,102,241,0.18)] hover:bg-[rgba(99,102,241,0.10)] hover:text-indigo-600 dark:text-zinc-500 dark:hover:border-[rgba(129,140,248,0.22)] dark:hover:text-indigo-300 dark:hover:bg-[rgba(129,140,248,0.14)]"
            )}
        >
            <Icon size={20} strokeWidth={1.5} className="transition-transform duration-200 group-hover:scale-105" />
            
            {/* Tooltip */}
            <div className="ui-text-meta absolute left-[calc(100%+8px)] rounded-md border border-white/5 bg-slate-800 px-2 py-1.5 font-medium text-white opacity-0 translate-x-[-4px] transition-all duration-200 pointer-events-none whitespace-nowrap z-[60] shadow-xl group-hover:opacity-100 group-hover:translate-x-0 dark:bg-zinc-800">
                {label}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-[4px] border-transparent border-r-slate-800 dark:border-r-zinc-800" />
            </div>
        </button>
    )
}
