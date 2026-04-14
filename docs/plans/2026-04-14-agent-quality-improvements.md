# Agent 核心能力提升 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提升单 agent 的工具调用准确率、长上下文管理质量、记忆系统实用性

**Architecture:** 三个维度独立改进：(1) 工具描述增强与缺陷修复，让 LLM 更准确地使用工具；(2) 上下文截断策略统一与预算精度提升；(3) 记忆系统从全量注入改为按需检索

**Tech Stack:** TypeScript, Vitest, Electron/Node.js

---

## 阶段一：P0 缺陷修复

### Task 1: 未知工具返回错误结果

**问题：** `ReActExecutor.ts:421` 中 `if (!tool) continue` 导致未知工具的 tool_call 没有对应的 tool_result，违反 OpenAI API 协议

**Files:**
- Modify: `src/main/services/agent/executor/ReActExecutor.ts:419-422`
- Test: `tests/main/services/agent/ReActExecutor.test.ts`

**Step 1: 写失败测试**

在 `ReActExecutor.test.ts` 中添加测试用例，模拟 LLM 返回一个不存在的工具调用，验证执行结果包含 `isError: true` 且 result 包含工具名。

```typescript
it('should return error result for unknown tool instead of skipping', async () => {
    // 模拟 LLM 返回 tool_call，工具名不在 registry 中
    const mockToolCall = {
        id: 'call_unknown',
        type: 'function',
        function: { name: 'nonexistent_tool', arguments: '{}' }
    };
    // ... 执行并验证 messages 中有对应的 role:'tool' 消息
    // 且 content 包含 "not found"
});
```

**Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/services/agent/ReActExecutor.test.ts`
Expected: FAIL

**Step 3: 修改实现**

在 `ReActExecutor.ts` 约第 421 行，将：

```typescript
if (!tool) continue;
```

改为：

```typescript
if (!tool) {
    const errorResult = `Tool "${fnName}" is not available. Check available tools and try again.`;
    results.push({
        toolCallId: tc.id,
        toolName: fnName,
        result: errorResult,
        isError: true,
    });
    steps.push({
        tool: fnName,
        toolInput: tc.function.arguments,
        observation: errorResult,
        isComplete: true,
        isError: true,
        duration: 0,
    });
    continue;
}
```

**Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/services/agent/ReActExecutor.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/agent/executor/ReActExecutor.ts tests/main/services/agent/ReActExecutor.test.ts
git commit -m "fix: return error result for unknown tool calls instead of silently skipping"
```

---

### ~~Task 2: write/edit 补齐 allowedPaths~~ (已取消)

> **安全审查结论：** write/edit 不带 allowedPaths 是**正确的安全设计**，不是 bug。
> allowedPaths 包含技能目录（builtin/global/project skills），而技能文件会被注入 system prompt。
> 如果 write/edit 能修改技能文件，LLM 就可以改写自己的行为指令，产生 prompt 注入风险。
> 只读工具（read/glob/grep/list）带 allowedPaths 是安全的，写入工具限制在 workspacePath 是必要的。

---

### Task 3: 移除敏感日志

**问题：** `ToolRegistry.ts:75` 中 `console.log` 打印所有工具参数，生产环境泄露敏感信息

**Files:**
- Modify: `src/main/services/tools/ToolRegistry.ts:75`

**Step 1: 修改实现**

将：

```typescript
console.log(`[ToolRegistry] Executing ${name} with args:`, JSON.stringify(args));
```

直接删除此行。Electron 主进程不使用 `NODE_ENV` 区分环境（项目中无任何 `NODE_ENV` 引用），开发时看 DevTools 面板比这行日志更有用。

**Step 2: 运行相关测试**

Run: `npx vitest run tests/main/services/tools/`
Expected: PASS

**Step 3: 提交**

```bash
git add src/main/services/tools/ToolRegistry.ts
git commit -m "fix: remove sensitive tool argument logging in production"
```

---

## 阶段二：P1 工具描述增强

### Task 4: 增强 bash 工具描述

**问题：** bash 描述过于简略，LLM 不知道输出截断、超时、CWD 持久化等关键行为

**Files:**
- Modify: `src/main/services/tools/core/BashTool.ts:139-164`

**Step 1: 修改工具描述**

在 `getDefinition()` 中，将 description 改为：

