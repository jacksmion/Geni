# Agent 模块重构需求文档

> **Created**: 2026-03-29
> **Scope**: `src/main/services/agent/` 及关联的 Controller、IM、Scheduler 层
> **Status**: Draft

---

## 1. 背景与目标

Agent 模块是 Geni 的核心执行引擎，当前已经历 Phase 1~2 重构，具备 ReAct 循环、显式状态机、LLM 抽象层等基础能力。但随着 IM 集成、定时任务等功能增加，暴露了以下结构性问题：

1. **编排逻辑三重复制** — AgentController / IMServiceManager / SchedulerService 各自实现了一套几乎相同的执行编排
2. **AgentRuntime 职责过重** — 618 行的 God Class 承担了过多关注点
3. **依赖绑定具体类** — 缺少接口抽象，难以测试和替换
4. **分层边界被穿透** — Agent Kernel 直接依赖 Infrastructure 具体实现

重构目标：**在不改变外部行为的前提下，通过分层优化提升可维护性、可测试性和稳定性。**

---

## 2. 当前架构问题详解

### 2.1 [P0] 编排逻辑三重复制

**问题描述**：

三个消费者各自实现了相同的 Agent 执行编排流程：

| 编排步骤 | AgentController | IMServiceManager | SchedulerService |
|:--|:--|:--|:--|
| 创建 AbortController | L199 | L176 | L271 |
| 获取 Session History | L196 | L180 | L277-286 |
| 准备 Skills 列表 | L203-214 | L183-192 | L555-566 |
| 创建 AgentRuntime | L48 | L205 | L306 |
| 调用 runtime.run() | L229 | L217 | L310 |
| 消息持久化 | L263-265 | L252-256 | L317-321 |
| 错误处理 | L272-282 | L257-259 | L355-389 |

其中 Skills 列表的映射代码在三处完全相同：

```typescript
const skillList: Skill[] = enabledSkillObjects.map(obj => ({
    id: obj.id,
    name: obj.name,
    description: obj.description,
    content: obj.instruction,
    path: obj.path || '',
    enabled: true,
    trustLevel: 'Auto'
}));
```

**改进方案**：抽取 `AgentOrchestrator` 共享编排层。

```typescript
// 新增文件: src/main/services/agent/AgentOrchestrator.ts

export interface OrchestratorDeps {
    toolRegistry: IToolRegistry;
    sessionManager: ISessionManager;
    memoryStore: IMemoryStore;
    usageManager: IUsageManager;
}

export class AgentOrchestrator {
    constructor(private deps: OrchestratorDeps) {}

    /** 准备运行上下文（Session、Skills、Abort） */
    async prepareContext(options: {
        sessionId?: string;
        signal?: AbortSignal;
    }): Promise<AgentExecutionContext>;

    /** Skill 对象映射（消除三处重复） */
    mapSkills(skillObjects: any[]): Skill[];

    /** 执行 Agent 并持久化结果 */
    async executeAndPersist(
        prompt: string,
        settings: AppSettings,
        context: AgentExecutionContext,
        observer?: AgentObserver
    ): Promise<AgentRunResult>;
}
```

**涉及文件**：
- 新增 `src/main/services/agent/AgentOrchestrator.ts`
- 修改 `src/main/controllers/AgentController.ts`
- 修改 `src/main/services/im/IMServiceManager.ts`
- 修改 `src/main/services/scheduler/SchedulerService.ts`

---

### 2.2 [P0] 并发安全问题

**问题描述**：

`AgentRuntime.run()` 中每次创建 session-specific managers 后覆盖实例属性：

```typescript
// AgentRuntime.ts:148-149
this.stateManager = sessionStateManager;   // 替换实例属性
this.toolGuard = sessionToolGuard;          // 替换实例属性
```

如果两个 `run()` 同时执行（例如 UI 和 IM 同时请求），后者的 stateManager 会覆盖前者，导致状态混乱。`AgentRuntime` 是单例但无并发保护。

**改进方案**：两种选择：

方案 A — 运行时互斥锁：
```typescript
private runLock = new Semaphore(1);

async run(...): Promise<AgentRunResult> {
    await this.runLock.acquire();
    try {
        // ... existing logic, remove instance property replacement
    } finally {
        this.runLock.release();
    }
}
```

方案 B — 改为工厂模式，每次创建独立实例（IMServiceManager 已采用此模式）：
```typescript
// 每个消费者 new AgentRuntime(...) ，不共享单例
```

