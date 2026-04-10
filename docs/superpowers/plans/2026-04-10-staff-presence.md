# Staff Presence 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数字员工的存在感渗透到输入框、气泡、侧边栏三个核心交互区域。

**Architecture:** 纯前端改动。数据层扩展 `SessionMeta` 类型和后端索引以携带 `staffId`，前端从 `useStaffStore` 解析 avatar/name 后在各 UI 组件中渲染。移除 header StaffSelector，将唯一选择入口移至 Composer 输入框内。

**Tech Stack:** React 18, Zustand, Tailwind CSS, Lucide Icons, Electron IPC

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/common/types/chat.ts` | Modify | `SessionMeta` 增加 `staffId` 字段 |
| `src/main/services/session/SessionStorage.ts` | Modify | `updateIndex` / `rebuildIndex` 写入 `staffId` |
| `src/renderer/store/useChatStore.ts` | Modify | `sessionMetas` 类型扩展，`loadHistory` 读取 `staffId` |
| `src/renderer/components/StaffAvatar.tsx` | Create | 共享头像组件，支持 Lucide 图标 + Emoji 双模式渲染 |
| `src/renderer/modules/chat/Composer.tsx` | Modify | 新增 `StaffAvatarButton` 组件，集成到 textarea 左侧 |
| `src/renderer/modules/chat/MessageList.tsx` | Modify | `MessageItem` 头像和 meta 替换为员工信息 |
| `src/renderer/layouts/ChatLayout.tsx` | Modify | 移除 `StaffSelector` 组件及 header 中的引用 |
| `src/renderer/layouts/sidebar/SessionSidebar.tsx` | Modify | session 图标替换为员工头像 |

---

### Task 1: 扩展 SessionMeta 类型

**Files:**
- Modify: `src/common/types/chat.ts:73-79`

- [ ] **Step 1: 给 SessionMeta 添加 staffId 字段**

```typescript
export interface SessionMeta {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    preview?: string;
    staffId?: string;
}
```

- [ ] **Step 2: 运行类型检查确认无报错**

Run: `cd D:/workspace/Geni && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增类型错误（`staffId` 是可选字段，不影响已有代码）

- [ ] **Step 3: Commit**

```bash
git add src/common/types/chat.ts
git commit -m "feat: add staffId to SessionMeta type"
```

---

### Task 2: 后端索引写入 staffId

**Files:**
- Modify: `src/main/services/session/SessionStorage.ts:198-204` (updateIndex)
- Modify: `src/main/services/session/SessionStorage.ts:92-98` (rebuildIndex)

- [ ] **Step 1: 在 updateIndex 方法中写入 staffId**

`src/main/services/session/SessionStorage.ts` — 找到 `updateIndex` 方法中构建 `meta` 对象的位置（约 line 198），添加 `staffId`:

```typescript
        const meta: SessionMeta = {
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            preview: this.extractTextFromContent(session.messages[session.messages.length - 1]?.content).slice(0, 100) || undefined,
            staffId: session.staffId,
        };
```

- [ ] **Step 2: 在 rebuildIndex 方法中写入 staffId**

`src/main/services/session/SessionStorage.ts` — 找到 `rebuildIndex` 方法中构建 metas 的位置（约 line 92），添加 `staffId`:

```typescript
                    if (session.id && session.createdAt) {
                        metas.push({
                            id: session.id,
                            title: session.title,
                            createdAt: session.createdAt,
                            updatedAt: session.updatedAt,
                            preview: this.extractTextFromContent(session.messages?.[session.messages.length - 1]?.content).slice(0, 100) || undefined,
                            staffId: session.staffId,
                        });
                    }
```

- [ ] **Step 3: 运行测试确认后端无回归**

Run: `cd D:/workspace/Geni && npx vitest run tests/main/services/session/ 2>&1 | tail -20`
Expected: 所有 session 相关测试通过

- [ ] **Step 4: Commit**

```bash
git add src/main/services/session/SessionStorage.ts
git commit -m "feat: persist staffId in session index"
```

---

### Task 3: 前端 sessionMetas 读取 staffId

