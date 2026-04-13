# Geni 前端优化与改进方案

> 分析日期：2026-04-13
> 分析范围：`src/renderer/` 全部前端代码
> 分析维度：UI 布局、交互逻辑、UI 配色、动效、可访问性、组件架构、性能

---

## 一、UI 布局问题

### 1.1 导航栏信息密度低

- **现状**：`Sidebar.tsx` 仅 50px 宽的图标轨道，4 个导航项 + 2 个底部按钮
- **问题**：用户任务名称、上下文信息无处可见，需要点击进入聊天界面才能看到
- **涉及文件**：`src/renderer/layouts/sidebar/Sidebar.tsx`
- **改进方向**：考虑类似 Cursor/VS Code 的可折叠侧边栏设计，展开时显示文字标签和最近任务摘要

### 1.2 空状态页面缺乏视觉层次

- **现状**：`ChatLayout.tsx` 欢迎页面将 Logo + 标题 + 员工选择器 + Composer 垂直居中堆叠
- **问题**：StaffPicker 用 `flex-wrap` 布局，员工卡片宽度固定 110px，在宽屏下显得零散
- **涉及文件**：`src/renderer/layouts/ChatLayout.tsx` (L245-L267)
- **改进方向**：加入视觉引导线或分区卡片，让"选择员工"和"输入消息"有明确的视觉层次

### 1.3 Artifact 面板定位问题

- **现状**：使用 `absolute` 定位 + `top-30 right-2`
- **问题**：不同窗口大小下面板位置不统一；面板挤压聊天区域通过 `margin-right` 实现，最小宽度仅 360px
- **涉及文件**：`src/renderer/layouts/ChatLayout.tsx` (L274)
- **改进方向**：使用 flex 布局代替 absolute 定位，或加入面板折叠/全屏切换

### 1.4 Settings 页面导航模式不直观

- **现状**：Settings 内部有独立的图标侧边栏（56px），9 个设置项用图标表示
- **问题**：没有文字标签，用户需要 hover 才知道含义
- **涉及文件**：`src/renderer/pages/Settings.tsx`
- **改进方向**：在设置侧边栏中增加文字标签，或使用列表式导航

### 1.5 SessionSidebar 搜索与批量操作冲突

- **现状**：搜索栏和批量操作按钮在顶部同一区域
- **问题**：功能间缺乏视觉分隔；批量删除模式的复选框与正常的双击重命名操作可能产生冲突
- **涉及文件**：`src/renderer/layouts/sidebar/SessionSidebar.tsx`
- **改进方向**：将搜索和批量操作分区，批量模式时禁用重命名功能

---

## 二、交互逻辑问题

### 2.1 cn() 工具函数重复定义

- **现状**：`cn(clsx + twMerge)` 在 6+ 文件中重复定义
- **涉及文件**：
  - `src/renderer/layouts/ChatLayout.tsx` (L16-L18)
  - `src/renderer/modules/chat/Composer.tsx` (L15-L17)
  - 及其他 4+ 文件
- **改进方案**：
  1. 创建 `src/renderer/utils/cn.ts` 统一导出
  2. 全局替换所有本地定义为 `import { cn } from '@/utils/cn'`

### 2.2 Outside-click 逻辑重复

- **现状**：ModelSelector、SkillSelector、WorkspaceSelector 各自实现完全相同的 `useEffect` + `mousedown` 外部点击关闭逻辑
- **涉及文件**：
  - `src/renderer/modules/chat/Composer.tsx` (ModelSelector L45-L55, SkillSelector L277-L285, WorkspaceSelector L447-L454)
- **改进方案**：
  1. 创建 `src/renderer/hooks/useClickOutside.ts`
  ```ts
  export function useClickOutside(ref: RefObject<HTMLElement>, callback: () => void) {
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) callback()
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [ref, callback])
  }
  ```

### 2.3 Provider 图标/颜色元数据重复

