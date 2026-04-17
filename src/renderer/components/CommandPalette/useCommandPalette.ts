// src/renderer/components/CommandPalette/useCommandPalette.ts
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useSearchIndex } from './useSearchIndex'
import { SearchItem, SearchItemType } from './types'
import { useLayoutStore } from '../../store/useLayoutStore'

const DEFAULT_SESSION_VISIBLE_COUNT = 6
const SESSION_LOAD_MORE_COUNT = 10
const SEARCH_RESULT_LIMIT = 10

export function useCommandPalette() {
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [sessionVisibleCount, setSessionVisibleCount] = useState(DEFAULT_SESSION_VISIBLE_COUNT)
    const inputRef = useRef<HTMLInputElement>(null)
    const paletteOpen = useLayoutStore(s => s.paletteOpen)
    const setPaletteOpen = useLayoutStore(s => s.setPaletteOpen)

    const { fuse, allItems } = useSearchIndex()
    const sessionItems = useMemo(() => allItems.filter(i => i.type === 'session'), [allItems])

    // 解析前缀，提取过滤类型和实际搜索词
    const { filterType, searchTerm } = useMemo(() => {
        const trimmed = query.trimStart()
        if (trimmed.startsWith('>')) {
            return { filterType: 'command' as SearchItemType, searchTerm: trimmed.slice(1).trim() }
        }
        if (trimmed.startsWith('@')) {
            return { filterType: 'session' as SearchItemType, searchTerm: trimmed.slice(1).trim() }
        }
        return { filterType: null, searchTerm: trimmed }
    }, [query])

    const hasMoreSessions = useMemo(() => {
        if (searchTerm) return false
        if (filterType && filterType !== 'session') return false
        return sessionItems.length > sessionVisibleCount
    }, [filterType, searchTerm, sessionItems.length, sessionVisibleCount])

    const hiddenSessionCount = useMemo(() => {
        if (!hasMoreSessions) return 0
        return Math.max(0, sessionItems.length - sessionVisibleCount)
    }, [hasMoreSessions, sessionItems.length, sessionVisibleCount])

    const showMoreItem = useMemo<SearchItem | null>(() => {
        if (!hasMoreSessions) return null
        const isSessionMode = filterType === 'session'
        return {
            id: 'session-show-more',
            type: 'session',
            label: isSessionMode ? '查看更多' : '查看更多最近任务',
            description: hiddenSessionCount > 0 ? `还有 ${hiddenSessionCount} 条任务` : undefined,
            icon: 'Plus',
            keywords: ['more', '更多', '展开', 'show more', 'recent sessions'],
            closeOnSelect: false,
            action: () => {
                setSessionVisibleCount(count => count + SESSION_LOAD_MORE_COUNT)
            },
        }
    }, [filterType, hasMoreSessions, hiddenSessionCount])

    // 执行搜索
    const results = useMemo(() => {
        let items: SearchItem[]

        if (!searchTerm) {
            if (filterType) {
                items = allItems.filter(i => i.type === filterType)
                if (filterType === 'session') {
                    const visibleItems = items.slice(0, sessionVisibleCount)
                    return showMoreItem ? [...visibleItems, showMoreItem] : visibleItems
                }
            } else {
                // 无搜索词：先展示最近任务，再展示命令和页面
                const sessions = sessionItems.slice(0, sessionVisibleCount)
                const commands = allItems.filter(i => i.type === 'command')
                const pages = allItems.filter(i => i.type === 'page')
                return [...sessions, ...(showMoreItem ? [showMoreItem] : []), ...commands, ...pages]
            }
        } else if (filterType) {
            // 有前缀过滤：先搜索再过滤类型
            items = fuse.search(searchTerm).map(r => r.item).filter(i => i.type === filterType)
        } else {
            // 无前缀：直接搜索
            items = fuse.search(searchTerm).map(r => r.item)
        }

        return items.slice(0, SEARCH_RESULT_LIMIT)
    }, [searchTerm, filterType, fuse, allItems, sessionItems, sessionVisibleCount, showMoreItem])

    // 搜索结果变化时重置选中索引
    useEffect(() => {
        setSelectedIndex(0)
    }, [results.length])

    // 打开时自动聚焦
    useEffect(() => {
        if (paletteOpen) {
            setQuery('')
            setSelectedIndex(0)
            setSessionVisibleCount(DEFAULT_SESSION_VISIBLE_COUNT)
            // 延迟聚焦，等待 DOM 渲染
            requestAnimationFrame(() => inputRef.current?.focus())
        }
    }, [paletteOpen])

    const close = useCallback(() => {
        setPaletteOpen(false)
        setQuery('')
    }, [setPaletteOpen])

    const executeSelected = useCallback(() => {
        const item = results[selectedIndex]
        if (item) {
            if (item.closeOnSelect !== false) {
                close()
            }
            item.action()
        }
    }, [results, selectedIndex, close])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault()
                setSelectedIndex(i => (i > 0 ? i - 1 : results.length - 1))
                break
            case 'ArrowDown':
                e.preventDefault()
                setSelectedIndex(i => (i < results.length - 1 ? i + 1 : 0))
                break
            case 'Enter':
                e.preventDefault()
                executeSelected()
                break
            case 'Escape':
                e.preventDefault()
                close()
                break
            case 'Backspace':
                if (query === '') {
                    close()
                }
                break
        }
    }, [results.length, executeSelected, close, query])

    return {
        query,
        setQuery,
        results,
        selectedIndex,
        setSelectedIndex,
        handleKeyDown,
        inputRef,
        filterType,
    }
}