```typescript
description:
    "Execute a shell command. " +
    "Working directory persists across calls (use cd to change). " +
    "Output is truncated to fit context. For long output, pipe to head/tail or redirect to a file then read it. " +
    "Default timeout is 60 seconds (set timeout param for longer commands). " +
    "Do not use interactive commands (no stdin support). " +
    "Prefer dedicated tools (read/edit/write/glob/grep) over shell commands for file operations.",
```

**Step 2: 运行构建确认无报错**

Run: `npm run build`
Expected: PASS

**Step 3: 提交**

```bash
git add src/main/services/tools/core/BashTool.ts
git commit -m "improve: enhance bash tool description for better LLM guidance"
```

---

### Task 5: 增强 read 工具描述

**Files:**
- Modify: `src/main/services/tools/core/ReadFileTool.ts:47-62`

**Step 1: 修改工具描述**

```typescript
description:
    "Read the contents of a file. " +
    "Default reads the first 2000 lines. Use start_line and end_line for specific ranges. " +
    "Lines longer than 1000 characters are truncated. " +
    "Files over 10MB are rejected. " +
    "Binary files are rejected. " +
    "When a file is not found, similar filenames in the same directory are suggested.",
```

**Step 2: 运行构建确认无报错**

Run: `npm run build`
Expected: PASS

**Step 3: 提交**

```bash
git add src/main/services/tools/core/ReadFileTool.ts
git commit -m "improve: enhance read tool description for better LLM guidance"
```

---

### Task 6: 增强 edit 工具描述

**Files:**
- Modify: `src/main/services/tools/core/FileEditTool.ts:29-56`

**Step 1: 修改工具描述**

```typescript
description:
    "Edit a file by replacing a target string with a new string. " +
    "Supports fuzzy matching: provide 3-5 lines of surrounding context for reliable matching. " +
    "The target does NOT need to be an exact copy from the file. " +
    "Use replaceAll to replace all occurrences. " +
    "Prefer this tool over write for modifying existing files.",
```

**Step 2: 运行构建确认无报错**

Run: `npm run build`
Expected: PASS

**Step 3: 提交**

```bash
git add src/main/services/tools/core/FileEditTool.ts
git commit -m "improve: enhance edit tool description to reflect fuzzy matching support"
```

---

### Task 7: 增强 grep/glob/write 工具描述

**Files:**
- Modify: `src/main/services/tools/core/GrepTool.ts:50-81`
- Modify: `src/main/services/tools/core/GlobTool.ts:29-57`
- Modify: `src/main/services/tools/core/WriteFileTool.ts:29-46`

**Step 1: 修改 grep 描述**

```typescript
description:
    "Search for string patterns in files using regex or literal strings. " +
    "By default searches common source files (js,ts,py,go,java,etc). " +
    "Use include param to specify extensions (e.g. '*.md,*.txt'). " +
    "Results are limited to 1000 matches total. " +
    "Set isRegex=true when searching with regex patterns. " +
    "If regex fails, set isRegex=false for literal string search.",
```

**Step 2: 修改 glob 描述**

```typescript
description:
    "Find files matching a glob pattern. " +
    "Returns up to 100 results sorted by modification time. " +
    "Common patterns: **/*.ts, src/**/*.js, *.json. " +
    "node_modules and .git are excluded by default. " +
    "Dotfiles are included by default.",
```

**Step 3: 修改 write 描述**

```typescript
description:
    "Write content to a file. Overwrites existing files. " +
    "For large files (>100 lines), use chunked writing: split into multiple calls with chunk_index (0-based) and set is_last_chunk=true on the final call. " +
    "Has idempotency check: skips write if content is identical. " +
    "Use append=true to append instead of overwrite.",
```

**Step 4: 运行构建确认无报错**

