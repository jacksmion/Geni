// src/renderer/components/CommandPalette/index.tsx
import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLayoutStore } from '../../store/useLayoutStore'
import { useCommandPalette } from './useCommandPalette'
import { SearchInput } from './SearchInput'
import { ResultList } from './ResultList'

export function CommandPalette() {
    const paletteOpen = useLayoutStore(s => s.paletteOpen)
    const setPaletteOpen = useLayoutStore(s => s.setPaletteOpen)

    const {
        query,
        setQuery,
        results,
        selectedIndex,
        setSelectedIndex,
        handleKeyDown,
        inputRef,
        filterType,
    } = useCommandPalette()

    // Esc 键关闭（全局监听，兜底）
    useEffect(() => {
        if (!paletteOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                setPaletteOpen(false)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [paletteOpen, setPaletteOpen])

    if (!paletteOpen) return null

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center"
            style={{ paddingTop: '20vh' }}
        >
            {/* 遮罩 */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setPaletteOpen(false)}
            />

            {/* 搜索框容器 */}
            <div
                className="relative w-full max-w-lg bg-white dark:bg-[#1c1c1e] rounded-xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                <SearchInput
                    query={query}
                    onQueryChange={setQuery}
                    onKeyDown={handleKeyDown}
                    inputRef={inputRef}
                    filterType={filterType}
                />
                <ResultList
                    results={results}
                    selectedIndex={selectedIndex}
                    setSelectedIndex={setSelectedIndex}
                    onSelect={(item) => {
                        setPaletteOpen(false)
                        item.action()
                    }}
                />
            </div>
        </div>,
        document.body
    )
}