推荐方案 B，因为 IMServiceManager 和 SchedulerService 已经是每次创建新实例，只有 AgentController 使用共享实例。

**涉及文件**：
- 修改 `src/main/services/agent/AgentRuntime.ts`
- 修改 `src/main/controllers/AgentController.ts`

---

### 2.3 [P1] AgentRuntime 依赖具体类而非接口

**问题描述**：

```typescript
// AgentRuntime.ts:88
constructor(
    settings: AppSettings,
    toolRegistry: ToolRegistry,       // 具体类
    memoryStore: MemoryStore,         // 具体类
    usageManager: UsageManager        // 具体类
)
```

直接绑定具体实现类，导致：
- 单元测试中无法 mock 替换
- 违反依赖倒置原则（DIP）
- Agent Kernel 层和 Infrastructure 层的边界被破坏

**改进方案**：定义接口并通过构造函数注入。

```typescript
// 在 common/types/ 或 agent/ 模块中定义接口
export interface IToolRegistry {
    getTools(): ITool[];
    executeTool(name: string, args: any, signal?: AbortSignal, onStream?: (chunk: string) => void): Promise<ToolExecutionResult>;
}

export interface IMemoryStore {
    read(): string;
}

export interface IUsageManager {
    recordUsage(usage: any): void;
}

// AgentRuntime 改为依赖接口
constructor(
    settings: AppSettings,
    toolRegistry: IToolRegistry,
    memoryStore: IMemoryStore,
    usageManager: IUsageManager
)
```

**涉及文件**：
- 修改 `src/main/services/agent/AgentRuntime.ts`
- 新增接口定义（可放在 `src/common/types/` 或 `src/main/services/agent/interfaces.ts`）

---

### 2.4 [P1] 分层边界穿透 — Summarizer/ContextManager 反向依赖认知层

**问题描述**：

Agent Kernel 层的组件不应依赖 Cognitive Layer：

```typescript
// Summarizer.ts:2
import { IChatModel, ChatMessage } from '../llm/IChatModel';

// ContextManager.ts:2
import { ChatMessage } from '../llm/IChatModel';
```

`ChatMessage` 已在 `common/types/chat.ts` 中定义（SSoT），`ContextManager` 纯粹只需类型，不应通过 `llm` 包中转。`Summarizer` 需要 LLM 做摘要，应通过注入的接口调用而非直接 import。

**改进方案**：
1. `ContextManager` 改为 `import { ChatMessage } from '../../../common/types/chat'`
2. `Summarizer` 的 LLM 调用通过构造函数注入 `IChatModel` 接口

```typescript
export class Summarizer {
    constructor(private chatModel?: IChatModel) {}

    async summarize(messages: ChatMessage[], model?: IChatModel): Promise<ChatMessage[]> {
        const effectiveModel = model || this.chatModel;
        if (!effectiveModel) throw new Error('No chat model provided');
        // ... existing logic
    }
}
```

**涉及文件**：
- 修改 `src/main/services/agent/Summarizer.ts`
- 修改 `src/main/services/agent/ContextManager.ts`
- 修改 `src/main/services/agent/TokenCounter.ts`（同样从 llm 包导入）

---

### 2.5 [P1] 消除 `any` 类型

**问题描述**：

`AgentRuntime.ts` 中至少 6 处使用 `any`，丧失类型安全：

| 位置 | 代码 | 应有类型 |
|:--|:--|:--|
| L293 | `options.history.forEach((h: any) =>` | `ChatMessage` |
| L349 | `let usage: any = undefined` | `TokenUsage` (需定义) |
| L436 | `toolCalls: any[]` | `ToolCall[]` |
| L596 | `estimateUsage(...): any` | `TokenUsage` |
| L608 | `recordUsageAtEnd(..., usage: any)` | `TokenUsage` |

**改进方案**：在 `common/types/` 中定义统一的 `TokenUsage` 类型：

```typescript
export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    isEstimated?: boolean;
}
```

**涉及文件**：
- 新增或修改 `src/common/types/chat.ts`
- 修改 `src/main/services/agent/AgentRuntime.ts`

---

### 2.6 [P1] 统一配置常量

**问题描述**：

魔法数字散落在多个文件中：

