# Phase 0: Type Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish new type system for the agent architecture refactoring without changing any runtime behavior.

**Architecture:** Introduce `Agent` interface as the base configuration object, extend `StaffProfile` from it, create `AgentContext` (runtime execution context) and `AgentEvent`/`AgentRunRequest`/`AgentRunResult` types. All new types are pure definitions with zero runtime impact.

**Tech Stack:** TypeScript, existing project structure

---

## Key Design Decisions

1. **PromptBuilder's `AgentContext` remains unchanged** — it's a different concept (prompt build context) from the new runtime `AgentContext`. Both coexist; consumers import by path.
2. **New `AgentEvent` in `types.ts` is separate from existing `AgentEvent` in `agentEvents.ts`** — the existing one serves IPC, the new one serves the internal execution layer. They'll converge in Phase 5.
3. **Old `Message`/`MessageRole`/`AgentContext` in `agent.ts` are dead code** — confirmed zero references. Safe to remove.
4. **`ErrorCategory` stays in `agent.ts`** — actively used by `ErrorClassifier.ts`.

## Files to Change

| File | Action |
|------|--------|
| `src/common/types/agent.ts` | Rewrite: remove dead types, add `Agent` interface |
| `src/common/types/staff.ts` | Modify: `StaffProfile extends Agent`, deprecate old fields |
| `src/main/services/agent/AgentContext.ts` | Create: runtime context interface |
| `src/main/services/agent/types.ts` | Create: `AgentEvent`, `AgentRunRequest`, `AgentRunResult`, `extractTextFromPrompt` |
| `src/main/services/llm/IChatModel.ts` | Modify: add `LLMClientFactory` type |
| `src/main/services/tools/ToolRegistry.ts` | Modify: add `filter()` method |

---

### Task 1: Rewrite `src/common/types/agent.ts`

**Files:**
- Modify: `src/common/types/agent.ts`

**Step 1: Replace file content**

Remove dead `Message`, `MessageRole`, old `AgentContext`. Keep `ErrorCategory`. Add new `Agent` interface.

```typescript
/**
 * Agent - 纯配置对象（不可变，可序列化）
 *
 * Agent 是三层架构的最顶层：
 * Agent（是什么）→ Runtime（怎么跑）→ Executor（怎么想）
 */

export interface Agent {
    id: string;
    name: string;

    // Brain
    modelId: string;             // 格式: 'provider/model'，如 'openai/gpt-4o'
    systemPrompt?: string;
    temperature?: number;

    // Capabilities
    skillIds?: string[];
    allowedTools?: string[];     // undefined = 全部工具；支持通配符：'github/*'
}

export enum ErrorCategory {
    Network = 'network',
    RateLimit = 'rate_limit',
    Authentication = 'auth',
    ToolExecution = 'tool',
    TokenLimit = 'token_limit',
    Unknown = 'unknown',
    Aborted = 'aborted'
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS (no files import Message/MessageRole/old AgentContext from this file)

**Step 3: Commit**

```bash
git add src/common/types/agent.ts
git commit -m "refactor: replace dead types with new Agent interface in agent.ts"
```

---

### Task 2: Modify `StaffProfile` to extend `Agent`

**Files:**
- Modify: `src/common/types/staff.ts`

**Step 1: Update StaffProfile**

```typescript
import type { Agent } from './agent';

/**
 * StaffProfile - 数字员工（自定义 Agent）类型定义
 *
 * 核心公式: 数字员工 = Persona + Skills + Tools + Memory
 * 本质上是对 AgentRuntime 配置参数的命名化、持久化封装。
 */
export interface StaffProfile extends Agent {
    avatar?: string;
    description?: string;
    status: 'idle' | 'busy' | 'off-duty';

    /** @deprecated Use agent.systemPrompt */
    persona?: string;
    /** @deprecated Use agent.modelId (format: 'provider/model') */
    provider?: string;
    /** @deprecated Use agent.modelId (format: 'provider/model') */
    model?: string;
    /** @deprecated Runtime derives path from agent.id */
    memoryFile?: string;
    /** @deprecated Use agent.allowedTools (supports wildcards like 'github/*') */
    allowedMcpServerIds?: string[];