Run: `npm run build`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/tools/core/GrepTool.ts src/main/services/tools/core/GlobTool.ts src/main/services/tools/core/WriteFileTool.ts
git commit -m "improve: enhance grep, glob, write tool descriptions for better LLM guidance"
```

---

### Task 8: 优化截断策略

**问题：** 工具内部截断（如 BashTool 50KB）和 ContextManager 截断（2KB）双层截断，两者差距过大，LLM 看到的结果被二次截断且行为不可预测

**Files:**
- Modify: `src/main/services/agent/ContextManager.ts:364-383` — 调整 ContextManager 截断限制

**设计决策：**
- 保留工具内部截断（50KB）作为硬性安全上限，防止恶意命令撑爆内存（如 `cat /dev/urandom`）
- 不放开工具内部限制到 100KB
- 只调整 ContextManager 的二级截断，缩小与工具内部的差距

**Step 1: 调整 ContextManager LIMITS**

在 `ContextManager.ts` 的 LIMITS 中，将差距过大的限制适当上调：

```typescript
// 当前值 → 调整后值
private static readonly LIMITS: Record<string, number> = {
    'load_skill': 32000,   // 保持不变
    'read': 32000,         // 保持不变（文件内容需要较大空间）
    'web_fetch': 20000,    // 100000 → 20000（网页抓取需要保留足够内容，但不能无限）
};
private static readonly DEFAULT_LIMIT = 2000;  // 保持不变（bash 等走这个默认值）
```

> **注意：** web_fetch 当前 100KB 确实过大（浪费 token），但直接砍到 4KB 会导致网页抓取功能不可用。20KB 是折中值，约 5000 token，足以保留网页核心内容。

**Step 2: 运行相关测试**

Run: `npx vitest run tests/main/services/agent/ContextManager.test.ts`
Expected: 可能需要更新测试中的截断预期值

**Step 3: 提交**

```bash
git add src/main/services/agent/ContextManager.ts tests/main/services/agent/ContextManager.test.ts
git commit -m "refactor: optimize tool output truncation limits to balance context efficiency and usability"
```

---

### Task 9: 增强卡住检测

**问题：** 只检测"相同工具+相同参数"的完全重复，LLM 用不同参数反复尝试同一失败操作不会被捕获

**Files:**
- Modify: `src/main/services/agent/executor/ReActExecutor.ts:98-118`

**Step 1: 修改卡住检测逻辑**

保持窗口 `STUCK_DETECTION_WINDOW = 3`（避免多浪费一轮 LLM 调用），增加两种新的卡住模式检测：

```typescript
private isStuck(steps: AgentStep[]): boolean {
    if (steps.length < STUCK_DETECTION_WINDOW) return false;

    const recent = steps.slice(-STUCK_DETECTION_WINDOW);

    // 原有检测1: 连续相同工具+相同参数（完全重复）
    const toolNames = recent.map(s => s.tool);
    if (toolNames.length > 0 && new Set(toolNames).size === 1) {
        const inputs = recent.map(s => s.toolInput || '');
        if (new Set(inputs).size === 1) {
            return true;
        }
    }

    // 新增检测1: 连续N次同一工具全部失败（不同参数也触发）
    if (new Set(toolNames).size === 1 && recent.every(s => s.isError)) {
        return true;
    }

    // 原有检测2: 所有最近步骤都是错误
    if (recent.every(s => s.isError)) {
        return true;
    }

    // 新增检测2: 两个工具交替循环（如 edit → grep → edit → grep）
    if (steps.length >= 6) {
        const last6 = steps.slice(-6);
        const tools6 = last6.map(s => s.tool);
        const uniqueTools = new Set(tools6);
        if (uniqueTools.size === 2) {
            // 检查是否交替出现: A B A B A B
            const [a, b] = uniqueTools;
            const isAlternating = tools6.every((t, i) =>
                (i % 2 === 0 && t === a) || (i % 2 === 1 && t === b)
            ) || tools6.every((t, i) =>
                (i % 2 === 0 && t === b) || (i % 2 === 1 && t === a)
            );
            if (isAlternating) return true;
        }
    }

    return false;
}
```

**Step 2: 运行相关测试**

Run: `npx vitest run tests/main/services/agent/ReActExecutor.test.ts`
Expected: PASS（可能需要更新测试覆盖新的检测逻辑）

**Step 3: 提交**

```bash
git add src/main/services/agent/executor/ReActExecutor.ts tests/main/services/agent/ReActExecutor.test.ts
git commit -m "improve: enhance stuck detection to catch repeated tool failures with different args"
```

---

## 阶段三：P2 上下文与记忆改进

### Task 10: 优化上下文预算判断

**问题：** `optimizeContext` 在第一轮没有真实 token 时跳过判断，后续轮次虽然用了真实 token，但 `ContextManager.prune()` 内部用估算 token 做裁剪决策，两者度量不一致

**Files:**
- Modify: `src/main/services/agent/executor/ReActExecutor.ts:234-268`

**设计决策：**
- 不修改 `ContextManager.setMaxTokens()` 的值（避免估算/真实 token 度量不一致导致裁剪误判）
- 只在 `optimizeContext` 的摘要触发判断中，用真实 token 替代估算 token 做更准确的决策
- `ContextManager.prune()` 仍然用估算 token 做快速裁剪（这是可接受的保守策略）

**Step 1: 优化 optimizeContext 的判断逻辑**

在 `ReActExecutor.ts` 的 `optimizeContext()` 方法中：

```typescript
// 当前代码（line 251-254）:
const tokensAfterPrune = lastPromptTokens > 0 ? lastPromptTokens : 0;
const stillOverBudget = tokensAfterPrune >= contextWindow * 0.8;

