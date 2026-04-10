# Command Palette (全局搜索框) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个 Ctrl+K 触发的全局搜索框，支持模糊搜索页面导航、会话内容和命令操作。

**Architecture:** 统一索引模式 — 将页面、会话、命令三种类型注册为 `SearchItem[]`，使用 fuse.js 做模糊搜索，前缀 `>` / `@` 过滤类型。组件通过 Portal 渲染为全局浮层，状态由 Zustand 管理。

**Tech Stack:** React 19, Zustand, fuse.js, Tailwind CSS, lucide-react

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/renderer/components/CommandPalette/index.tsx` | 入口：Portal浮层 + Esc/点击遮罩关闭 |
| Create | `src/renderer/components/CommandPalette/SearchInput.tsx` | 搜索输入框 + 前缀提示 |
| Create | `src/renderer/components/CommandPalette/ResultList.tsx` | 结果列表（按类型分组） |
| Create | `src/renderer/components/CommandPalette/ResultItem.tsx` | 单条结果项 |
| Create | `src/renderer/components/CommandPalette/useSearchIndex.ts` | Hook：从各 store 收集数据构建搜索索引 |
| Create | `src/renderer/components/CommandPalette/useCommandPalette.ts` | Hook：搜索逻辑 + 键盘导航 + 前缀解析 |
| Modify | `src/renderer/store/useLayoutStore.ts` | 新增 `paletteOpen` 状态 |
| Modify | `src/common/types/settings.ts` | 新增 `command_palette` 快捷键 |
| Modify | `src/renderer/hooks/useShortcuts.ts` | 注册 Ctrl+K 快捷键 |
| Modify | `src/renderer/App.tsx` | 挂载 `<CommandPalette />` |

---

### Task 1: 安装 fuse.js 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 fuse.js**

Run:
```bash
cd D:/workspace/Geni && npm install fuse.js
```

- [ ] **Step 2: 验证安装**

Run:
```bash
cd D:/workspace/Geni && node -e "const Fuse = require('fuse.js'); console.log('fuse.js version:', require('fuse.js/package.json').version)"
```
Expected: 输出 fuse.js 版本号

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add fuse.js dependency for command palette search"
```

---

### Task 2: 扩展 LayoutStore 添加 paletteOpen 状态

**Files:**
- Modify: `src/renderer/store/useLayoutStore.ts`

- [ ] **Step 1: 在 useLayoutStore 中添加 paletteOpen 状态和 toggle 方法**

在 `LayoutState` 接口中新增：

```typescript
interface LayoutState {
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    searchFocused: boolean;
    paletteOpen: boolean;          // 新增
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    setSidebarWidth: (width: number) => void;
    setSearchFocused: (focused: boolean) => void;
    setPaletteOpen: (open: boolean) => void;  // 新增
    togglePalette: () => void;                // 新增
}
```

在 store 实现中新增：

```typescript
paletteOpen: false,
setPaletteOpen: (open) => set({ paletteOpen: open }),
togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
```

注意：`paletteOpen` 不需要持久化，不需要添加到 `partialize` 中。

- [ ] **Step 2: 验证编译通过**

Run:
```bash
cd D:/workspace/Geni && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/store/useLayoutStore.ts
git commit -m "feat: add paletteOpen state to LayoutStore"
```

---

### Task 3: 注册 Ctrl+K 快捷键

**Files:**
- Modify: `src/common/types/settings.ts`
- Modify: `src/renderer/hooks/useShortcuts.ts`

- [ ] **Step 1: 在 settings.ts 的 DEFAULT_SETTINGS.shortcuts 中添加 command_palette**

文件 `src/common/types/settings.ts`，在 shortcuts 对象中添加一行：

```typescript
shortcuts: {
    'new_task': 'Ctrl+N',
    'search_task': 'Ctrl+F',
    'open_settings': 'Ctrl+,',
    'toggle_sidebar': 'Ctrl+B',
    'command_palette': 'Ctrl+K'   // 新增
},
```

- [ ] **Step 2: 在 useShortcuts.ts 中添加 command_palette 处理**