    createdAt: number;
    updatedAt: number;
}

/** 列表展示用的精简元数据 */
export type StaffMeta = Pick<StaffProfile, 'id' | 'name' | 'avatar' | 'description' | 'status'>;
```

**Step 2: Write type compatibility test**

Create: `tests/common/types/staff-type.test.ts`

```typescript
import type { Agent } from '@/common/types/agent';
import type { StaffProfile } from '@/common/types/staff';

describe('StaffProfile type compatibility', () => {
    it('StaffProfile should be assignable to Agent', () => {
        const staff: StaffProfile = {
            id: 'staff-1',
            name: 'Test Staff',
            modelId: 'openai/gpt-4o',
            systemPrompt: 'You are a test staff',
            status: 'idle',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        // This line is the actual test — it must compile
        const agent: Agent = staff;
        expect(agent.id).toBe('staff-1');
        expect(agent.modelId).toBe('openai/gpt-4o');
    });
});
```

**Step 3: Run tests**

Run: `npx vitest run tests/common/types/staff-type.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/common/types/staff.ts tests/common/types/staff-type.test.ts
git commit -m "refactor: StaffProfile extends Agent, deprecate old fields"
```

---

### Task 3: Create `AgentContext.ts`

**Files:**
- Create: `src/main/services/agent/AgentContext.ts`

**Step 1: Create the file**

```typescript
/**
 * AgentContext - Agent 运行上下文（三层架构的核心连接点）
 *
 * 由 DefaultAgentRuntime 构建，注入到 AgentExecutor。
 * 生命周期：一次 run() 调用 → 一个 AgentContext 实例。
 *
 * 设计原则：
 * - 不可变：构建后字段不被修改（messages 除外，Executor 追加消息）
 * - 自包含：Executor 拿到 Context 即可执行，不需要其他外部依赖
 * - 隔离性：每个 runId 对应独立的 Context，天然并发安全
 */

import type { Agent } from '../../../common/types/agent';
import type { ChatMessage } from '../../../common/types/chat';
import type { ToolRegistry } from '../tools/ToolRegistry';
import type { AgentEvent } from './types';

export interface AgentContext {
    /** 唯一运行标识，用于日志追踪 */
    runId: string;

    /** Agent 配置（不可变快照） */
    agent: Agent;

    /** 由 Runtime 组装好的完整消息（system prompt 已含 skills + memories） */
    messages: ChatMessage[];

    /** 已按 agent.allowedTools 过滤的工具集 */
    tools: ToolRegistry;

    /** 取消信号 */
    signal?: AbortSignal;

    /** 事件发射器 — Executor 通过此回调向 Controller 发送事件 */
    emit?: (event: AgentEvent) => void;
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/services/agent/AgentContext.ts
git commit -m "feat: add AgentContext runtime context interface"
```

---

### Task 4: Create `types.ts` (AgentEvent, AgentRunRequest, AgentRunResult)

**Files:**
- Create: `src/main/services/agent/types.ts`

**Step 1: Create the file**

```typescript
/**
 * Agent 类型定义 — 内部执行层使用的类型
 *
 * 注意：这些类型与 common/types/agentEvents.ts 中的 IPC 层类型并存，
 * Phase 5 时会统一。目前保持独立以避免影响现有运行时。
 */

import type { ChatMessage, ContentPart, AgentStep } from '../../../common/types/chat';

// ============================================================================
// AgentEvent — 内部执行层事件类型
// ============================================================================

export type AgentEvent =
    | { type: 'turn_start'; payload: { turnIndex: number; resetStream: boolean } }
    | { type: 'message_delta'; payload: { delta: string } }
    | { type: 'reasoning_delta'; payload: { delta: string } }
    | { type: 'tool_start'; payload: AgentStep }
    | { type: 'tool_end'; payload: AgentStep }
    | { type: 'auth_request'; payload: { runId: string; requestId: string; toolName: string; args: any; reason: string } }
    | { type: 'agent_end'; payload: { totalSteps: number; newMessages: ChatMessage[] } }
    | { type: 'turn_end'; payload: { turnIndex: number; hadToolCalls: boolean } }
    | { type: 'error'; payload: { message: string; code?: string } };

// ============================================================================
// AgentRunRequest / AgentRunResult
// ============================================================================

export interface AgentRunRequest {
    sessionId?: string;
    prompt: string | ContentPart[];
    // 注意：不传 history — Runtime 内部通过 sessionId 加载
    signal?: AbortSignal;
    emit?: (event: AgentEvent) => void;

    // 运行时覆盖（覆盖 Agent 配置默认值）
    skillIds?: string[];       // 覆盖 agent.skillIds
    toolNames?: string[];      // 限制本次可用工具
}

export interface AgentRunResult {
    finalAnswer: string;
    steps: AgentStep[];
    newMessages: ChatMessage[];
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 从多模态 prompt 中提取文本内容，用于知识记忆检索
 */
export function extractTextFromPrompt(prompt: string | ContentPart[]): string {
    if (typeof prompt === 'string') return prompt;
    return prompt
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join(' ');
}
```

**Step 2: Write tests for `extractTextFromPrompt`**

Create: `tests/main/services/agent/types.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { extractTextFromPrompt } from '@/main/services/agent/types';

describe('extractTextFromPrompt', () => {
    it('should return string input as-is', () => {
        expect(extractTextFromPrompt('hello world')).toBe('hello world');
    });

    it('should extract text from ContentPart array', () => {
        const parts = [
            { type: 'text' as const, text: 'hello' },
            { type: 'image_url' as const, image_url: { url: 'http://example.com/img.png' } },
            { type: 'text' as const, text: 'world' },
        ];
        expect(extractTextFromPrompt(parts)).toBe('hello world');
    });

    it('should return empty string for empty ContentPart array', () => {
        expect(extractTextFromPrompt([])).toBe('');
    });

    it('should return empty string for array with no text parts', () => {
        const parts = [
            { type: 'image_url' as const, image_url: { url: 'http://example.com/img.png' } },
        ];
        expect(extractTextFromPrompt(parts)).toBe('');
    });
});
```

**Step 3: Run tests**

Run: `npx vitest run tests/main/services/agent/types.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/main/services/agent/types.ts tests/main/services/agent/types.test.ts
git commit -m "feat: add AgentEvent, AgentRunRequest, AgentRunResult types"
```

---

### Task 5: Add `LLMClientFactory` to `IChatModel.ts`

**Files:**
- Modify: `src/main/services/llm/IChatModel.ts`

**Step 1: Add type after existing `ChatModelFactory`**

After line 236 (`export type ChatModelFactory = ...`), append:

```typescript
/**
 * LLM Client 工厂 — 按 Agent 配置创建 IChatModel 实例
 *
 * 为什么用工厂而非单例：
 * - 模型切换（用户改 Settings）：下次 run() 自动生效
 * - 不同 Agent 使用不同模型：按 agent.modelId 创建
 * - 测试：传入 mock 工厂函数
 */
export type LLMClientFactory = (agent: import('../../../common/types/agent').Agent) => IChatModel;
```

Note: Use `import()` type to avoid circular dependency issues.

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/services/llm/IChatModel.ts
git commit -m "feat: add LLMClientFactory type to IChatModel"
```

---

### Task 6: Add `ToolRegistry.filter()` method

**Files:**
- Modify: `src/main/services/tools/ToolRegistry.ts`

**Step 1: Add filter method**

Add after `getToolDefinitions()` method (after line 25):

```typescript
/**
 * 按工具名过滤，返回新的 ToolRegistry 实例
 *
 * 支持精确匹配和通配符：
 * - 精确匹配：'read' → 只匹配名为 'read' 的工具
 * - 通配符：'github/*' → 匹配所有以 'github/' 开头的工具
 *
 * @param toolNames 允许的工具名模式列表
 * @returns 新的 ToolRegistry 实例（不可变，不影响原 Registry）
 */
filter(toolNames: string[]): ToolRegistry {
    const filtered = Array.from(this.tools.entries())
        .filter(([name]) => toolNames.some(pattern =>
            pattern.endsWith('/*')
                ? name.startsWith(pattern.slice(0, -2))
                : name === pattern
        ))
        .map(([_, tool]) => tool);

    const registry = new ToolRegistry();
    for (const tool of filtered) {
        registry.register(tool);
    }
    return registry;
}
```

**Step 2: Write tests**

Create: `tests/main/services/tools/ToolRegistry.filter.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '@/main/services/tools/ToolRegistry';
import type { ITool, ToolDefinition, ToolExecutionResult } from '@/common/types/tool';

function createMockTool(name: string): ITool {
    return {
        getDefinition(): ToolDefinition {
            return {
                name,
                description: `Mock tool: ${name}`,
                parameters: { type: 'object', properties: {} },
            };
        },
        async execute(): Promise<ToolExecutionResult> {
            return { toolName: name, isError: false, result: 'ok' };
        },
    };
}

describe('ToolRegistry.filter', () => {
    it('should filter by exact name match', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('read'));
        registry.register(createMockTool('write'));
        registry.register(createMockTool('bash'));

        const filtered = registry.filter(['read', 'write']);
        expect(filtered.getToolDefinitions().map(d => d.name).sort()).toEqual(['read', 'write']);
    });

    it('should filter by wildcard pattern', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('github/create-issue'));
        registry.register(createMockTool('github/list-repos'));
        registry.register(createMockTool('jira/create-ticket'));
        registry.register(createMockTool('bash'));

        const filtered = registry.filter(['github/*']);
        const names = filtered.getToolDefinitions().map(d => d.name).sort();
        expect(names).toEqual(['github/create-issue', 'github/list-repos']);
    });

    it('should mix exact match and wildcard', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('read'));
        registry.register(createMockTool('write'));
        registry.register(createMockTool('github/create-issue'));

        const filtered = registry.filter(['read', 'github/*']);
        const names = filtered.getToolDefinitions().map(d => d.name).sort();
        expect(names).toEqual(['github/create-issue', 'read']);
    });

    it('should return empty registry for non-matching patterns', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('read'));

        const filtered = registry.filter(['nonexistent']);
        expect(filtered.getToolDefinitions()).toEqual([]);
    });

    it('should not modify the original registry', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('read'));
        registry.register(createMockTool('write'));

        registry.filter(['read']);
        expect(registry.getToolDefinitions().map(d => d.name).sort()).toEqual(['read', 'write']);
    });
});
```

**Step 3: Run tests**

Run: `npx vitest run tests/main/services/tools/ToolRegistry.filter.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/main/services/tools/ToolRegistry.ts tests/main/services/tools/ToolRegistry.filter.test.ts
git commit -m "feat: add ToolRegistry.filter() with wildcard support"
```

---

### Task 7: Update `index.ts` exports and final verification

**Files:**
- Modify: `src/main/services/agent/index.ts`

**Step 1: Add new type exports**

Add to `index.ts`:

```typescript
// 新类型定义（Phase 0）
export type { AgentContext as RuntimeAgentContext } from './AgentContext';
export type { AgentEvent as InternalAgentEvent, AgentRunRequest, AgentRunResult as InternalAgentRunResult, extractTextFromPrompt } from './types';
```

Note: Use renamed exports to avoid conflicts with existing `AgentContext` (from PromptBuilder) and `AgentEvent`/`AgentRunResult` (from agentEvents/IAgent).

**Step 2: Full TypeScript compilation check**

Run: `npx tsc --noEmit`
Expected: PASS, zero errors

**Step 3: Full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/main/services/agent/index.ts
git commit -m "feat: export new Phase 0 types from agent module index"
```

---

## Verification Checklist

- [ ] `tsc --noEmit` passes with zero errors
- [ ] All existing tests pass (`vitest run`)
- [ ] `StaffProfile extends Agent` type compatibility: `const a: Agent = staffProfile` compiles
- [ ] `AgentContext.ts` can be independently imported
- [ ] `types.ts` can be independently imported
- [ ] No runtime behavior changes (grep for new file imports in existing runtime code — should be none)
- [ ] `ToolRegistry.filter()` supports exact match and wildcard patterns
- [ ] `extractTextFromPrompt()` handles string and ContentPart[] inputs
