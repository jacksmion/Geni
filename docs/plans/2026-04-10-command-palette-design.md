# Command Palette (全局搜索框) 设计文档

## 概述

实现类似 Claude 桌面版的全局搜索框（Command Palette），支持模糊搜索页面导航、会话内容和命令操作。

## 技术方案：统一索引 + 前缀分类

### 核心数据结构

```ts
interface SearchItem {
  id: string
  type: 'page' | 'session' | 'command'
  label: string
  description?: string
  icon?: string
  keywords?: string[]
  action: () => void
}
```

### 前缀规则

| 前缀 | 过滤类型 | 示例 |
|------|---------|------|
| 无 | 全部类型混合 | `聊天` |
| `>` | 仅命令 | `> 新建会话` |
| `@` | 仅会话 | `@ 项目讨论` |

### 文件结构

```
src/renderer/components/CommandPalette/
├── index.tsx              # 入口，Portal浮层 + 快捷键监听
├── SearchInput.tsx        # 搜索输入框
├── ResultList.tsx         # 结果列表（含分组）
├── ResultItem.tsx         # 单条结果项
├── useSearchIndex.ts      # Hook: 从各store收集数据构建索引
├── useCommandPalette.ts   # Hook: 搜索逻辑 + 键盘导航 + 前缀解析
└── searchItems.ts         # 各类型搜索项的注册函数
```

### 集成点

1. **Zustand** - `useLayoutStore` 增加 `paletteOpen` 状态
2. **挂载位置** - 主布局中渲染 `<CommandPalette />`
3. **数据来源**：
   - 页面：路由/侧边栏配置中的固定导航项
   - 会话：`useChatStore` 的 sessions 列表
   - 命令：静态注册（新建会话、切换主题、导出等）

### 快捷键

- `Ctrl+K` / `Cmd+K`：打开搜索框
- `↑` / `↓`：移动选中项
- `Enter`：执行选中项
- `Esc`：关闭浮层
- `Backspace`：输入为空时关闭

### UI 设计

- 居中弹出，距顶部约 20%
- 宽度 `max-w-lg`，毛玻璃半透明背景
- 背景遮罩（50% 黑色透明），点击关闭
- 结果按类型分组，组间分隔线 + 小标题
- 最多展示 10 条结果，超出滚动（`max-h-80`）
- 选中项 `bg-indigo-50` 高亮
- 弹出/关闭 150ms scale + opacity 过渡

### 依赖

- **fuse.js**：模糊搜索引擎（需新增依赖）
- **lucide-react**：图标（已有）
- **zustand**：状态管理（已有）
- **tailwindcss**：样式（已有）

### 搜索数据来源

#### 页面（静态）
- 聊天、技能、员工、定时任务、设置

#### 会话（动态）
- 标题 + 最近消息摘要
- 从 useChatStore 实时获取

#### 命令（静态）
- 新建会话、切换主题、切换模型、导出会话、清除历史等