// 改进: 有真实 token 时直接用真实值判断，无需依赖 prune 后的估算
// 无真实 token 时（第一轮），走估算路径
if (lastPromptTokens <= 0) {
    // 第一轮：没有真实 token，用 prune 的估算结果即可
    return optimized;
}
// 有真实 token 时：prune 后重新估算，如果仍超 80% 才摘要
const estimatedTokens = TokenCounter.countMessages(optimized);
const stillOverBudget = lastPromptTokens >= contextWindow * 0.8 || estimatedTokens >= contextWindow * 0.8;
```

**Step 2: 运行相关测试**

Run: `npx vitest run tests/main/services/agent/`
Expected: PASS

**Step 3: 提交**

```bash
git add src/main/services/agent/executor/ReActExecutor.ts
git commit -m "improve: use real token counts from API to refine context budget estimation"
```

---

### Task 11: 记忆系统 — 增加分类支持

**问题：** 所有记忆平铺在一个文件里，无分类无结构

**Files:**
- Modify: `src/main/services/tools/core/MemorizeTool.ts` — 增加可选 category 参数
- Modify: `src/main/services/memory/MemoryStore.ts` — 按分类分区存储
- Create: `src/common/types/memory.ts` — 定义 category enum
- Test: `tests/main/services/memory/MemoryStore.test.ts`

**Step 1: 定义记忆分类类型**

在 `src/common/types/memory.ts`（新建）中：

```typescript
export type MemoryCategory = 'preference' | 'project' | 'workflow' | 'fact';
```

**Step 2: 修改 MemoryStore 存储格式**

在 `MemoryStore.ts` 中，将 memory.md 的格式从平铺改为按分类分区：

```markdown
<!-- memory:category:preference -->
<!-- memory: 用户偏好的编辑器 -->
VS Code, 主题 One Dark Pro
<!-- memory: 用户偏好中文回复 -->

<!-- memory:category:project -->
<!-- memory: 项目技术栈 -->
React 19 + Electron + TypeScript
```

修改 `save()` 方法接受可选的 `category` 参数，`read()` 支持按分类读取（`read(category?)`)。

**Step 3: 修改 MemorizeTool 工具定义**

在 `getDefinition()` 中增加可选的 `category` 参数：

```typescript
category: {
    type: 'string',
    enum: ['preference', 'project', 'workflow', 'fact'],
    description: 'Memory category. Default is "fact".',
}
```

**Step 4: 写测试**

```typescript
describe('MemoryStore with categories', () => {
    it('should save and read memories by category', () => { /* ... */ });
    it('should maintain backward compatibility with uncategory entries', () => { /* ... */ });
    it('should deduplicate within same category', () => { /* ... */ });
});
```

**Step 5: 运行测试**

Run: `npx vitest run tests/main/services/memory/MemoryStore.test.ts`
Expected: PASS

**Step 6: 提交**

```bash
git add src/common/types/memory.ts src/main/services/memory/MemoryStore.ts src/main/services/tools/core/MemorizeTool.ts tests/main/services/memory/MemoryStore.test.ts
git commit -m "feat: add category support to memory system for better organization"
```

---

### Task 12: 记忆系统 — 分层注入策略

**问题：** 每次 run 都把整个 memory.md 塞进 system prompt，浪费 token 且超 8000 字符会丢失记忆

**Files:**
- Modify: `src/main/services/agent/PromptBuilder.ts:209-248` — 分层注入
- Modify: `src/main/services/tools/core/MemorizeTool.ts` — 增加 read/list 操作
- Modify: `src/main/services/memory/MemoryStore.ts` — 增加 listTitles()、readByCategory() 方法

**核心设计：按分类分层注入，不是一刀切全改按需**

| 分类 | 注入策略 | 原因 |
|------|---------|------|
| `preference`（偏好） | **全量注入 system prompt**（当前做法） | "偏好中文回复"等偏好每轮都需要遵守，不能等 LLM 主动检索 |
| `project`（项目知识） | 只注入目录，按需检索 | 不是每轮都需要，节省 token |
| `workflow`（工作流） | 只注入目录，按需检索 | 不是每轮都需要 |
| `fact`（事实） | 只注入目录，按需检索 | 不是每轮都需要 |

> **关键：** 不能把所有记忆都改成按需检索。偏好类记忆如果不在 system prompt 中，LLM 不会每轮主动读取，导致用户偏好（语言、风格等）被频繁遗忘。

**Step 1: MemoryStore 增加方法**

```typescript
// 获取所有记忆标题列表
listTitles(): Array<{ title: string; category?: MemoryCategory }> { /* ... */ }