| 常量 | 当前位置 | 值 |
|:--|:--|:--|
| MAX_LOOPS | AgentRuntime.ts:160 | 50 |
| max_tokens | AgentRuntime.ts:341 | 16000 |
| maxContextTokens | AgentRuntime.ts:98 | 32000 |
| MAX_MEMORY_CHARS | PromptBuilder.ts:200 | 8000 |
| DEFAULT_LIMIT | ContextManager.ts:168 | 2000 |
| TOOL_OUTPUT_MAX_CHARS | Summarizer.ts:18 | 500 |
| SUMMARIZE_REQUEST_MAX_TOKENS | Summarizer.ts:20 | 12000 |
| preserveRecentMessages | AgentRuntime.ts:98 | 20 |
| THROTTLE_MS | AgentController.ts:35 | 60 |
| Authorization Timeout | AgentController.ts:133 | 300000 (5min) |

**改进方案**：抽取统一的 `AgentConfig` 类型：

```typescript
// src/main/services/agent/AgentConfig.ts
export interface AgentConfig {
    /** Agent 循环最大轮次 */
    maxLoops: number;
    /** LLM 单次最大输出 token */
    maxOutputTokens: number;
    /** 上下文窗口 token 上限 */
    maxContextTokens: number;
    /** 上下文裁剪保留的最近消息数 */
    preserveRecentMessages: number;
    /** 记忆注入最大字符数 */
    maxMemoryChars: number;
    /** 工具输出默认截断字符数 */
    defaultToolOutputLimit: number;
    /** 工具输出截断映射 */
    toolOutputLimits: Record<string, number>;
    /** 摘要请求最大 token */
    summarizeMaxTokens: number;
    /** 摘要中工具输出截断字符数 */
    summarizeToolOutputMaxChars: number;
    /** 授权超时（ms） */
    authorizationTimeoutMs: number;
    /** IPC 流式节流间隔（ms） */
    ipcThrottleMs: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
    maxLoops: 50,
    maxOutputTokens: 16000,
    maxContextTokens: 32000,
    preserveRecentMessages: 20,
    maxMemoryChars: 8000,
    defaultToolOutputLimit: 2000,
    toolOutputLimits: { load_skill: 32000, read: 32000, web_fetch: 100000 },
    summarizeMaxTokens: 12000,
    summarizeToolOutputMaxChars: 500,
    authorizationTimeoutMs: 60000,
    ipcThrottleMs: 60,
};
```

**涉及文件**：
- 新增 `src/main/services/agent/AgentConfig.ts`
- 修改所有使用魔法数字的文件

---

### 2.7 [P1] 摘要失败后的降级策略

**问题描述**：

```typescript
// AgentRuntime.ts:318-320
try {
    optimized = await this.summarizer.summarize(optimized, chatModel);
} catch (e) {
    console.warn('[AgentRuntime] Summarization failed:', e);
    // 静默继续，可能导致 token 溢出
}
```

摘要失败后继续用未压缩的上下文，可能导致 token 溢出触发 API 错误。

**改进方案**：摘要失败时采用更激进的裁剪策略：

```typescript
try {
    optimized = await this.summarizer.summarize(optimized, chatModel);
} catch (e) {
    console.warn('[AgentRuntime] Summarization failed, using aggressive pruning:', e);
    // 降级为激进裁剪：保留更少的消息
    optimized = this.contextManager.aggressivePrune(optimized, maxTokens * 0.5);
}
```

**涉及文件**：
- 修改 `src/main/services/agent/AgentRuntime.ts`
- 修改 `src/main/services/agent/ContextManager.ts`（新增 aggressivePrune 方法）

---

### 2.8 [P2] 引入 AgentEventBus 统一横切关注点

**问题描述**：

性能日志、Token 统计、错误分类、状态变更等横切逻辑散落在 AgentRuntime 内部，Runtime 既管执行又管记录。

**改进方案**：

```typescript
// src/main/services/agent/AgentEventBus.ts

export type AgentEvent =
    | { type: 'llm:complete'; usage: TokenUsage; model: string; duration: number }
    | { type: 'tool:execute'; toolName: string; duration: number; success: boolean }
    | { type: 'state:change'; previous: AgentState; current: AgentState; message?: string }
    | { type: 'error'; error: ClassifiedError }
    | { type: 'context:pruned'; removedCount: number; freedTokens: number }
    | { type: 'context:summarized'; originalTokens: number; newTokens: number };

export class AgentEventBus {
    private handlers = new Map<string, Set<(event: AgentEvent) => void>>();

    on<T extends AgentEvent['type']>(type: T, handler: (event: Extract<AgentEvent, { type: T }>) => void): () => void;
    emit(event: AgentEvent): void;
}
```

AgentRuntime 内部改为 `this.eventBus.emit(...)` 而非直接调用 UsageManager 和 console.log。

