# Plan: 精简 Session 中工具调用结果的持久化内容

## Context

当前每次工具调用（如 read 大文件）的完整输出都会作为 `role: 'tool'` 消息持久化到 session 中。后续对话加载历史时，这些内容会全部发送给 LLM，浪费大量 token。例如读取一个 450 行的文件，截断后仍有 ~32K 字符被反复发送。

**关键发现**：`steps[].observation`（UI 用）和 `role: 'tool'` 消息（LLM 用）是独立的两条数据路径。`steps[].observation` 不发送给 LLM，只有 `role: 'tool'` 消息才发。因此只需精简 `role: 'tool'` 即可节省 token，保留 `steps[].observation` 以维持 UI 历史回看体验。

## 工具分类策略

| 工具类型 | `role: 'tool'` content (LLM) | `steps[].observation` (UI) |
|----------|------------------------------|----------------------------|
| 信息型 (read, grep, glob, web_fetch, load_skill) | 精简为摘要 | 保留完整内容 |
| 瞬时型 (bash) | 精简为摘要 | 保留完整内容 |
| 操作型 (write, edit, 其他) | 保持原样 | 保持原样 |

## 修改方案

### Step 1: 在 ContextManager 中添加摘要生成方法

**文件**: `src/main/services/agent/ContextManager.ts`（在 `truncateToolOutput` 方法后面，~383 行）

添加：
- `INFORMATION_TOOLS` 集合（read, grep, glob, web_fetch, load_skill）
- `EPHEMERAL_TOOLS` 集合（bash）
- `shouldSummarizeToolOutput(toolName)` 静态方法
- `summarizeToolOutput(toolName, toolInput, observation)` 静态方法

摘要格式示例：
```
[read] src/main/foo.ts (450 lines)
[bash] npm run build (exit 1, 45 lines)
[grep] "TODO" in src/ → 15 matches
[glob] src/**/*.ts → 23 files
[web_fetch] https://example.com (12KB)
[load_skill] brainstorming loaded
```

其他操作型工具（write, edit 等）：保持原样不变。

### Step 2: 修改 AgentRuntime 持久化逻辑

**文件**: `src/main/services/agent/runtime/AgentRuntime.ts`（~170-194 行）

- 添加 `import { ContextManager }`
- 将 `cleanSteps` 声明提升到外层作用域
- 在持久化循环中，对 `role: 'tool'` 消息调用 `summarizeToolOutput()` 替换 content
- `cleanSteps[].observation` 保持不变（UI 历史回看用）
- 通过 `cleanSteps` 的顺序与 `role: 'tool'` 消息的顺序一一对应来匹配 tool name 和 input

### Step 3: 添加测试

**文件**: `tests/main/services/agent/ContextManager.summarize.test.ts`（新建）

覆盖：read、bash、grep、glob、web_fetch、load_skill 的摘要生成，以及 shouldSummarizeToolOutput 的分类判断。

## 不需要修改的文件

- `ReActExecutor.ts` — 执行流程不变，内存中的 `messages[]` 仍保留完整内容
- `ThoughtTrace.tsx` — 读取 `steps[].observation` 显示 artifact，不受影响
- `ArtifactPanel.tsx` — 纯展示组件，不受影响
- `chat.ts` 类型 — 不需要改类型定义

## 验证方式

1. `npm run build` — TypeScript 编译通过
2. `npm run test` — 所有测试通过（包括新增的 summarize 测试）
3. 手动验证：运行 `npm run dev`，让 agent 执行 read/bash 等工具，检查 `~/.geni/sessions/` 下 session JSON 中 `role: 'tool'` 消息是否为摘要格式，`steps[].observation` 是否保留完整内容