- **现状**：`PROVIDER_DISPLAY` 对象在 `Composer.tsx` (L20-L29) 和 `ModelSettings.tsx` 中重复定义
- **涉及文件**：
  - `src/renderer/modules/chat/Composer.tsx`
  - `src/renderer/pages/settings/ModelSettings.tsx`
- **改进方案**：提取到 `src/renderer/utils/providers.ts` 共享

### 2.4 下拉组件无键盘导航

- **现状**：ModelSelector、SkillSelector、WorkspaceSelector 的下拉列表不支持键盘上下键选择
- **问题**：只有 CommandPalette 实现了完整的键盘导航（箭头键 + Enter + Escape）
- **涉及文件**：`src/renderer/modules/chat/Composer.tsx`
- **改进方案**：创建通用 `Dropdown/Listbox` 组件，统一处理键盘导航

### 2.5 表单缺乏验证反馈

- **现状**：StaffEditor 表单字段无验证提示；Settings 中 API Key、URL 输入缺乏实时格式验证
- **涉及文件**：
  - `src/renderer/pages/StaffPage.tsx`
  - `src/renderer/pages/settings/ModelSettings.tsx`
- **改进方案**：增加内联验证提示，使用 `aria-invalid` 和 `aria-describedby`

### 2.6 发送按钮状态管理分散

- **现状**：send/stop 按钮的禁用状态通过 `disabled` 和条件 className 处理，逻辑较分散；发送失败时无重试 UI
- **涉及文件**：`src/renderer/modules/chat/Composer.tsx` (L701-L715)
- **改进方案**：抽取 `useComposerState` hook 管理发送/停止/错误状态

---

## 三、UI 配色与视觉问题

### 3.1 暗色模式背景层次不足

- **现状**：暗色主背景 `#09090b`（Zinc-950）、sidebar `#18181b`（Zinc-900）、composer `#18181b/95`
- **问题**：仅有微妙的 `/5` 到 `/10` 透明度差异区分区域边界，层次感不足
- **涉及文件**：`src/renderer/index.css` (L30-L43)
- **改进方案**：引入第三级背景色（如 `#111113`）增加层次，或在侧边栏与主区域间使用微妙的渐变过渡

### 3.2 Accent 色系统与 Tailwind 硬编码冲突

- **现状**：通过 CSS 变量 `--color-primary-*` 实现主题色切换，映射到 `indigo-*`；但代码中大量使用 `indigo-*` 类名硬编码
- **问题**：同时有 `violet-*` 用于 skills（`Composer.tsx` L322），语义不统一
- **涉及文件**：
  - `src/renderer/utils/theme.ts`
  - `tailwind.config.js`
  - 所有使用 `indigo-*` 的组件
- **改进方案**：
  1. 在 Tailwind 配置中定义 `primary-*` 颜色 token，映射到 CSS 变量
  2. 全局替换 `indigo-*` 为 `primary-*`
  3. Skills 相关颜色使用 `accent-*` 或保持 `violet-*` 作为功能色

### 3.3 状态色彩语义不一致

- **现状**：
  - Thinking → indigo，Tool 执行 → emerald，Awaiting → amber，Error → red
  - AccessIndicator：Full access → emerald，Ask mode → amber（与状态色重叠）
  - Skills 选择器 → violet（与主色调 indigo 视觉竞争）
- **涉及文件**：
  - `src/renderer/components/StatusIndicator.tsx`
  - `src/renderer/modules/chat/Composer.tsx` (AccessIndicator)
  - `src/renderer/modules/chat/Composer.tsx` (SkillSelector)
- **改进方案**：建立统一的语义色彩映射表，所有交互状态共享同一套色彩语义

### 3.4 字体选择缺乏品牌辨识度

