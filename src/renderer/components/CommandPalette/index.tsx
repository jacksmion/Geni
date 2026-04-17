// src/renderer/components/CommandPalette/index.tsx
import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLayoutStore } from '../../store/useLayoutStore'
import { useCommandPalette } from './useCommandPalette'
import { SearchInput } from './SearchInput'
import { ResultList } from './ResultList'

export function CommandPalette() {
    const paletteOpen = useLayoutStore(s => s.paletteOpen)
    const setPaletteOpen = useLayoutStore(s => s.setPaletteOpen)
    const previousFocusRef = useRef<HTMLElement | null>(null)

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

    // 打开时记录焦点，关闭时还原
    useEffect(() => {
        if (paletteOpen) {
            previousFocusRef.current = document.activeElement as HTMLElement
        } else {
            previousFocusRef.current?.focus()
        }
    }, [paletteOpen])

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
            {/* 遮罩 - 减轻模糊，露出背后内容 */}
            <div
                className="absolute inset-0 bg-slate-900/15 dark:bg-black/30 transition-opacity"
                onClick={() => setPaletteOpen(false)}
            />

            {/* 搜索框容器 */}
            <div
                role="dialog"
                aria-label="命令面板"
                aria-modal="true"
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
                        if (item.closeOnSelect !== false) {
                            setPaletteOpen(false)
                        }
                        item.action()
                    }}
                />
            </div>
        </div>,
        document.body
    )
}
