// src/renderer/components/CommandPalette/SearchInput.tsx
import React from 'react'
import { Search } from 'lucide-react'

interface SearchInputProps {
    query: string
    onQueryChange: (query: string) => void
    onKeyDown: (e: React.KeyboardEvent) => void
    inputRef: React.RefObject<HTMLInputElement | null>
    filterType: string | null
}

export function SearchInput({ query, onQueryChange, onKeyDown, inputRef, filterType }: SearchInputProps) {
    const placeholder = filterType === 'session'
        ? '搜索任务...'
        : filterType === 'command'
            ? '搜索命令...'
            : '搜索页面、任务、命令...'

    return (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/10">
            <Search size={16} className="text-slate-400 dark:text-zinc-500 shrink-0" />
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none border-none"
                style={{ boxShadow: 'none' }}
                spellCheck={false}
            />
            {!query && !filterType && (
                <span className="text-[11px] text-slate-400 dark:text-zinc-600 shrink-0">
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-[10px]">&gt;</kbd> 命令{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-[10px]">@</kbd> 任务
                </span>
            )}
        </div>
    )
}
