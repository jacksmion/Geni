// src/renderer/components/CommandPalette/types.ts

export type SearchItemType = 'page' | 'session' | 'command'

export interface SearchItem {
    id: string
    type: SearchItemType
    label: string
    description?: string
    icon?: string        // lucide icon component name (for display)
    keywords?: string[]  // 额外搜索关键词
    action: () => void
}