文件 `src/renderer/hooks/useShortcuts.ts`，在 `handleKeyDown` 函数中的快捷键匹配区域添加：

```typescript
// 顶部新增 import
import { useLayoutStore } from '../store/useLayoutStore';

// 在 useShortcuts hook 内部：
const togglePalette = useLayoutStore(s => s.togglePalette);

// 在 handleKeyDown 的 if-else 链中，search_task 之后添加：
// 5. Command Palette
else if (currentCombo === shortcuts['command_palette']) {
    e.preventDefault();
    togglePalette();
}
```

同时更新 `useEffect` 的依赖数组，加入 `togglePalette`。

- [ ] **Step 3: 验证编译通过**

Run:
```bash
cd D:/workspace/Geni && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/common/types/settings.ts src/renderer/hooks/useShortcuts.ts
git commit -m "feat: register Ctrl+K shortcut for command palette"
```

---

### Task 4: 创建 SearchItem 类型定义和搜索项注册

**Files:**
- Create: `src/renderer/components/CommandPalette/searchItems.ts`
- Create: `src/renderer/components/CommandPalette/types.ts`

- [ ] **Step 1: 创建 types.ts**

```typescript
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
```

- [ ] **Step 2: 创建 searchItems.ts — 页面和命令的静态注册**

```typescript
// src/renderer/components/CommandPalette/searchItems.ts
import { SearchItem } from './types'
import { useChatStore } from '../../store/useChatStore'
import { useSettingsStore } from '../../store/useSettingsStore'

/**
 * 获取页面导航搜索项（静态）
 */
export function getPageItems(): SearchItem[] {
    const setActiveTab = useChatStore.getState().setActiveTab
    const createSession = useChatStore.getState().createSession

    return [
        {
            id: 'page-chat',
            type: 'page',
            label: '聊天',
            description: '切换到聊天页面',
            icon: 'MessageSquare',
            keywords: ['chat', '对话', '聊天'],
            action: () => setActiveTab('chat'),
        },
        {
            id: 'page-skills',
            type: 'page',
            label: '技能',
            description: '管理 AI 技能',
            icon: 'Zap',
            keywords: ['skill', '技能', '能力'],
            action: () => setActiveTab('skills'),
        },
        {
            id: 'page-staff',
            type: 'page',
            label: '员工',
            description: '管理数字员工',
            icon: 'Users',
            keywords: ['staff', '员工', '数字员工', 'agent'],
            action: () => setActiveTab('staff'),
        },
        {
            id: 'page-scheduler',
            type: 'page',
            label: '定时任务',
            description: '管理定时任务',
            icon: 'Clock',
            keywords: ['scheduler', '定时', '任务', 'cron'],
            action: () => setActiveTab('scheduler'),
        },
        {
            id: 'page-settings',
            type: 'page',
            label: '设置',
            description: '应用设置',
            icon: 'Settings',
            keywords: ['settings', '设置', '配置', '偏好'],
            action: () => setActiveTab('settings'),
        },
    ]
}

/**
 * 获取命令搜索项（静态）
 */
export function getCommandItems(): SearchItem[] {
    const setActiveTab = useChatStore.getState().setActiveTab
    const createSession = useChatStore.getState().createSession
    const setTheme = useSettingsStore.getState().setTheme
    const theme = useSettingsStore.getState().settings.theme

    return [
        {
            id: 'cmd-new-chat',
            type: 'command',
            label: '新建会话',
            description: '创建一个新的聊天会话',
            icon: 'Plus',
            keywords: ['new', '新建', '创建', 'create', 'chat'],
            action: () => {
                createSession()
                setActiveTab('chat')
            },
        },
        {
            id: 'cmd-toggle-theme',
            type: 'command',
            label: theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式',
            description: '切换应用主题',
            icon: theme === 'dark' ? 'Sun' : 'Moon',
            keywords: ['theme', '主题', 'dark', 'light', '暗色', '亮色'],
            action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        },
    ]
}

/**
 * 获取会话搜索项（动态，从 store 读取）
 */
export function getSessionItems(): SearchItem[] {
    const { sessionMetas, switchSession } = useChatStore.getState()

    return sessionMetas.map((meta) => ({
        id: `session-${meta.id}`,
        type: 'session' as const,
        label: meta.title || '未命名会话',
        description: `${new Date(meta.updatedAt).toLocaleDateString()}`,
        icon: 'MessageSquare',
        keywords: [meta.title || ''],
        action: () => switchSession(meta.id),
    }))
}
```