- **现状**：`'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **问题**：Inter 是典型通用字体，没有品牌辨识度
- **涉及文件**：`src/renderer/index.css` (L48)
- **改进方案**：
  1. 标题/Logo 引入辨识度更高的字体（Sora / Plus Jakarta Sans / DM Sans）
  2. 正文保持 Inter 的可读性
  3. 定义 CSS 变量 `--font-display` 和 `--font-body` 分离

### 3.5 阴影系统不统一

- **现状**：
  - Composer: `shadow-[0_8px_32px_rgba(0,0,0,0.06)]`（自定义）
  - ArtifactPanel: `shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5),...]`（自定义）
  - Dropdown: `shadow-2xl`（Tailwind 内置）
- **涉及文件**：多个组件文件
- **改进方案**：定义 3-4 级阴影 token，统一使用
  ```css
  :root {
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md: 0 4px 16px rgba(0,0,0,0.06);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.08);
    --shadow-xl: 0 25px 60px -15px rgba(0,0,0,0.15);
  }
  ```

---

## 四、动效与微交互问题

### 4.1 动效时间曲线不一致

- **现状**：
  - 侧边栏折叠: `transition-all duration-300`
  - 下拉菜单展开: `animate-in fade-in slide-in-from-bottom-2 duration-150`
  - 页面切换: 无过渡动画
  - 空状态入场: `animate-in fade-in zoom-in-95 duration-500`
- **改进方案**：建立动效规范
  - 快速反馈: 150ms ease-out
  - 区域切换: 200-300ms ease-in-out
  - 页面过渡: 300-500ms ease-in-out

### 4.2 缺少加载骨架屏

- **现状**：Session 列表、Model 列表、Skills 列表加载时无 loading 占位
- **改进方案**：添加 Skeleton 组件用于数据加载态
  ```tsx
  // src/renderer/components/Skeleton.tsx
  export function Skeleton({ className }: { className?: string }) {
    return <div className={cn("animate-pulse bg-slate-200 dark:bg-zinc-800 rounded-md", className)} />
  }
  ```

### 4.3 过渡动画缺失

- **现状**：Tab 切换（chat → settings → staff）无过渡动画；Artifact 面板关闭无退出动画
- **涉及文件**：`src/renderer/App.tsx`
- **改进方案**：
  1. Tab 切换添加 `AnimatePresence` + fade/slide 过渡
  2. Artifact 面板关闭时添加 exit 动画

---

## 五、可访问性问题

### 5.1 ARIA 属性缺失

- **现状**：
  - 大部分 icon-only 按钮仅有 `title` 属性，缺少 `aria-label`
  - Modal 组件（ConfirmDialog、AuthorizationModal）缺少 `role="dialog"` 和 `aria-modal="true"`
  - 没有 ARIA live region 用于播报流式消息状态变化
- **涉及文件**：
  - `src/renderer/layouts/sidebar/Sidebar.tsx` (NavButton)
  - `src/renderer/components/modals/ConfirmDialog.tsx`
  - `src/renderer/components/modals/AuthorizationModal.tsx`
- **改进方案**：系统性为所有 interactive 元素添加 ARIA 属性

### 5.2 Focus 管理缺失

- **现状**：
  - 模态框打开时没有 focus trap
  - Tab 切换后焦点位置不受控
  - 大部分按钮缺少 `focus-visible` 样式（只有 Switch 组件做了）
- **涉及文件**：多个组件
- **改进方案**：
  1. 实现 `useFocusTrap` hook
  2. 统一 `focus-visible:ring-2 focus-visible:ring-primary-500/50` 样式
  3. 模态框关闭后将焦点返回触发元素

### 5.3 用户文本选择被全局禁用

- **现状**：`index.css` L49 的 `user-select: none` 在 body 上全局禁用了文本选择
- **问题**：严重影响可访问性和用户体验
- **涉及文件**：`src/renderer/index.css` (L49)
- **改进方案**：
  ```css
  body {
    /* 移除 user-select: none */
  }
  /* 仅在非文本元素上禁用选择 */
  button, nav, aside, header, .no-select {
    user-select: none;
  }
  /* 消息正文和代码块允许选择 */
  .prose, code, pre {
    user-select: text;
  }
  ```

---

## 六、组件架构问题

### 6.1 缺乏基础 UI 组件库

- **现状**：没有统一的 Button、Input、Select、Dropdown 组件，每个需要下拉的组件都重新实现
- **改进方案**：建立基础 UI 组件库
  ```
  src/renderer/components/ui/
    Button.tsx        -- 统一按钮样式变体
    Dropdown.tsx      -- 统一下拉组件（含键盘导航、外部点击关闭）
    Tooltip.tsx       -- 统一 tooltip
    Modal.tsx         -- 统一模态框（含 focus trap、ARIA）
    Input.tsx         -- 统一输入框（含验证状态）
    Skeleton.tsx      -- 加载骨架屏
  ```

### 6.2 Tooltip 实现分散

- **现状**：`Sidebar.tsx` L63-L66 的 tooltip 通过 absolute 定位 + opacity 动画手动实现，每个需要的组件都重复此代码
- **涉及文件**：`src/renderer/layouts/sidebar/Sidebar.tsx`
- **改进方案**：创建 `<Tooltip>` 组件

### 6.3 组件文件过大

- **现状**：
  - `Composer.tsx` 744 行，包含 5 个子组件（ModelSelector、SkillSelector、WorkspaceSelector、AccessIndicator、TooltipButton）
  - `MessageList.tsx` 同样庞大
- **涉及文件**：
  - `src/renderer/modules/chat/Composer.tsx`
  - `src/renderer/modules/chat/MessageList.tsx`
- **改进方案**：将 Composer 的子组件拆分到独立文件
  ```
  src/renderer/modules/chat/
    Composer.tsx           -- 主组件，组合子组件
    ModelSelector.tsx
    SkillSelector.tsx
    WorkspaceSelector.tsx
    AccessIndicator.tsx
  ```

---

## 七、性能优化

### 7.1 Session 列表时间更新性能

- **现状**：`SessionSidebar` 每 60 秒通过 `setInterval` 更新所有会话的相对时间显示，触发整个列表重新渲染
- **涉及文件**：`src/renderer/layouts/sidebar/SessionSidebar.tsx`
- **改进方案**：
  1. 使用虚拟化列表（`@tanstack/virtual`）
  2. 或仅更新可见项的时间（将时间格式化逻辑移到单个 SessionItem 组件内部）

### 7.2 消息列表缺少虚拟滚动

- **现状**：`MessageList` 直接渲染所有消息，长会话中 DOM 节点数量可能很大
- **涉及文件**：`src/renderer/modules/chat/MessageList.tsx`
- **改进方案**：实现虚拟滚动或消息懒加载（仅渲染可视区域 +/- buffer）

---

## 八、优先级排序

| 优先级 | 改进项 | 类别 | 工作量 | 影响 |
|--------|--------|------|--------|------|
| **P0** | 提取共享工具函数（cn、useClickOutside、ProviderDisplay） | 重构 | 小 | 代码质量、可维护性 |
| **P0** | 建立基础 UI 组件库（Button、Dropdown、Tooltip） | 架构 | 中 | 减少重复代码、统一体验 |
| **P0** | 修复 user-select: none 全局禁用 | 可访问性 | 小 | 基础体验 |
| **P1** | 统一色彩 token 系统（primary 替代硬编码 indigo） | 视觉 | 中 | 主题一致性 |
| **P1** | 消息列表虚拟滚动 | 性能 | 中 | 长对话性能 |
| **P1** | ARIA 属性补全 | 可访问性 | 中 | 可访问性合规 |
| **P1** | 统一 focus-visible 样式 | 可访问性 | 小 | 键盘体验 |
| **P2** | 字体升级（标题字体辨识度） | 视觉 | 小 | 品牌视觉 |
| **P2** | 动效规范统一 | 交互 | 中 | 交互流畅度 |
| **P2** | Tab 切换过渡动画 | 交互 | 小 | 体验流畅度 |
| **P2** | 暗色模式背景层次优化 | 视觉 | 小 | 视觉层次 |
| **P2** | 阴影系统统一 | 视觉 | 小 | 视觉一致性 |
| **P3** | Composer 子组件拆分 | 重构 | 中 | 代码可维护性 |
| **P3** | 设置页导航改进 | 布局 | 小 | 易用性 |
| **P3** | 骨架屏加载态 | 交互 | 中 | 体验感知 |
| **P3** | 空状态页面布局优化 | 布局 | 小 | 首次使用体验 |
| **P3** | Artifact 面板响应式改进 | 布局 | 中 | 多窗口场景 |
| **P3** | Session 列表虚拟化 | 性能 | 中 | 大量会话场景 |

---

## 九、建议实施顺序

### Phase 1：基础整理（1-2 天）
1. 提取 `cn()` 到 `utils/cn.ts`
2. 提取 `useClickOutside` hook
3. 提取 `PROVIDER_DISPLAY` 到 `utils/providers.ts`
4. 修复 `user-select: none` 全局禁用问题
5. 统一 `focus-visible` 样式

### Phase 2：组件库建设（3-5 天）
1. 创建 `Dropdown` 组件（含键盘导航、外部点击关闭、ARIA）
2. 创建 `Tooltip` 组件
3. 创建 `Button` 组件（变体系统）
4. 创建 `Modal` 组件（含 focus trap、ARIA）
5. 创建 `Skeleton` 组件
6. 用新组件替换现有硬编码实现

### Phase 3：色彩与视觉系统（2-3 天）
1. 定义 `primary-*` Tailwind 色彩 token
2. 全局替换 `indigo-*` 为 `primary-*`
3. 统一阴影 token
4. 建立语义色彩映射表
5. 暗色模式背景层次优化
6. 引入标题字体

### Phase 4：交互体验提升（3-5 天）
1. 动效规范文档与实现
2. Tab 切换过渡动画
3. Artifact 面板 exit 动画
4. 表单验证反馈
5. 骨架屏加载态
6. Composer 子组件拆分

### Phase 5：性能与可访问性（2-3 天）
1. 消息列表虚拟滚动
2. ARIA 属性全面补全
3. Focus trap 实现
4. Session 列表优化

---

## 十、设计 Token 参考建议

### 色彩 Token

```
--color-primary-{50-950}     -- 主色调（可切换）
--color-success-{50-950}    -- 成功/完成（emerald）
--color-warning-{50-950}    -- 警告/等待（amber）
--color-danger-{50-950}     -- 错误/危险（red）
--color-accent-{50-950}     -- 功能强调（violet，用于 skills 等）
--color-neutral-{50-950}    -- 中性色（当前 zinc/slate）
```

### 语义阴影

```
--shadow-sm:  0 1px 2px rgba(0,0,0,0.04)
--shadow-md:  0 4px 16px rgba(0,0,0,0.06)
--shadow-lg:  0 8px 32px rgba(0,0,0,0.08)
--shadow-xl:  0 25px 60px -15px rgba(0,0,0,0.15)
```

### 动效规范

```
--duration-fast:   150ms    -- 按钮 hover、tooltip 显示
--duration-normal: 200ms    -- 颜色切换、小型状态变化
--duration-slow:   300ms    -- 面板展开/折叠、区域切换
--duration-page:   500ms    -- 页面过渡、入场动画
--ease-default:    cubic-bezier(0.4, 0, 0.2, 1)
--ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1)
```

### 字体

```
--font-display:  'Sora', 'Plus Jakarta Sans', sans-serif
--font-body:     'Inter', system-ui, sans-serif
--font-mono:     'JetBrains Mono', 'Fira Code', monospace
```
