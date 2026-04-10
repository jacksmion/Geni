# SVG 代码块动态渲染设计

## 目标

在聊天消息气泡中，AI 输出的 ` ```svg ` 代码块自动渲染为图形，支持代码/预览切换、缩放平移、下载。

## 场景

AI 回复中包含 SVG 源码：
````markdown
```svg
<svg viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="#4F46E5"/>
</svg>
```
````

渲染为交互式图形，附带工具栏。

## 架构

复用 Mermaid 的渲染模式。在 MarkdownCodeBlock 中检测 `language === 'svg'`，路由到新组件 `SvgBlock`。

```
ReactMarkdown → code block (lang=svg) → SvgBlock
                                          ├─ DOMPurify 清洗
                                          ├─ 渲染: dangerouslySetInnerHTML
                                          └─ 工具栏: 切换/缩放/下载
```

## 安全

- 使用 DOMPurify 清洗 SVG 源码
- 禁止 `<script>` 标签和所有 `on*` 事件属性
- 禁止 `<foreignObject>` 中嵌入 HTML
- 清洗后再通过 `dangerouslySetInnerHTML` 渲染

## 组件设计：SvgBlock

参照 MermaidBlock 的交互模式，新建 `src/renderer/components/SvgBlock.tsx`。

### 功能

1. **预览模式**（默认）：DOMPurify 清洗后渲染 SVG
2. **代码模式**：显示源码，语法高亮
3. **工具栏**：
   - 代码/预览切换按钮
   - 下载为 .svg 文件
   - 全屏预览（可选）
4. **缩放/平移**：鼠标滚轮缩放 + 拖拽平移（CSS transform）

### Props

```typescript
interface SvgBlockProps {
    code: string
}
```

### 渲染流程

1. 接收 `code`（SVG 源码字符串）
2. `DOMPurify.sanitize(code, { FORBID_TAGS: ['script', 'foreignObject'], FORBID_ATTR: ['onerror', 'onload', 'onclick', ...] })`
3. 预览模式：`<div dangerouslySetInnerHTML={{ __html: sanitized }} />`
4. 代码模式：用 react-syntax-highlighter 显示源码

### 下载

将原始 SVG 源码（非清洗后的）作为 .svg 文件下载，通过 Blob URL 实现。

## 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/renderer/components/SvgBlock.tsx` | 新建 | SVG 渲染组件 |
| `src/renderer/modules/chat/MessageList.tsx` | 修改 | MarkdownCodeBlock 加 `svg` 语言分支 |
| `package.json` | 修改 | 添加 `dompurify` + `@types/dompurify` |

## 依赖

- `dompurify` — SVG/HTML 清洗库
- `@types/dompurify` — TypeScript 类型定义