// 读取指定分类的内容（用于 preference 全量注入）
readByCategory(category: MemoryCategory): string { /* ... */ }
```

**Step 2: PromptBuilder 分层注入**

```typescript
buildMemory(context: AgentContext): string {
    // ... instructions（保持现有指引不变）

    // 偏好类：全量注入（和当前行为一致）
    const preferences = this.memoryStore.readByCategory('preference');
    if (preferences) {
        memorySection += preferences;
    }

    // 非偏好类：只注入目录
    const otherTitles = this.memoryStore.listTitles()
        .filter(t => t.category !== 'preference');
    if (otherTitles.length > 0) {
        memorySection += '\nAdditional memories (use memorize tool with action="read" to retrieve):\n';
        for (const t of otherTitles) {
            memorySection += `- ${t.title} [${t.category || 'fact'}]\n`;
        }
    }

    return `<memory>\n${instructions}\n\n${memorySection}\n</memory>`;
}
```

**Step 3: MemorizeTool 增加 read 操作**

在 action enum 中增加 `read` 和 `list`：

```typescript
action: { enum: ['save', 'delete', 'read', 'list'] }
// read: 按 title 检索具体记忆内容
// list: 返回所有记忆标题列表
```

**Step 4: 更新测试**

Run: `npx vitest run tests/main/services/`
Expected: PASS

**Step 5: 提交**

```bash
git add src/main/services/agent/PromptBuilder.ts src/main/services/tools/core/MemorizeTool.ts src/main/services/memory/MemoryStore.ts tests/main/services/
git commit -m "feat: implement tiered memory injection - preference full-load, knowledge on-demand"
```

---

## 阶段四（可选）：P3 进阶改进

### Task 13: 增强裁剪占位符

**Files:**
- Modify: `src/main/services/agent/ContextManager.ts:117-131`

当前被裁剪区域的占位符只有"最近 3 条用户意图 + 工具统计"。改进为提取结构化信息：

```typescript
// 从被裁剪的消息中提取：
// 1. 涉及的文件路径列表
// 2. 关键决策（用户明确确认或否决的内容）
// 3. 当前任务进展状态
```

### Task 14: 摘要分级策略

**Files:**
- Modify: `src/main/services/agent/Summarizer.ts`

区分两种粒度的摘要：
- 工具调用密集区域：只保留"调用了什么工具 + 结果摘要"
- 用户交互密集区域：保留完整意图和偏好表达

---

## 实施顺序总结

```
阶段一 (P0): Task 1 → Task 3                 ~15 分钟（Task 2 已取消）
阶段二 (P1): Task 4 → 5 → 6 → 7 → 8 → 9     ~1-2 天
阶段三 (P2): Task 10 → 11 → 12               ~2-3 天
阶段四 (P3): Task 13 → 14                     ~1-2 天 (可选)
```

每个 Task 独立可提交，可随时暂停。

---

## 评审修订记录

| 日期 | 修订内容 |
|------|---------|
| 2026-04-14 | Task 2 取消：write/edit 不带 allowedPaths 是正确安全设计 |
| 2026-04-14 | Task 3 修正：Electron 不使用 NODE_ENV，直接删除日志行 |
| 2026-04-14 | Task 8 修正：保留工具内部 50KB 安全上限不动，只调整 ContextManager 二级截断；web_fetch 从 100KB 降至 20KB（非 4KB） |
| 2026-04-14 | Task 9 修正：保持窗口 3，新增"同一工具连续失败"和"两工具交替循环"两种检测模式 |
| 2026-04-14 | Task 10 修正：不修改 maxTokens（避免度量不一致），只在摘要触发判断中结合真实+估算 token |
| 2026-04-14 | Task 11 修正：不考虑旧格式迁移，直接使用新格式 |
| 2026-04-14 | Task 12 重构：从"全量改按需"改为"分层注入"— preference 全量注入、其他分类按需检索 |