- [ ] **Step 3: 验证编译通过**

Run:
```bash
cd D:/workspace/Geni && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/CommandPalette/types.ts src/renderer/components/CommandPalette/searchItems.ts
git commit -m "feat: add SearchItem types and search item registration"
```

---

### Task 5: 创建搜索索引 Hook 和命令面板逻辑 Hook

**Files:**
- Create: `src/renderer/components/CommandPalette/useSearchIndex.ts`
- Create: `src/renderer/components/CommandPalette/useCommandPalette.ts`

- [ ] **Step 1: 创建 useSearchIndex.ts — 从各 store 收集数据构建搜索索引**

```typescript
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
```

- [ ] **Step 2: 创建 useCommandPalette.ts — 搜索逻辑 + 键盘导航 + 前缀解析**

```typescript
// src/renderer/components/CommandPalette/useCommandPalette.ts
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useSearchIndex } from './useSearchIndex'
import { SearchItem, SearchItemType } from './types'
import { useLayoutStore } from '../../store/useLayoutStore'

export function useCommandPalette() {
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const paletteOpen = useLayoutStore(s => s.paletteOpen)
    const setPaletteOpen = useLayoutStore(s => s.setPaletteOpen)

    const { fuse, allItems } = useSearchIndex()

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

    // 执行搜索
    const results = useMemo(() => {
        let items: SearchItem[]

        if (!searchTerm) {
            // 无搜索词：返回全部（或按过滤类型返回全部）
            items = filterType ? allItems.filter(i => i.type === filterType) : allItems
        } else if (filterType) {
            // 有前缀过滤：先搜索再过滤类型
            items = fuse.search(searchTerm).map(r => r.item).filter(i => i.type === filterType)
        } else {
            // 无前缀：直接搜索
            items = fuse.search(searchTerm).map(r => r.item)
        }

        return items.slice(0, 10)
    }, [searchTerm, filterType, fuse, allItems])

    // 搜索结果变化时重置选中索引
    useEffect(() => {
        setSelectedIndex(0)
    }, [results.length])

    // 打开时自动聚焦
    useEffect(() => {
        if (paletteOpen) {
            setQuery('')
            setSelectedIndex(0)
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
            close()
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
```

- [ ] **Step 3: 验证编译通过**

Run:
```bash
cd D:/workspace/Geni && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/CommandPalette/useSearchIndex.ts src/renderer/components/CommandPalette/useCommandPalette.ts
git commit -m "feat: add search index and command palette logic hooks"
```

---

### Task 6: 创建 UI 子组件 (SearchInput, ResultItem, ResultList)

**Files:**
- Create: `src/renderer/components/CommandPalette/SearchInput.tsx`
- Create: `src/renderer/components/CommandPalette/ResultItem.tsx`
- Create: `src/renderer/components/CommandPalette/ResultList.tsx`

- [ ] **Step 1: 创建 SearchInput.tsx**

```tsx
// src/renderer/components/CommandPalette/SearchInput.tsx
import React, { useRef, useEffect } from 'react'
import { Search } from 'lucide-react'

interface SearchInputProps {
    query: string
    onQueryChange: (query: string) => void
    onKeyDown: (e: React.KeyboardEvent) => void
    inputRef: React.RefObject<HTMLInputElement | null>
    filterType: string | null
}

export function SearchInput({ query, onQueryChange, onKeyDown, inputRef, filterType }: SearchInputProps) {
    return (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/10">
            <Search size={16} className="text-slate-400 dark:text-zinc-500 shrink-0" />
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="搜索页面、会话、命令..."
                className="flex-1 bg-transparent text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none"
                spellCheck={false}
            />
            {!query && !filterType && (
                <span className="text-[11px] text-slate-400 dark:text-zinc-600 shrink-0">
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-[10px]">&gt;</kbd> 命令{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-[10px]">@</kbd> 会话
                </span>
            )}
        </div>
    )
}
```

