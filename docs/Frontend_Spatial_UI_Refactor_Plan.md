# Geni 前端空间 UI (Spatial UI) 重构计划

> **目标设计语言**：Apple 细腻空间风 (Refined Spatial / Glassmorphism)
> **创建日期**：2026-04-13
> **当前状态**：待执行

## 设计理念与核心视觉原则

为告别平庸的"Tailwind 默认仪表盘"风格，本项目的前端将全面转向具备空间感、生命力的细腻 UI 设计。

*   **通透感 (Glassmorphism & Vibrancy)**：放弃块状实色背景，大规模运用 `backdrop-blur`（毛玻璃效果），让顶层元素能隐约透出底层背景色彩。
*   **边缘高光 (Edge Lighting) 与微体积感**：抛弃生硬的实心边框 (solid border)。通过纯白低透明度内发光 (`ring-1 ring-white/10` 或 `box-shadow: inset`) 模拟环境光渲染出的物理边缘边缘亮度。
*   **空间软阴影 (Spatial Soft Shadows)**：阴影颜色极淡、扩散范围宽广，用于展现元素之间的 Z 轴高度差，而非死板死黑的色块。
*   **流体阻尼动效 (Spring Physics)**：消除线性的动画过程。按压时加入微缩放 (`scale-95` 或 `98`)，面板滑出采用带有阻尼感的贝塞尔曲线 (`cubic-bezier`)，表现物理惯性。
*   **极致呼吸感 (Extreme Breathing Space)**：增加各组件面板间的 Margin（脱离全屏贴边），放大 Padding，保持 SF Pro / System-ui 的极简排版规则。

---

## 约束与前置决策

### Light Mode / Dark Mode 双轨策略

所有 Spatial UI 视觉效果必须为 Light 和 Dark 两套主题分别设计 Token 值：

