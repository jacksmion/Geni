// src/renderer/components/CommandPalette/useSearchIndex.ts
import { useMemo } from 'react'
import Fuse from 'fuse.js'
import { SearchItem } from './types'
import { getPageItems, getCommandItems, getSessionItems } from './searchItems'
import { useChatStore } from '../../store/useChatStore'

export function useSearchIndex() {
    // 订阅 sessionMetas 变化以触发重建索引
    const sessionMetas = useChatStore(s => s.sessionMetas)

    const allItems = useMemo(() => {
        return [
            ...getPageItems(),
            ...getCommandItems(),
            ...getSessionItems(),
        ]
    }, [sessionMetas]) // sessionMetas 变化时重建

    const fuse = useMemo(() => {
        return new Fuse(allItems, {
            keys: [
                { name: 'label', weight: 0.7 },
                { name: 'keywords', weight: 0.2 },
                { name: 'description', weight: 0.1 },
            ],
            threshold: 0.4,
            includeScore: true,
        })
    }, [allItems])

    return { fuse, allItems }
}