**涉及文件**：
- 新增 `src/main/services/agent/AgentEventBus.ts`
- 修改 `src/main/services/agent/AgentRuntime.ts`
- 修改 `src/main/controllers/AgentController.ts`（订阅事件）

---

### 2.9 [P2] AgentRuntime God Class 拆分

**问题描述**：

`AgentRuntime.ts` 618 行，承担了 6+ 职责。`run()` 方法嵌套了整个主循环，内部方法数量过多。

**改进方案**：拆分为独立组件，AgentRuntime 变为薄协调层：

```
AgentRuntime (薄壳, ~150行)
├── LlmTurnExecutor     — LLM 调用 + 流式解析 (当前 executeLlmTurn)
├── ToolCallHandler     — 工具调用编排 + 授权 (当前 handleToolCalls)
├── MessagePreparer     — System Prompt + History 构建 (当前 prepareMessages)
└── AgentErrorHandler   — 错误分类 + 恢复 (当前 handleError)
```

```typescript
// AgentRuntime 拆分后的核心循环伪代码
async run(prompt, tools, options, observer): Promise<AgentRunResult> {
    const ctx = this.prepareContext(prompt, options);
    const llmExecutor = new LlmTurnExecutor(this.chatModel, this.eventBus);
    const toolHandler = new ToolCallHandler(this.toolGuard, this.toolRegistry, this.eventBus);

    while (loopCount++ < this.config.maxLoops) {
        ctx.messages = await this.optimizeContext(ctx.messages);
        const turn = await llmExecutor.execute(ctx.messages, tools, options);
        if (!turn.hasToolCalls) return this.finalize(turn.content, ctx);
        await toolHandler.execute(turn.toolCalls, tools, ctx, observer);
    }
}
```

**涉及文件**：
- 新增 `src/main/services/agent/LlmTurnExecutor.ts`
- 新增 `src/main/services/agent/ToolCallHandler.ts`
- 新增 `src/main/services/agent/MessagePreparer.ts`
- 修改 `src/main/services/agent/AgentRuntime.ts`

---

### 2.10 [P2] 重复代码提取 — ensureToolCallAtomicity

**问题描述**：

`ContextManager.ts:138-156` 和 `Summarizer.ts:87-105` 有完全相同的 `ensureToolCallAtomicity` 方法。

**改进方案**：提取到共享工具函数：

```typescript
// src/main/services/agent/utils/messageUtils.ts
export function ensureToolCallAtomicity(messages: ChatMessage[], startIdx: number): number {
    // ... 现有逻辑
}
```

**涉及文件**：
- 新增 `src/main/services/agent/utils/messageUtils.ts`
- 修改 `src/main/services/agent/ContextManager.ts`
- 修改 `src/main/services/agent/Summarizer.ts`

---

### 2.11 [P2] 死代码清理

**问题描述**：

| 项目 | 位置 | 说明 |
|:--|:--|:--|
| `ExecutingHelper` 状态 | AgentState.ts:29 | 已定义但 AgentRuntime 从未使用 |
| `defaultToolGuard` 单例 | ToolGuard.ts:354 | 导出但 AgentRuntime 创建独立实例 |
| `defaultPromptBuilder` 单例 | PromptBuilder.ts:239 | 同上 |
| `// TODO: Add permission check` | ToolRegistry.ts:41 | 已由 ToolGuard 实现，注释过时 |

**改进方案**：逐一清理。

---

### 2.12 [P2] ChatModelFactory 缓存无界

**问题描述**：

```typescript
// ChatModelFactory.ts:72
const modelCache = new Map<string, IChatModel>();
```

模块级全局缓存，永远不清理，随着用户切换模型/Provider 无限增长。且与 AgentRuntime 注释 "Always create a new model instance" 矛盾。

**改进方案**：

```typescript
// 方案: LRU 缓存 + 显式清理
const modelCache = new Map<string, { model: IChatModel; lastAccess: number }>();
const MAX_CACHE_SIZE = 10;

export function clearModelCache(): void {
    modelCache.clear();
}

export function createChatModel(providerId: string, config: ChatModelConfig): IChatModel {
    // ... LRU eviction logic
}
```

**涉及文件**：
- 修改 `src/main/services/llm/ChatModelFactory.ts`

---

### 2.13 [P2] ToolRegistry 职责越界

**问题描述**：

```typescript
// ToolRegistry.ts:66-74
updateWorkspacePath(newPath: string) {
    for (const tool of this.tools.values()) {
        if (typeof (tool as any).setRoot === 'function') {
            (tool as any).setRoot(newPath);
        }
    }
}
```