| 效果 | Dark Mode | Light Mode |
|:-----|:----------|:-----------|
| 毛玻璃背景 | `bg-black/40 backdrop-blur-xl` | `bg-white/60 backdrop-blur-xl` |
| 边缘高光 | `ring-1 ring-white/10` | `ring-1 ring-black/5` |
| 软阴影颜色 | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.08)` |
| 内发光 | `inset 0 1px 0 rgba(255,255,255,0.05)` | `inset 0 1px 0 rgba(255,255,255,0.8)` |

> 浅色模式下 `ring-white/10` 不可见，`backdrop-blur` 在白底上也几乎无效果。每个 Token 必须在 `:root` 和 `:root.dark` 下分别定义。

### 性能预算与降级策略

`backdrop-blur` 是 GPU 密集操作，Electron 环境下多层叠加会导致帧率下降。

**硬性约束：**
- 同屏可见的 `backdrop-blur` 元素 **≤ 2 层**（如 Header + Dropdown，不允许 Sidebar + Main + Panel 同时 blur）
- 所有动画必须尊重 `prefers-reduced-motion: reduce`，降级为 `transition: none`
- Dropdown / Tooltip 弹出层使用 **实色半透明背景** 替代 blur（性价比更高）

**降级 CSS 模板：**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 组件库选型

基础交互组件（Dropdown、Tooltip、Dialog）的 Focus Trap 与键盘导航实现复杂度高，不自研。

**决策：使用 `@radix-ui/react` 作为 Headless UI 基础层**
- 仅引入 Primitives（无样式），在其上叠加 Spatial UI 样式
- 涉及组件：`DropdownMenu`、`Tooltip`、`Dialog`、`Popover`
- 自建的仅限纯展示组件：`Button`、`Badge`、`Switch`（当前已有）

### Tailwind v4 注意事项

当前项目使用 Tailwind v4（`@import "tailwindcss"` + `@plugin` 语法）：
- 配置通过 CSS `@theme` 完成，不再使用 `tailwind.config.js`
- 新 Token 通过 `@theme { --shadow-spatial-*: ...; }` 注入
- 确认 `animate-in` / `slide-in-from-*` 系列工具类的来源（若依赖 `tailwindcss-animate` 插件，需确认其 v4 兼容性）

### 重构影响范围

以下文件需要迁移至新 Token 系统（按优先级排序）：

**核心布局（Phase 2 必改）：**
- `src/renderer/layouts/ChatLayout.tsx` (290 行)
- `src/renderer/layouts/sidebar/SessionSidebar.tsx` (449 行)
- `src/renderer/components/ArtifactPanel.tsx`

**核心交互（Phase 3 必改）：**
- `src/renderer/modules/chat/Composer.tsx` (744 行)
- `src/renderer/modules/chat/MessageList.tsx`
- `src/renderer/components/ThoughtTrace.tsx`
- `src/renderer/components/StatusIndicator.tsx`

**共享工具（Phase 1 必改）：**
- `cn()` 重复定义：`ChatLayout.tsx:L16`、`Composer.tsx:L15`（至少 2 处）→ 统一至 `utils/cn.ts`

**非核心页面（暂不纳入 Scope）：**
- `src/renderer/pages/settings/*` — 维持现有风格，后续视情况迁移

---

## 阶段实施路线图

### Phase 1：地基搭建 (Foundation & Tokens) ⏳ [未开始]
*构建底层样式池与高频交互基础组件。*

- [ ] **重构 `src/renderer/index.css` 及 Tailwind `@theme`**
  - [ ] 移除 `body` 上的 `user-select: none`，并在需要的地方按需添加局部禁用选中的类。
  - [ ] 定义 Spatial UI 色板变量（去饱和的柔和背景色），**Light / Dark 双轨**。
  - [ ] 定义软阴影 Token（`--shadow-spatial-sm` 到 `xl`），**Light / Dark 双轨**。
  - [ ] 定义过渡动画缓动曲线 (`--ease-spring`, `--ease-fluid`)。
  - [ ] 定义动效 duration 分级（`--duration-fast: 150ms`, `--duration-normal: 250ms`, `--duration-slow: 400ms`）。
  - [ ] 添加 `prefers-reduced-motion` 全局降级规则。
- [ ] **提取/创建基础 UI 模块 (`src/renderer/components/ui/`)**
  - [ ] 提取重复的 `cn()` 工具类至 `src/renderer/utils/cn.ts`。
  - [ ] 全新封装 `Button` 组件：集成 Hover 提亮反馈与 Active 缩放阻尼点击效果。Variants: `primary` / `secondary` / `ghost` / `danger`。
  - [ ] 基于 `@radix-ui/react` 封装 `Dropdown` / `Tooltip` / `Popover` 组件，彻底废弃散落在业务代码中的绝对定位硬编码实现。
  - [ ] 将现有 `Switch.tsx` 纳入 `ui/` 统一管理。

### Phase 2：宏观布局重塑 (Macro Layout Layering) ⏳ [未开始]
*打破页面原有的僵硬板块，让侧边栏、对话框、代码视图等分层解耦。*

- [ ] **重构 `ChatLayout.tsx` 空间感**
  - [ ] 使用 Flex 栅格布局完全代替 ArtifactPanel 目前的 `absolute top right` 与 `margin` 挤压逻辑。
  - [ ] 为 Artifact 面板和主对话区域添加玻璃材质（Backdrop-blur），并在它们外围增加空间间距（Margin），使其呈"卡片悬浮"而非"贴边停靠"状态。
  - [ ] **Artifact Panel Flex 化改造细节：**
    - 当前逻辑：`main` 通过 `marginRight: panelWidth + 12` 为 `absolute` 定位的 aside 腾出空间（ChatLayout.tsx:L177）。
    - 目标布局：`main(flex:1)` + `aside(flex:0 0 ${panelWidth}px)`，面板通过 `flex-basis` 控制宽度。
    - 智能侧边栏折叠逻辑需改写：不能再用 `window.innerWidth - panelWidth - sidebarWidth` 计算（L128-138），改用 `ResizeObserver` 监听 main 区域实际宽度。
    - Resize Handle 拖拽逻辑适配：操作的目标从 `panelWidth state` 变为修改 `flex-basis`。
    - 面板打开/关闭动画：从 `translate + absolute` 改为 `flex-basis: 0 → panelWidth` + `overflow: hidden` + `opacity` 过渡。
- [ ] **翻新 `SessionSidebar.tsx`**
  - [ ] 添加边缘高光 (`inset shadow` / `ring`)，去掉生硬的 `border-r`。
  - [ ] 侧边栏折叠/展开动画曲线调整为阻尼曲线，提升顺滑度。

### Phase 3：微观与细节体验 (Micro-interactions & UX) ⏳ [未开始]
*打磨局部细节体验，让整个应用在微小互动中展现生命力。*

- [ ] **Welcome 欢迎页唤醒感体验**
  - [ ] 修改 Empty State 的干瘪堆积。背后引入环境微亮色渐变背景（Ambient Mesh Gradient Glow）。
  - [ ] 重写 StaffPicker 的数字员工选择卡片，加入 Hover 状态下卡片微上浮效果与细腻边框光泽。
- [ ] **重构 `Composer.tsx` (提问大区)**
  - [ ] 拆分 744 行的臃肿实现，目标模块：
    - `modules/chat/components/ModelSelector.tsx` (~190 行)
    - `modules/chat/components/SkillSelector.tsx` (~170 行)
    - `modules/chat/components/WorkspaceSelector.tsx` (~140 行)
    - `modules/chat/components/AccessIndicator.tsx` (~36 行)
    - `modules/chat/components/ComposerToolbar.tsx` (内部工具栏)
  - [ ] 放弃生硬且多重重叠的阴影和边框，使用底层通透度来拉开输入框和底色之间的距离。
- [ ] **全面修补无障碍访问 (A11y)**
  - [ ] 统一全局的 `:focus-visible` UI反馈，确保键盘（Tab）导航时拥有苹果级的柔和焦点选框（Primary Color Ring）。
  - [ ] 为现有仅有 Icon 的按钮补充 `aria-label`。

---

## 动效规范

### 缓动曲线

```css
--ease-spring: cubic-bezier(0.32, 0.72, 0, 1);   /* 面板滑出、侧边栏折叠 */
--ease-fluid: cubic-bezier(0.25, 1, 0.5, 1);      /* 通用过渡 */
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* 微弹跳（谨慎使用） */
```

### Duration 分级

| 级别 | 时长 | 适用场景 |
|:-----|:-----|:---------|
| `--duration-fast` | 150ms | Hover 状态变化、颜色/透明度过渡 |
| `--duration-normal` | 250ms | 面板展开/折叠、Dropdown 弹出 |
| `--duration-slow` | 400ms | 页面级转场、Welcome 入场动画 |

### 交互细节

| 交互 | 效果 | 参数 |
|:-----|:-----|:-----|
| Button Active | 缩放下压 | `scale(0.97)`, duration: `100ms`, ease: `ease-out` |
| Button Hover | 背景提亮 | duration: `150ms` |
| Card Hover | 微上浮 | `translateY(-2px)`, duration: `200ms`, ease: `--ease-fluid` |
| Panel 打开 | 滑入 + 淡入 | duration: `300ms`, ease: `--ease-spring` |
| Panel 关闭 | 滑出 + 淡出 | duration: `200ms`, ease: `ease-in` (退出比进入快) |

---

## 空间阴影参考

```css
/* Light Mode */
--shadow-spatial-sm: 0 1px 3px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.03);
--shadow-spatial-md: 0 4px 16px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.03);
--shadow-spatial-lg: 0 24px 48px -12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.03);

/* Dark Mode */
--shadow-spatial-sm: 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
--shadow-spatial-md: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
--shadow-spatial-lg: 0 24px 48px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
```

---

## 临时笔记与备忘
*(实施过程中的设计决策或需参考的配置在此记录)*

- **TODO**: 补充至少一张设计参考截图或 Figma 草图，减少实施偏差
- **TODO**: 如有条件，引入视觉回归测试（如 Percy / Chromatic）验证跨分辨率表现
- **TODO**: 测试 Electron `zoomFactor` 变化时毛玻璃和阴影的表现