**Files:**
- Modify: `src/renderer/store/useChatStore.ts`

- [ ] **Step 1: 扩展 sessionMetas 类型**

`src/renderer/store/useChatStore.ts` — 找到 `sessionMetas` 的类型定义（约 line 14）:

将:
```typescript
    sessionMetas: { id: string, title?: string, updatedAt: number }[]
```
改为:
```typescript
    sessionMetas: { id: string, title?: string, updatedAt: number, staffId?: string }[]
```

- [ ] **Step 2: 在 loadHistory 中读取 staffId**

`src/renderer/store/useChatStore.ts` — 在 `loadHistory` 方法中找到构建 `sessionMetas` 的位置（约 line 80）:

将:
```typescript
            list.forEach((meta: any) => {
                sessions[meta.id] = { ...meta, messages: [] };
                sessionMetas.push({ id: meta.id, title: meta.title, updatedAt: meta.updatedAt });
            });
```
改为:
```typescript
            list.forEach((meta: any) => {
                sessions[meta.id] = { ...meta, messages: [] };
                sessionMetas.push({ id: meta.id, title: meta.title, updatedAt: meta.updatedAt, staffId: meta.staffId });
            });
```

- [ ] **Step 3: 在 createSession 的 sessionMetas push 中同步 staffId**

`src/renderer/store/useChatStore.ts` — `createSession` 方法中（约 line 136）的 sessionMetas push 已经是手动构造，新 session 没有 staffId，无需改动。确认无误即可。

- [ ] **Step 4: 在 assignStaff 中同步更新 sessionMetas**

`src/renderer/store/useChatStore.ts` — `assignStaff` 方法（约 line 231）目前只更新了 sessions，需要同步更新 sessionMetas:

将:
```typescript
    assignStaff: async (id, staffId) => {
        set(state => {
            const session = state.sessions[id];
            if (!session) return state;

            const updated = { ...session, staffId };
            return {
                sessions: { ...state.sessions, [id]: updated }
            };
        });
```
改为:
```typescript
    assignStaff: async (id, staffId) => {
        set(state => {
            const session = state.sessions[id];
            if (!session) return state;

            const updated = { ...session, staffId };
            return {
                sessions: { ...state.sessions, [id]: updated },
                sessionMetas: state.sessionMetas.map(m =>
                    m.id === id ? { ...m, staffId } : m
                )
            };
        });
```

- [ ] **Step 5: 运行 tsc 确认无类型错误**

Run: `cd D:/workspace/Geni && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 6: Commit**

```bash
git add src/renderer/store/useChatStore.ts
git commit -m "feat: read and sync staffId in frontend sessionMetas"
```

---

### Task 4: 创建共享 StaffAvatar 组件

**Files:**
- Create: `src/renderer/components/StaffAvatar.tsx`

头像是 Lucide 图标还是 Emoji，由 `StaffProfile.avatar` 字段的值自动判断。如果值匹配预设图标名列表中的某一项，渲染 Lucide 图标；否则直接当 Emoji/文字渲染。

- [ ] **Step 1: 创建 StaffAvatar.tsx**

```typescript
import React from 'react'
import {
    Bot, User, GraduationCap, Cpu, BarChart3, Globe,
    Sparkles, Code2, Terminal, Wrench, ShieldAlert,
    Search, Briefcase, Palette, PenTool, BookOpen, Rocket,
    type LucideIcon
} from 'lucide-react'

/**
 * 预设图标映射表
 * key = StaffProfile.avatar 中存储的标识符
 * value = 对应的 Lucide 图标组件
 *
 * 如果 avatar 值不在此表中，视为 Emoji/文字直接渲染
 */
export const STAFF_ICONS: Record<string, LucideIcon> = {
    Bot,
    User,
    GraduationCap,
    Cpu,
    BarChart3,
    Globe,
    Sparkles,
    Code2,
    Terminal,
    Wrench,
    ShieldAlert,
    Search,
    Briefcase,
    Palette,
    PenTool,
    BookOpen,
    Rocket,
}

