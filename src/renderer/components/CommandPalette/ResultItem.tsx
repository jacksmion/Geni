// src/renderer/components/CommandPalette/ResultItem.tsx
import React from 'react'
import { MessageSquare, Zap, Users, Clock, Settings, Plus, Sun, Moon, Terminal, FileText, type LucideIcon } from 'lucide-react'
import { SearchItem } from './types'

const iconMap: Record<string, LucideIcon> = {
    MessageSquare,
    Zap,
    Users,
    Clock,
    Settings,
    Plus,
    Sun,
    Moon,
    Terminal,
    FileText,
}

const typeLabels: Record<string, string> = {
    page: '页面',
    session: '会话',
    command: '命令',
}

interface ResultItemProps {
    item: SearchItem
    isSelected: boolean
    onClick: () => void
    onHover: () => void
}

export function ResultItem({ item, isSelected, onClick, onHover }: ResultItemProps) {
    const Icon = iconMap[item.icon || ''] || MessageSquare

    return (
        <button
            onClick={onClick}
            onMouseEnter={onHover}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-75 cursor-pointer ${
                isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-500/10'
                    : 'hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
        >
            <div className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${
                isSelected
                    ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-zinc-500'
            }`}>
                <Icon size={14} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-slate-900 dark:text-zinc-100 truncate">
                    {item.label}
                </div>
                {item.description && (
                    <div className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">
                        {item.description}
                    </div>
                )}
            </div>
            <span className="text-[10px] text-slate-300 dark:text-zinc-600 shrink-0">
                {typeLabels[item.type]}
            </span>
        </button>
    )
}
