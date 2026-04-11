// src/renderer/components/CommandPalette/ResultList.tsx
import React from 'react'
import { SearchItem } from './types'
import { ResultItem } from './ResultItem'

const typeOrder: SearchItem['type'][] = ['session', 'command', 'page']
const typeLabels: Record<SearchItem['type'], string> = {
    session: '最近会话',
    command: '命令',
    page: '页面',
}

interface ResultListProps {
    results: SearchItem[]
    selectedIndex: number
    setSelectedIndex: (index: number) => void
    onSelect: (item: SearchItem) => void
}

export function ResultList({ results, selectedIndex, setSelectedIndex, onSelect }: ResultListProps) {
    if (results.length === 0) {
        return (
            <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-zinc-500">
                没有匹配的结果
            </div>
        )
    }

    // 按类型分组，保持 typeOrder 顺序
    const grouped = typeOrder
        .map(type => ({
            type,
            label: typeLabels[type],
            items: results.filter(r => r.type === type),
        }))
        .filter(g => g.items.length > 0)

    // 构建全局索引映射（扁平化后的索引）
    let flatIndex = 0

    return (
        <div className="max-h-80 overflow-y-auto py-2">
            {grouped.map((group, gi) => {
                // 记录当前分组的起始索引
                const startIdx = flatIndex
                return (
                    <div key={group.type}>
                        {gi > 0 && (
                            <div className="mx-4 my-1 border-t border-slate-100 dark:border-white/5" />
                        )}
                        <div className="px-4 py-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-600">
                                {group.label}
                            </span>
                        </div>
                        {group.items.map((item) => {
                            const idx = flatIndex++
                            return (
                                <ResultItem
                                    key={item.id}
                                    item={item}
                                    isSelected={idx === selectedIndex}
                                    onClick={() => onSelect(item)}
                                    onHover={() => setSelectedIndex(idx)}
                                />
                            )
                        })}
                    </div>
                )
            })}
        </div>
    )
}
