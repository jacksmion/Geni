import React from 'react'
import { Bot, Settings, ToyBrick, MessageSquare } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { clsx } from 'clsx'

export function Sidebar() {
    const { activeTab, setActiveTab } = useChatStore()

    const navItems = [
        { id: 'chat', icon: MessageSquare, label: 'Chat' },
        { id: 'skills', icon: ToyBrick, label: 'Skills' },
    ] as const

    return (
        <aside className="w-18 flex flex-col items-center py-6 bg-black/20 backdrop-blur-xl border-r border-white/5 shrink-0 z-20 h-full">
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

            {/* Settings at Bottom */}
            <div className="px-3 w-full">
                <NavButton
                    isActive={activeTab === 'settings'}
                    onClick={() => setActiveTab('settings')}
                    icon={Settings}
                />
            </div>
        </aside>
    )
}

function NavButton({ isActive, onClick, icon: Icon }: { isActive: boolean, onClick: () => void, icon: any }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "p-3 w-full flex justify-center rounded-xl transition-all duration-300 group relative",
                isActive
                    ? "bg-white/10 text-white shadow-inner"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
            )}
        >
            <Icon size={22} strokeWidth={1.5} />
            {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3 bg-indigo-500 rounded-r-full" />
            )}
        </button>
    )
}