- [ ] **Step 2: 创建 ResultItem.tsx**

```tsx
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
```

- [ ] **Step 3: 创建 ResultList.tsx**

```tsx
// src/renderer/components/CommandPalette/ResultList.tsx
import React from 'react'
import { SearchItem } from './types'
import { ResultItem } from './ResultItem'

const typeOrder: SearchItem['type'][] = ['page', 'session', 'command']
const typeLabels: Record<SearchItem['type'], string> = {
    page: '页面',
    session: '会话',
    command: '命令',
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
            {grouped.map((group, gi) => (
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
            ))}
        </div>
    )
}
```

- [ ] **Step 4: 验证编译通过**

Run:
```bash
cd D:/workspace/Geni && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/CommandPalette/SearchInput.tsx src/renderer/components/CommandPalette/ResultItem.tsx src/renderer/components/CommandPalette/ResultList.tsx
git commit -m "feat: add CommandPalette UI sub-components"
```

---

### Task 7: 创建 CommandPalette 入口组件并挂载到 App

**Files:**
- Create: `src/renderer/components/CommandPalette/index.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: 创建 CommandPalette/index.tsx — 入口组件**

```tsx
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
```

- [ ] **Step 2: 在 App.tsx 中导入并挂载 CommandPalette**

文件 `src/renderer/App.tsx`，做以下修改：

1. 添加 import：
```typescript
import { CommandPalette } from './components/CommandPalette'
```

2. 在 `<ConfirmDialog />` 之后添加：
```tsx
<CommandPalette />
```

最终 App.tsx 的 return 部分变为：
```tsx
return (
    <div className="flex h-screen w-full bg-transparent text-slate-900 dark:text-gray-100 font-sans overflow-hidden selection:bg-indigo-500/30">
        <Sidebar />
        {activeTab === 'chat' ? (
            <ChatLayout />
        ) : (
            <main className="flex-1 overflow-hidden bg-transparent">
                {activeTab === 'skills' && <SkillSettings />}
                {activeTab === 'staff' && <StaffPage />}
                {activeTab === 'scheduler' && <SchedulerPage />}
                {activeTab === 'settings' && <Settings />}
            </main>
        )}
        <ConfirmDialog />
        <CommandPalette />
    </div>
)
```

- [ ] **Step 3: 验证编译通过**

Run:
```bash
cd D:/workspace/Geni && npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: 无错误

- [ ] **Step 4: 手动测试**

Run:
```bash
cd D:/workspace/Geni && npm run dev
```

验证项：
1. 按 `Ctrl+K` 弹出搜索框
2. 输入文字能模糊匹配页面、会话、命令
3. 输入 `>` 前缀仅显示命令
4. 输入 `@` 前缀仅显示会话
5. `↑` `↓` 键能切换选中项
6. `Enter` 执行选中操作
7. `Esc` 关闭搜索框
8. 点击遮罩关闭搜索框

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/CommandPalette/index.tsx src/renderer/App.tsx
git commit -m "feat: add CommandPalette component and mount in App"
```

---

### Task 8: 添加 i18n 国际化支持（可选增强）

**Files:**
- Modify: `src/renderer/components/CommandPalette/SearchInput.tsx`
- Modify: `src/renderer/components/CommandPalette/ResultItem.tsx`
- Modify: `src/renderer/components/CommandPalette/ResultList.tsx`
- Modify: `src/renderer/components/CommandPalette/searchItems.ts`

此任务将硬编码的中文文案替换为 i18n key，支持多语言。如果项目当前仅需中文，此任务可跳过。

- [ ] **Step 1: 在 i18n 资源文件中添加 commandPalette 相关翻译 key**

具体 key 和翻译内容根据项目 i18n 文件结构添加（参考现有 `sidebar.chat` 等模式）。

- [ ] **Step 2: 替换硬编码文案为 `t()` 调用**

- [ ] **Step 3: 验证编译通过并测试**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add i18n support for CommandPalette"
```
