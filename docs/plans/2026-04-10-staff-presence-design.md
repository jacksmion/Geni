# 数字员工存在感重构设计

## 目标

将数字员工从后台配置项转变为在主界面随处可见、触手可及的合作者。

## 范围

分期交付，本期实现 3 个维度：

| 维度 | 名称 | 状态 |
|------|------|------|
| 1 | 输入框身份注入 | 本期实现 |
| 2 | 气泡身份标识 | 本期实现 |
| 3 | 智能引荐 | 暂不实现 |
| 4 | 侧边栏透出 | 本期实现 |

## 数据层

### sessionMetas 扩展

当前 `sessionMetas` 类型：`{ id, title, updatedAt }[]`

扩展为：`{ id, title, updatedAt, staffId? }[]`

这样侧边栏和气泡不需要加载完整 session 数据就能显示员工信息。

### 头像方案

`StaffProfile.avatar` 字段同时支持两种格式：
- **Lucide 图标名**（如 `"Bot"`, `"GraduationCap"`, `"Cpu"`）→ 渲染为矢量图标，跨平台一致
- **Emoji 字符串**（如 `"🧑‍💻"`, `"🎨"`）→ 直接渲染文字/emoji

判断逻辑：如果值匹配预设图标映射表（`STAFF_ICONS`）中的 key，渲染 Lucide 图标；否则当 emoji 渲染。
无 avatar 时 fallback 到名字首字母，再 fallback 到 Bot 图标。

共享渲染组件：`src/renderer/components/StaffAvatar.tsx`

## 维度 1：输入框身份注入

### 改动文件
- `src/renderer/modules/chat/Composer.tsx` — 新增 StaffAvatarButton 组件
- `src/renderer/layouts/ChatLayout.tsx` — 移除 header 中的 StaffSelector

### 交互设计

1. textarea 内部左侧常驻当前员工头像（emoji 或首字母）
2. 点击头像在输入框上方弹出员工选择浮动面板
3. 面板风格复用 ModelSelector 的浮动面板样式
4. 选择后调用 `assignStaff(sessionId, staffId)`
5. **移除** ChatLayout header 中的 StaffSelector（输入框为唯一选择入口）

### 数据流

```
Composer → useChatStore.activeSessionId
         → sessions[id].staffId
         → useStaffStore.profiles → avatar/name
```

## 维度 2：气泡身份标识

### 改动文件
- `src/renderer/modules/chat/MessageList.tsx` — MessageItem 组件

### 交互设计

1. AI 消息头像从 Bot 图标替换为员工 emoji（有 staffId 时）
2. 无 staffId 时保持 Bot 图标不变
3. 底部 meta 信息从 `"Geni · 08:30"` 改为 `"员工名 · 08:30"`（有 staff 时）

### 数据流

```
MessageList → useChatStore.sessions[activeSessionId].staffId
MessageItem ← staffId prop
           → useStaffStore.profiles → avatar/name
```

## 维度 4：侧边栏透出

### 改动文件
- `src/renderer/layouts/sidebar/SessionSidebar.tsx`
- `src/renderer/store/useChatStore.ts` — sessionMetas 类型扩展

### 交互设计

1. session 列表每项的 MessageSquare 图标替换为员工 emoji（有 staffId 时）
2. 无 staffId 时保持 MessageSquare 图标不变
3. 头像尺寸和位置与现有图标一致

### 数据流

```
SessionSidebar → useChatStore.sessionMetas → staffId
              → useStaffStore.profiles → avatar
```

## 涉及文件汇总

| 文件 | 改动类型 |
|------|----------|
| `src/renderer/store/useChatStore.ts` | sessionMetas 类型扩展，loadHistory/switchSession 中包含 staffId |
| `src/renderer/modules/chat/Composer.tsx` | 新增 StaffAvatarButton，textarea 内集成头像 |
| `src/renderer/modules/chat/MessageList.tsx` | MessageItem 头像替换，meta 文字变更 |
| `src/renderer/layouts/ChatLayout.tsx` | 移除 StaffSelector 组件及 header 中的引用 |
| `src/renderer/layouts/sidebar/SessionSidebar.tsx` | session 图标替换为员工 emoji |