Registry 不应知道工具的内部方法。`setRoot` 应该是 `ITool` 接口的可选方法。

**改进方案**：

```typescript
// common/types/tool.ts
export interface ITool {
    getDefinition(): ToolDefinition;
    execute(args: any, signal?: AbortSignal, onStream?: (chunk: string) => void): Promise<ToolExecutionResult>;
    // 可选：配置更新
    updateConfig?(config: Record<string, any>): void;
}
```

**涉及文件**：
- 修改 `src/common/types/tool.ts`
- 修改 `src/main/services/tools/ToolRegistry.ts`

---

### 2.14 [P3] 补充关键组件单元测试

**问题描述**：

已有测试：
- ContextManager.test.ts
- PromptBuilder.test.ts
- AgentState.test.ts
- Summarizer.test.ts
- TokenCounter.test.ts
- ToolGuard.test.ts

**缺失的关键测试**：

| 组件 | 优先级 | 说明 |
|:--|:--|:--|
| `AgentRuntime` | P0 | 核心运行时，最需要测试 |
| `RetryPolicy` | P1 | 重试策略，稳定性核心 |
| `ErrorClassifier` | P1 | 错误分类，错误恢复核心 |
| `AgentOrchestrator`（新增后） | P1 | 编排层，集成测试 |

---

### 2.15 [P3] 引入日志抽象

**问题描述**：

所有 `[AgentPerf]` 日志直接用 `console.log`，生产环境无法控制级别和输出。

**改进方案**：

```typescript
// src/main/services/agent/AgentLogger.ts
export interface AgentLogger {
    perf(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}

// 可通过 AgentEventBus 或直接注入
```

---

## 3. 重构后的目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                  Consumers (差异化逻辑)                       │
│  AgentController       IMServiceManager      Scheduler      │
│  (IPC + UI 节流)      (IM 适配 + 推送)      (Cron 调度)     │
├─────────────────────────────────────────────────────────────┤
│             AgentOrchestrator (共享编排层)                    │
│  prepareContext() → mapSkills() → executeAndPersist()        │
├─────────────────────────────────────────────────────────────┤
│               Agent Runtime (薄协调层)                       │
│  LlmTurnExecutor │ ToolCallHandler │ MessagePreparer         │
│  PromptBuilder   │ ContextManager  │ Summarizer              │
│  ToolGuard       │ StateManager    │ TokenCounter            │
├─────────────────────────────────────────────────────────────┤
│             AgentEventBus (横切关注点)                        │
│  Usage │ Perf │ State │ Error → 各基础设施服务                │
├───────────────┬───────────────────┬─────────────────────────┤
│   Cognitive   │    Capability     │    Infrastructure       │
│   IChatModel  │   IToolRegistry   │   ISessionManager       │
│   (接口)      │   (接口)          │   IMemoryStore          │
│               │                   │   IUsageManager         │
└───────────────┴───────────────────┴─────────────────────────┘
```

---

## 4. 实施计划建议

分三个阶段，每阶段独立可交付：

### Phase A — 基础治理（稳定性 + 代码质量）
| # | 任务 | 对应章节 |
|:--|:--|:--|
| A1 | 消除 `any` 类型，定义 `TokenUsage` | 2.5 |
| A2 | 统一配置常量到 `AgentConfig` | 2.6 |
| A3 | 修复并发安全问题 | 2.2 |
| A4 | 摘要失败降级策略 | 2.7 |
| A5 | 死代码清理 | 2.11 |
| A6 | ChatModelFactory 缓存优化 | 2.12 |
| A7 | 补充 AgentRuntime / RetryPolicy / ErrorClassifier 测试 | 2.14 |

### Phase B — 分层优化（架构改进）
| # | 任务 | 对应章节 |
|:--|:--|:--|
| B1 | 抽取 `AgentOrchestrator`，消除三重复制 | 2.1 |
| B2 | 定义接口（IToolRegistry / IMemoryStore / IUsageManager）| 2.3 |
| B3 | 修复分层穿透（Summarizer/ContextManager/TokenCounter） | 2.4 |
| B4 | 提取 `ensureToolCallAtomicity` 公共方法 | 2.10 |
| B5 | ToolRegistry 职责归位 | 2.13 |

### Phase C — 进阶演进（可扩展性）
| # | 任务 | 对应章节 |
|:--|:--|:--|
| C1 | 引入 `AgentEventBus` | 2.8 |
| C2 | AgentRuntime God Class 拆分 | 2.9 |
| C3 | 引入日志抽象 | 2.15 |