interface StaffAvatarProps {
    avatar?: string
    name?: string
    size?: number
    className?: string
    iconClassName?: string
}

/**
 * 根据 avatar 值自动判断渲染方式：
 * - 匹配 STAFF_ICONS 中的 key → 渲染 Lucide 图标
 * - 其他 → 渲染为 Emoji/文字
 * - 都没有 → fallback 到 Bot 图标
 */
export function StaffAvatar({ avatar, name, size = 16, className, iconClassName }: StaffAvatarProps) {
    const IconComponent = avatar ? STAFF_ICONS[avatar] : undefined

    if (IconComponent) {
        return (
            <IconComponent
                size={size}
                className={iconClassName}
            />
        )
    }

    if (avatar) {
        // Emoji 模式
        const fontSize = Math.round(size * 0.9)
        return (
            <span
                className={className}
                style={{ fontSize, lineHeight: 1 }}
            >
                {avatar}
            </span>
        )
    }

    // Fallback: 名字首字母 或 Bot 图标
    if (name) {
        const fontSize = Math.round(size * 0.65)
        return (
            <span
                className={className}
                style={{ fontSize, fontWeight: 700, lineHeight: 1 }}
            >
                {name.charAt(0).toUpperCase()}
            </span>
        )
    }

    return <Bot size={size} className={iconClassName} />
}
```

- [ ] **Step 2: 验证无类型错误**

Run: `cd D:/workspace/Geni && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/StaffAvatar.tsx
git commit -m "feat: add shared StaffAvatar component with Lucide + Emoji support"
```

---

### Task 5: Composer 输入框集成员工头像选择器

**Files:**
- Modify: `src/renderer/modules/chat/Composer.tsx`

这是最大的改动。在 `Composer` 函数组件的 textarea 左侧增加一个 `StaffAvatarButton`，点击后弹出选择面板。

- [ ] **Step 1: 在 Composer.tsx 顶部添加 import**

在 `Composer.tsx` 文件顶部 import 区域添加:

```typescript
import { useStaffStore } from '../../store/useStaffStore'
import { StaffAvatar, STAFF_ICONS } from '../components/StaffAvatar'
```

- [ ] **Step 2: 在 `Composer` 函数之前添加 `StaffAvatarButton` 组件**

在 `WorkspaceSelector` 函数之后、`Composer` 函数之前，插入新组件:

```typescript
function StaffAvatarButton() {
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const assignStaff = useChatStore(s => s.assignStaff)
    const { profiles, loadProfiles } = useStaffStore()
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const currentStaffId = sessions[activeSessionId]?.staffId
    const currentStaff = profiles.find(p => p.id === currentStaffId)

    useEffect(() => {
        if (profiles.length === 0) loadProfiles()
    }, [profiles.length, loadProfiles])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        if (isOpen) document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 transition-all",
                    "border border-slate-200/80 dark:border-white/10 shadow-sm",
                    isOpen
                        ? "bg-white dark:bg-[#1a1a1c] ring-2 ring-indigo-500/20"
                        : "bg-white dark:bg-[#1a1a1c] hover:ring-1 hover:ring-slate-200 dark:hover:ring-white/10"
                )}
                title={currentStaff ? currentStaff.name : 'AI 助手 (默认)'}
            >
                <StaffAvatar
                    avatar={currentStaff?.avatar}
                    name={currentStaff?.name}
                    size={14}
                    iconClassName="text-slate-500 dark:text-indigo-300"
                />
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-[#1e1e20] border border-slate-200/60 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider border-b border-slate-100 dark:border-white/5">
                        选择数字员工
                    </div>

                    <div className="py-1 max-h-60 overflow-y-auto">
                        {/* Default AI option */}
                        <button
                            onClick={() => { assignStaff(activeSessionId, undefined); setIsOpen(false) }}
                            className={cn(
                                "w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors",
                                !currentStaffId
                                    ? "bg-indigo-50/50 dark:bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 font-medium"
                                    : "text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
                            )}
                        >
                            <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-zinc-700/60 flex items-center justify-center shrink-0">
                                <StaffAvatar size={12} iconClassName="text-slate-500 dark:text-zinc-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate">AI 助手 (默认)</div>
                            </div>
                            {!currentStaffId && <Check size={14} className="text-indigo-500 shrink-0" />}
                        </button>

                        <div className="h-px bg-slate-100 dark:bg-white/5 my-1" />

                        {profiles.length === 0 ? (
                            <div className="px-3 py-4 text-center text-[11px] text-slate-400 dark:text-zinc-500">
                                暂无数字员工
                            </div>
                        ) : (
                            profiles.map(p => {
                                const isActive = currentStaffId === p.id
                                const hasIcon = p.avatar && STAFF_ICONS[p.avatar]
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => { assignStaff(activeSessionId, p.id); setIsOpen(false) }}
                                        className={cn(
                                            "w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors",
                                            isActive
                                                ? "bg-indigo-50/50 dark:bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 font-medium"
                                                : "text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                                            hasIcon
                                                ? "bg-slate-100 dark:bg-zinc-700/60"
                                                : "bg-gradient-to-br from-indigo-500 to-purple-500"
                                        )}>
                                            <StaffAvatar
                                                avatar={p.avatar}
                                                name={p.name}
                                                size={hasIcon ? 12 : 13}
                                                iconClassName={hasIcon ? "text-slate-500 dark:text-zinc-400" : undefined}
                                                className={hasIcon ? undefined : "text-white"}
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate">{p.name}</div>
                                            {p.description && <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{p.description}</div>}
                                        </div>
                                        {isActive && <Check size={14} className="text-indigo-500 shrink-0" />}
                                    </button>
                                )
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 3: 将 StaffAvatarButton 集成到 Composer textarea 区域**

在 `Composer` 函数的 JSX 中，找到 `<textarea>` 元素（约 line 634），在它之前添加 `<StaffAvatarButton />`。

将 textarea 区域从:
```tsx
                    {/* TextArea */}
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                        placeholder="Message Geni..."
                        className="w-full bg-transparent px-5 py-4 min-h-[56px] max-h-264 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none resize-none scrollbar-hide"
                        rows={1}
                        style={{ lineHeight: '1.5' }}
                    />
```

改为:
```tsx
                    {/* TextArea with Staff Avatar */}
                    <div className="flex items-end gap-0">
                        <div className="pl-4 pb-3.5 pt-3">
                            <StaffAvatarButton />
                        </div>
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            placeholder="Message Geni..."
                            className="flex-1 bg-transparent px-3 py-4 min-h-[56px] max-h-264 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none resize-none scrollbar-hide"
                            rows={1}
                            style={{ lineHeight: '1.5' }}
                        />
                    </div>
```

注意：placeholder 可根据当前员工动态化（可选优化），如 `"向 AI 助手提问..."` 或 `"向 架构师A 提问..."`。暂不实现此优化。

- [ ] **Step 4: 验证 Composer 渲染无报错**

Run: `cd D:/workspace/Geni && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增类型错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/modules/chat/Composer.tsx
git commit -m "feat: add staff avatar button to composer input area"
```

---

### Task 6: MessageItem 气泡显示员工身份

**Files:**
- Modify: `src/renderer/modules/chat/MessageList.tsx`

- [ ] **Step 1: 在 MessageList.tsx 顶部添加 import**

在文件顶部的 import 区域添加:

```typescript
import { useStaffStore } from '../../store/useStaffStore'
import { StaffAvatar } from '../../components/StaffAvatar'
```

确保 `Bot` 已在 lucide-react import 中（应已存在，确认即可）。

- [ ] **Step 2: 扩展 MessageItem props**

找到 `MessageItem` 的定义（约 line 283）:

将:
```typescript
const MessageItem = React.memo(function MessageItem({ message, isStreaming }: { message: ChatMessage, isStreaming?: boolean }) {
```
改为:
```typescript
const MessageItem = React.memo(function MessageItem({ message, isStreaming, staffId }: { message: ChatMessage, isStreaming?: boolean, staffId?: string }) {
```

- [ ] **Step 3: 在 MessageItem 内部获取员工信息**

在 `MessageItem` 函数体开头的变量声明区域添加:

```typescript
    const { profiles } = useStaffStore()
    const staff = staffId ? profiles.find(p => p.id === staffId) : undefined
```

- [ ] **Step 4: 替换 AI 头像**

找到 AI 消息的头像渲染（约 line 316-321）:

将:
```tsx
            {!isUser && (
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 bg-white dark:bg-[#1a1a1c] border border-slate-200/80 dark:border-white/10 shadow-sm mt-1">
                    <Bot size={16} className="text-slate-700 dark:text-indigo-300" />
                </div>

            )}
```
改为:
```tsx
            {!isUser && (
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 bg-white dark:bg-[#1a1a1c] border border-slate-200/80 dark:border-white/10 shadow-sm mt-1">
                    <StaffAvatar
                        avatar={staff?.avatar}
                        name={staff?.name}
                        size={16}
                        iconClassName="text-slate-700 dark:text-indigo-300"
                    />
                </div>
            )}
```

- [ ] **Step 5: 替换底部 meta 中的 "Geni" 文字**

找到底部 meta 渲染（约 line 415）:

将:
```tsx
                                    <span>Geni {message.timestamp ? `· ${new Date(message.timestamp).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
```
改为:
```tsx
                                    <span>{staff ? staff.name : 'Geni'} {message.timestamp ? `· ${new Date(message.timestamp).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
```

- [ ] **Step 6: 从 MessageList 传递 staffId 给 MessageItem**

在 `MessageList` 主组件中（不是 MessageItem），找到渲染 `<MessageItem>` 的位置。需要从 chatStore 获取当前 session 的 staffId:

在 `MessageList` 组件内部添加:
```typescript
    const activeSessionId = useChatStore(s => s.activeSessionId)
    const sessions = useChatStore(s => s.sessions)
    const staffId = sessions[activeSessionId]?.staffId
```

然后找到 `<MessageItem message={msg} isStreaming={...} />` 调用，添加 `staffId` prop:
```tsx
<MessageItem message={msg} isStreaming={isLastGroup && isStreaming} staffId={staffId} />
```

- [ ] **Step 7: 更新 React.memo 的比较函数**

`MessageItem` 的 memo 比较函数（约 line 433）需要比较 `staffId`:

在比较函数最前面添加:
```typescript
    if (prevProps.staffId !== nextProps.staffId) return false;
```

- [ ] **Step 8: 运行 tsc 确认无类型错误**

Run: `cd D:/workspace/Geni && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 9: Commit**

```bash
git add src/renderer/modules/chat/MessageList.tsx
git commit -m "feat: show staff avatar and name in message bubbles"
```

---

### Task 7: 移除 Header StaffSelector

**Files:**
- Modify: `src/renderer/layouts/ChatLayout.tsx`

- [ ] **Step 1: 移除 header 中的 StaffSelector 引用**

在 `ChatLayout.tsx` 中，找到 header 的右侧区域（约 line 123-126）:

将:
```tsx
                        {/* Right: Staff Selector */}
                        <div className="flex items-center gap-2 no-drag pr-[140px]">
                            {currentSessionMeta && <StaffSelector currentSessionId={currentSessionMeta.id} currentStaffId={currentSessionMeta.staffId} />}
                        </div>
```
改为:
```tsx
                        {/* Right: Spacer for window controls */}
                        <div className="flex items-center gap-2 no-drag pr-[140px]" />
```

- [ ] **Step 2: 移除 StaffSelector 函数组件**

删除 `ChatLayout.tsx` 底部的整个 `StaffSelector` 函数组件（约 line 186-258）。

- [ ] **Step 3: 清理不再需要的 import**

- 从 `ChatLayout.tsx` 中移除 `useStaffStore` import（如果仅 StaffSelector 使用它）

检查 `useStaffStore` 是否在 `ChatLayout.tsx` 的其他位置使用。如果只在 `StaffSelector` 中使用，则移除:
```typescript
import { useStaffStore } from '../store/useStaffStore'
```

- `currentSessionMeta` 中的 `staffId` 属性也可能不再需要用于 `ChatLayout`。检查 `currentSessionMeta` 的构建（约 line 19-29），如果 `staffId` 仅用于传给已删除的 `StaffSelector`，可以从 select 中移除 `staffId: session.staffId`。

- [ ] **Step 4: 运行 tsc 确认无类型错误**

Run: `cd D:/workspace/Geni && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/layouts/ChatLayout.tsx
git commit -m "refactor: remove StaffSelector from header (moved to composer)"
```

---

### Task 8: 侧边栏显示员工头像

**Files:**
- Modify: `src/renderer/layouts/sidebar/SessionSidebar.tsx`

- [ ] **Step 1: 添加 import**

在 `SessionSidebar.tsx` 顶部 import 区域添加:

```typescript
import { useStaffStore } from '../../store/useStaffStore';
import { StaffAvatar } from '../../components/StaffAvatar';
```

- [ ] **Step 2: 在 SessionSidebar 组件中获取 staff profiles**

在 `SessionSidebar` 函数组件内部（约 line 11 之后），添加:

```typescript
    const { profiles } = useStaffStore();
```

- [ ] **Step 3: 替换 session 图标**

找到 session 列表中渲染 `MessageSquare` 图标的位置（约 line 218-224）:

将:
```tsx
                                                <MessageSquare
                                                    size={14}
                                                    className={clsx(
                                                        "shrink-0 mr-2.5",
                                                        isActive ? "text-indigo-500" : "text-slate-400 dark:text-zinc-600"
                                                    )}
                                                />
```
改为:
```tsx
                                                {(() => {
                                                    const staff = session.staffId ? profiles.find(p => p.id === session.staffId) : undefined;
                                                    return staff?.avatar ? (
                                                        <span className="shrink-0 mr-2.5 flex items-center justify-center w-[14px]">
                                                            <StaffAvatar
                                                                avatar={staff.avatar}
                                                                name={staff.name}
                                                                size={14}
                                                                className={clsx(
                                                                    "leading-none",
                                                                    isActive ? "opacity-100" : "opacity-60"
                                                                )}
                                                                iconClassName={clsx(
                                                                    isActive ? "text-indigo-500" : "text-slate-400 dark:text-zinc-600"
                                                                )}
                                                            />
                                                        </span>
                                                    ) : (
                                                        <MessageSquare
                                                            size={14}
                                                            className={clsx(
                                                                "shrink-0 mr-2.5",
                                                                isActive ? "text-indigo-500" : "text-slate-400 dark:text-zinc-600"
                                                            )}
                                                        />
                                                    );
                                                })()}
```

注意：这里使用了 `session.staffId`。由于 Task 3 已扩展了 `sessionMetas` 类型并从后端读取了 `staffId`，所以 `session.staffId` 可用。`SessionSidebar` 中 `sessions` 变量类型为 `Record<string, any>`，无需额外类型修改。

- [ ] **Step 4: 运行 tsc 确认无类型错误**

Run: `cd D:/workspace/Geni && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/layouts/sidebar/SessionSidebar.tsx
git commit -m "feat: show staff emoji avatar in session sidebar"
```

---

### Task 9: 集成验证与最终提交

- [ ] **Step 1: 完整构建测试**

Run: `cd D:/workspace/Geni && npx tsc --noEmit 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 2: 运行全部测试**

Run: `cd D:/workspace/Geni && npx vitest run 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 3: 启动 dev 验证 UI**

Run: `cd D:/workspace/Geni && npm run dev`

手动验证:
1. 输入框左侧显示 Bot 图标（默认无员工时）
2. 点击弹出选择面板，能看到 "AI 助手 (默认)" 和员工列表
3. 选择员工后，输入框头像变为员工 emoji
4. 发送消息后，AI 气泡显示员工 emoji 头像和名称
5. 侧边栏 session 列表显示员工 emoji
6. Header 中不再有 StaffSelector

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: polish staff presence UI integration"
```
