# Agent 架构重构技术方案 v3

> 日期：2026-04-08
> 版本：v3.0（完善分阶段实施计划、测试策略、风险评估）
> 核心原则：Agent（是什么）→ Runtime（怎么跑）→ Executor（怎么想）

---

## 1. 背景与动机

### 1.1 现状问题

当前 `AgentRuntime.ts` 约 650 行，承担了过多职责，且存在以下**已确认的 Bug 和设计问题**：

| # | 问题 | 位置 | 严重程度 | 影响范围 |
|---|---|---|---|---|
| P1 | 并发覆盖：每次 `run()` 覆盖 `this.stateManager` / `this.toolGuard` | `AgentRuntime.ts:162-163` | 🔴 高 | 多窗口/多会话同时运行时状态混乱 |
| P2 | Controller 含业务逻辑：skill 解析、staff 合并逻辑在 IPC 层 | `AgentController.ts:217-251` | 🟠 中 | 职责不清，难以测试和复用 |
| P3 | 三路输出割裂：`onStream` / `onStepUpdate` / `emit` 各自独立缓冲 | `AgentController.ts:33-36` | 🟠 中 | 事件时序不一致，UI 抖动 |
| P4 | `AgentRuntime` 三份实例：UI / IM / Scheduler 各持一份 | `router.ts:84,89` | 🟠 中 | 代码重复，行为不一致 |
| P5 | StaffProfile 与 Agent 概念重叠，接口独立 | `staff.ts` / `IAgent.ts` | 🟡 低 | 新人理解成本高 |
| P6 | `AgentRunOptions` 混合配置和运行时参数 | `IAgent.ts:11-19` | 🟡 低 | 接口语义不清 |

### 1.2 重构目标

将单体 `AgentRuntime` 拆分为三层：

```
Agent         — 纯配置对象（不可变，可序列化）
AgentRuntime  — 运行生命周期管理（准备 → 执行 → 后处理）
AgentExecutor — 推理策略（可替换，可独立测试）
```

辅以 `AgentContext`（每次运行的上下文容器），并统一 IM / Scheduler 调用路径。

### 1.3 非目标（明确排除）

- 不改变 LLM Provider 适配层（OpenAI / Anthropic adapter）
- 不改变 MCP 协议集成方式
- 不引入新的状态管理库（继续用 zustand）
- 不做向量检索（接口预留，后续独立迭代）
- 不改变前端 UI 组件结构

---

## 2. 整体架构

### 2.1 三层分离

```
┌─────────────────────────────────────────────────────────┐
│                    AgentController                       │
│           （IPC 层，纯薄壳，只做协议转换）                  │
├─────────────────────────────────────────────────────────┤
│                   DefaultAgentRuntime                    │
│    （生命周期管理：准备 Context → 委托 Executor → 持久化）    │
│    · skill 解析 · tool 过滤 · history 加载 · memory 检索    │
│    · system prompt 组装 · auth 协调 · 结果持久化            │
├─────────────────────────────────────────────────────────┤
│                DefaultAgenticExecutor                    │
│       （推理策略：think → act → observe 循环）              │
│    · LLM 调用 · tool 执行 · 状态管理 · context 压缩        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 调用链路

```
UI IPC → AgentController.handleStart()
  → resolveAgent(payload)           // 构建 Agent 配置对象
  → runtime.run(agent, request)
    → 加载 history / skills / memory
    → 构建 system prompt
    → 创建 ToolGuard（并发安全）
    → 构建 AgentContext
    → executor.execute(context)      // AsyncGenerator<AgentEvent>
    → 持久化 newMessages
  ← AgentRunResult
```

### 2.3 目标文件结构

```
src/main/services/agent/
├── AgentContext.ts                   # 运行上下文（独立文件，三层连接点）
├── types.ts                          # AgentEvent, AgentRunRequest/Result, 工具函数
├── executor/
│   ├── AgentExecutor.ts              # 接口定义
│   └── DefaultAgenticExecutor.ts     # 推理循环实现
├── runtime/
│   ├── AgentRuntime.ts               # 接口定义
│   └── DefaultAgentRuntime.ts        # 生命周期管理
├── state/
│   └── AgentState.ts                 # 状态机（已有，保持不变）
├── PromptBuilder.ts                  # （已有，保持不变）
├── ContextManager.ts                 # （已有，保持不变）
├── Summarizer.ts                     # （已有，保持不变）
├── TokenCounter.ts                   # （已有，保持不变）
├── RetryPolicy.ts                    # （已有，保持不变）
├── ErrorClassifier.ts                # （已有，保持不变）
└── ToolGuard.ts                      # （已有，改造并发安全）

src/common/types/
├── agent.ts                          # Agent 接口（重写）
└── staff.ts                          # StaffProfile extends Agent（改造）
```

---

## 3. 类型与接口定义

### 3.1 Agent（配置对象）

```typescript
// src/common/types/agent.ts（清理旧内容后重写）

export interface Agent {
  id: string
  name: string

  // Brain
  modelId: string          // 格式: 'provider/model'，如 'openai/gpt-4o'
  systemPrompt?: string
  temperature?: number

  // Capabilities
  skillIds?: string[]
  allowedTools?: string[]  // undefined = 全部工具；支持通配符：'github/*'
}
```

**注意：** `src/common/types/agent.ts` 中现有的旧 `AgentContext`（含 `messages: Message[]`）和 `Message` 接口需要在 Phase 1 中删除或移出，避免与新 `AgentContext` 命名冲突。

### 3.2 StaffProfile（Agent 超集）

```typescript
// src/common/types/staff.ts

export interface StaffProfile extends Agent {
  avatar?: string
  description?: string
  status: 'idle' | 'busy' | 'off-duty'
  createdAt: number
  updatedAt: number
}
```

**字段迁移映射（旧 → 新）：**

| 旧字段 | 新字段 | 处理方式 |
|---|---|---|
| `persona` | `systemPrompt` | `StaffManager.migrate()` 显式迁移 |
| `provider` + `model` | `modelId` | 合并为 `'${provider}/${model}'` |
| `memoryFile` | 移除 | Runtime 按 `agent.id` 推导路径 |
| `allowedMcpServerIds: string[]` | `allowedTools: string[]` | 转换为通配符：`['github']` → `['github/*']` |

> ⚠️ **不使用 TypeScript getter 做兼容**：`StaffManager.load()` 返回的是 plain JSON object，getter 对 plain object 不生效。必须在 `StaffManager.migrate()` 中显式处理。

```typescript
// StaffManager.ts — 显式迁移函数
private migrate(raw: any): StaffProfile {
  return {
    ...raw,
    systemPrompt: raw.systemPrompt ?? raw.persona,
    modelId: raw.modelId ?? (raw.provider && raw.model
      ? `${raw.provider}/${raw.model}`
      : undefined),
    allowedTools: raw.allowedTools ?? raw.allowedMcpServerIds?.map(
      (id: string) => `${id}/*`
    ),
    // 清理旧字段（不删除 JSON 文件，只清理内存对象）
    persona: undefined,
    provider: undefined,
    model: undefined,
    memoryFile: undefined,
    allowedMcpServerIds: undefined,
  }
}
```

### 3.3 AgentContext（运行上下文 — 独立文件）

**为什么独立成文件：**

| 维度 | 放 types.ts 共享 | 独立 AgentContext.ts |
|---|---|---|
| 消费者 | Runtime、Executor、Controller、ToolGuard 都 import types.ts | 各方按需 import，职责清晰 |
| 演进性 | 与 AgentEvent/Request/Result 耦合，改一个动全部 | AgentContext 可独立演进（如增加中间件链、请求级缓存） |
| 理解成本 | 需要从 200+ 行文件中找到 Context 定义 | 打开即见，一目了然 |
| 架构地位 | 只是"类型之一" | 文件名即文档，体现它是三层连接点 |

```typescript
// src/main/services/agent/AgentContext.ts

/**
 * Agent 运行上下文 — 三层架构的核心连接点
 *
 * 由 DefaultAgentRuntime 构建，注入到 AgentExecutor。
 * 生命周期：一次 run() 调用 → 一个 AgentContext 实例。
 *
 * 设计原则：
 * - 不可变：构建后字段不被修改（messages 除外，Executor 追加消息）
 * - 自包含：Executor 拿到 Context 即可执行，不需要其他外部依赖
 * - 隔离性：每个 runId 对应独立的 Context，天然并发安全
 */
export interface AgentContext {
  /** 唯一运行标识，用于日志追踪 */
  runId: string

  /** Agent 配置（不可变快照） */
  agent: Agent

  /** 由 Runtime 组装好的完整消息（system prompt 已含 skills + memories） */
  messages: ChatMessage[]

  /** 已按 agent.allowedTools 过滤的工具集 */
  tools: ToolRegistry

  /** 取消信号 */
  signal?: AbortSignal

  /** 事件发射器 — Executor 通过此回调向 Controller 发送事件 */
  emit?: (event: AgentEvent) => void
}
```

### 3.4 AgentRunRequest / AgentRunResult

```typescript
export interface AgentRunRequest {
  sessionId?: string
  prompt: string | ContentPart[]
  // 注意：不传 history — Runtime 内部通过 sessionId 加载，避免双重加载
  signal?: AbortSignal
  emit?: (event: AgentEvent) => void

  // 运行时覆盖（覆盖 Agent 配置默认值）
  skillIds?: string[]      // 覆盖 agent.skillIds
  toolNames?: string[]     // 限制本次可用工具
}

export interface AgentRunResult {
  finalAnswer: string
  steps: AgentStep[]
  newMessages: ChatMessage[]
}
```

> **history 职责归属：** `AgentController` 不再传 history。`DefaultAgentRuntime` 通过 `request.sessionId` 从 `SessionManager` 加载。无 sessionId 时（如 IM 单次消息），history 为空。

### 3.5 AgentEvent（统一事件类型）

```typescript
// src/main/services/agent/types.ts

export type AgentEvent =
  | { type: 'turn_start'; payload: { turnIndex: number; resetStream: boolean } }
  | { type: 'message_delta'; payload: { delta: string } }
  | { type: 'reasoning_delta'; payload: { delta: string } }
  | { type: 'tool_start'; payload: AgentStep }
  | { type: 'tool_end'; payload: AgentStep }
  | { type: 'auth_request'; payload: { runId: string; requestId: string; toolName: string; args: any; reason: string } }
  | { type: 'agent_end'; payload: { totalSteps: number; newMessages: ChatMessage[] } }
  | { type: 'turn_end'; payload: { turnIndex: number; hadToolCalls: boolean } }
  | { type: 'error'; payload: { message: string; code?: string } }
```

### 3.6 工具函数

```typescript
// src/main/services/agent/types.ts

/**
 * 从多模态 prompt 中提取文本内容，用于知识记忆检索
 */
export function extractTextFromPrompt(prompt: string | ContentPart[]): string {
  if (typeof prompt === 'string') return prompt
  return prompt
    .filter(p => p.type === 'text')
    .map(p => (p as TextPart).text)
    .join(' ')
}
```

---

## 4. 接口定义

### 4.1 LLMClient（明确定义）

```typescript
// src/main/services/llm/IChatModel.ts — 无变更，直接复用

// LLMClient 就是 IChatModel，不引入新概念
export type LLMClient = IChatModel

// 工厂函数类型 — Executor 构造时注入工厂而非实例
export type LLMClientFactory = (agent: Agent) => IChatModel
```

**为什么用工厂而非单例：**

| 维度 | 单例 `llmClient` | 工厂 `llmFactory` |
|---|---|---|
| 模型切换（用户改 Settings） | ❌ 需要重建 Executor | ✅ 下次 `run()` 自动生效 |
| 不同 Agent 使用不同模型 | ❌ 单一实例 | ✅ 按 `agent.modelId` 创建 |
| 测试 | 需要 mock 实例 | 传入 mock 工厂函数 |

```typescript
// 工厂实现示例（在 AppRouter 中创建）
const llmFactory: LLMClientFactory = (agent: Agent) => {
  const [provider, model] = agent.modelId.split('/')
  const config = settings.llm.providers[provider]
  return createChatModel(provider, { ...config, model })
}
```

### 4.2 AgentRuntime 接口

```typescript
// src/main/services/agent/runtime/AgentRuntime.ts

export interface AgentRuntime {
  run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult>
  updateSettings(settings: AppSettings): void
}
```

> **设计说明**：授权决策不通过 Runtime 桥接。Runtime 消费 Executor 的 AsyncGenerator 事件，直接将用户决策通过 `stream.next(approved)` 传回 Executor。

### 4.3 AgentExecutor 接口

```typescript
// src/main/services/agent/executor/AgentExecutor.ts

export interface AgentExecutor {
  execute(
    context: AgentContext,
    request: AgentRunRequest
  ): AsyncGenerator<AgentEvent, AgentRunResult>
}
```

> Phase 2 初期实现可以内部用 emit callback + return Promise，接口签名已是 AsyncGenerator，Phase 5 再改内部实现。

### 4.4 ToolRegistry（增加过滤能力）

```typescript
// src/main/services/tools/ToolRegistry.ts — 新增方法

filter(toolNames: string[]): ToolRegistry {
  const filtered = this.tools.filter(tool => {
    const name = tool.getDefinition().name
    return toolNames.some(pattern =>
      pattern.endsWith('/*')
        ? name.startsWith(pattern.slice(0, -2))   // 通配符：'github/*'
        : name === pattern                          // 精确匹配
    )
  })
  return new ToolRegistry(filtered)
}
```

**`allowedMcpServerIds` → `allowedTools` 迁移示例：**
- `allowedMcpServerIds: ['github', 'jira']`
- → `allowedTools: ['read', 'bash', 'github/*', 'jira/*']`

---

## 5. 核心实现设计

### 5.1 DefaultAgentRuntime

```typescript
// src/main/services/agent/runtime/DefaultAgentRuntime.ts

export class DefaultAgentRuntime implements AgentRuntime {
  constructor(
    private settings: AppSettings,
    private toolRegistry: ToolRegistry,
    private sessionManager: SessionManager,
    private skillRegistry: SkillRegistry,
    private knowledgeMemory: KnowledgeMemory,
    private usageManager: UsageManager,
    private executor: AgentExecutor
  ) {}

  updateSettings(settings: AppSettings): void {
    this.settings = settings
  }

  async run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult> {
    const runId = crypto.randomUUID()

    // 1. 合并 Skills
    const effectiveSkillIds = request.skillIds ?? agent.skillIds
    const skills = this.skillRegistry.getByIds(effectiveSkillIds)

    // 2. 过滤工具集
    const effectiveToolNames = request.toolNames ?? agent.allowedTools
    const tools = effectiveToolNames
      ? this.toolRegistry.filter(effectiveToolNames)
      : this.toolRegistry

    // 3. 加载会话历史（Runtime 内部加载，Controller 不再传 history）
    const history = request.sessionId
      ? await this.sessionManager.getHistory(request.sessionId)
      : []

    // 4. 搜索知识记忆
    const memories = await this.knowledgeMemory.search(
      extractTextFromPrompt(request.prompt),
      { agentId: agent.id }
    )

    // 5. 构建 system prompt
    const systemPrompt = new PromptBuilder({
      defaultBasePrompt: agent.systemPrompt || this.settings.systemPrompt
    }).buildSystemPrompt({
      workspacePath: this.settings.workspacePath,
      skills,
      language: this.settings.language,
      knowledgeMemories: memories
    })

    // 6. 组装 messages
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: request.prompt }
    ]

    // 7. 构建 Context
    const context: AgentContext = {
      runId,
      agent,
      messages,
      tools,
      signal: request.signal,
      emit: request.emit
    }

    // 8. 委托 Executor
    const result = await this.executor.execute(context, request)

    // 9. 持久化新消息
    if (request.sessionId && result?.newMessages) {
      for (const msg of result.newMessages) {
        await this.sessionManager.addMessage(request.sessionId, msg)
      }
    }

    return result!
  }
}
```

### 5.2 DefaultAgenticExecutor

```typescript
// src/main/services/agent/executor/DefaultAgenticExecutor.ts

export class DefaultAgenticExecutor implements AgentExecutor {
  constructor(
    private llmFactory: LLMClientFactory,
    private settings: AppSettings
  ) {}

  async *execute(
    context: AgentContext,
    request: AgentRunRequest
  ): AsyncGenerator<AgentEvent, AgentRunResult> {
    const { messages, tools, signal, agent, emit } = context
    const llm = this.llmFactory(agent)
    const toolGuard = new ToolGuard(emit)   // ToolGuard 在 Executor 内部创建
    const stateManager = new AgentStateManager()
    const newMessages: ChatMessage[] = []
    const steps: AgentStep[] = []
    let loopCount = 0
    const MAX_LOOPS = 50

    try {
      while (loopCount++ < MAX_LOOPS) {
        signal?.throwIfAborted()

        yield { type: 'turn_start', payload: { turnIndex: loopCount, resetStream: true } }

        const optimized = await this.optimizeContext(messages, llm)
        stateManager.transition(AgentState.Thinking)

        const llmResult = yield* this.executeLlmTurn(optimized, tools, llm, context)

        messages.push(llmResult.assistantMessage)
        newMessages.push(llmResult.assistantMessage)

        if (llmResult.toolCalls.length === 0) {
          yield { type: 'agent_end', payload: { totalSteps: steps.length, newMessages } }
          return { finalAnswer: llmResult.content, steps, newMessages }
        }

        yield* this.executeTools(llmResult.toolCalls, tools, messages, newMessages,
          steps, stateManager, toolGuard, context)

        yield { type: 'turn_end', payload: { turnIndex: loopCount, hadToolCalls: true } }
      }

      return this.handleMaxSteps(steps, newMessages)
    } catch (error) {
      return this.handleError(error, steps, newMessages, stateManager, context)
    }
  }
}
```

> **设计说明**：ToolGuard 在 Executor 内部创建，原因：
> 1. **隔离性**：授权是 Executor 的内部实现细节，Context 应只包含数据
> 2. **可替换性**：PlanThenActExecutor 等其他 Executor 实现可能需要不同的授权策略
> 3. **纯数据 Context**：AgentContext 遵循"数据而非行为"原则

### 5.3 AgentController（精简后）

```typescript
// src/main/controllers/AgentController.ts

export class AgentController {
  constructor(private runtime: AgentRuntime) {}

  registerHandlers(): void {
    ipcMain.handle(AGENT_CHANNELS.START, this.handleStart.bind(this))
    ipcMain.handle(AGENT_CHANNELS.STOP, this.handleStop.bind(this))

    // 授权响应（携带 runId + requestId）
    ipcMain.on(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, (_e, res) => {
      if (res?.runId && res?.requestId) {
        // 广播到前端，由前端触发 Executor 的 stream.next()
        this.broadcast(AGENT_EVENTS.AUTHORIZATION_RESPONSE, res)
      }
    })
  }

  private async handleStart(event, payload: AgentStartRequest) {
    this.activeWebContents = event.sender
    const agent = this.resolveAgent(payload)
    const controller = new AbortController()
    this.abortControllers.set(payload.sessionId, controller)

    const request: AgentRunRequest = {
      sessionId: payload.sessionId,
      prompt: payload.prompt,
      signal: controller.signal,
      emit: this.buildEmitFn(),   // 统一事件出口，不再有 onStream/onStepUpdate
      skillIds: payload.options?.skills,
    }

    this.startThrottling()
    const result = await this.runtime.run(agent, request)
    this.stopThrottling()

    return { success: true, sessionId: payload.sessionId }
  }

  private buildEmitFn(): (event: AgentEvent) => void {
    return (event: AgentEvent) => {
      switch (event.type) {
        case 'turn_start':
          if (event.payload.resetStream) {
            this.flushThrottledEvents()
            this.broadcast(AGENT_EVENTS.STREAM, { content: '', isReset: true })
          }
          break
        case 'message_delta':
          this.streamBuffer += event.payload.delta
          break
        case 'reasoning_delta':
          this.streamBuffer += event.payload.delta
          break
        case 'tool_start':
        case 'tool_end':
          this.pendingSteps = event.payload
          break
        case 'auth_request':
          this.broadcast(AGENT_EVENTS.AUTHORIZATION_REQUEST, {
            ...event.payload,
            runId: event.payload.runId
          })
          break
        case 'error':
          this.broadcast(AGENT_EVENTS.ERROR, event.payload)
          break
      }
    }
  }

  private resolveAgent(payload: AgentStartRequest): Agent {
    const base: Agent = {
      id: 'default',
      name: 'Geni',
      modelId: this.buildModelId(this.settings),
      systemPrompt: this.settings.systemPrompt,
      temperature: this.settings.llm.temperature
    }
    if (payload.options?.staffId) {
      const profile = this.staffManager.get(payload.options.staffId)
      if (profile) return profile  // StaffProfile extends Agent
    }
    if (payload.options?.model) base.modelId = payload.options.model
    return base
  }
}
```

---

## 6. 授权机制

### 6.1 设计原则

授权是"请求-等待-响应"的双向事件流，**不放入 AgentContext**（避免 Executor 感知业务逻辑），通过 `emit` 事件通道传递。

**ToolGuard 属于 Executor 的内部实现，不属于 Context：**

```
┌─────────────────────────────────────────────────────────┐
│                    AgentContext                          │
│  只包含数据：runId, agent, messages, tools, signal, emit │
└─────────────────────────────────────────────────────────┘
                           │
                           │ emit 事件通道
                           ▼
┌─────────────────────────────────────────────────────────┐
│               DefaultAgenticExecutor                     │
│  内部持有 ToolGuard（私有）                              │
│  工具执行前 → toolGuard.evaluateRequest()               │
│  需要授权 → emit('auth_request') + Promise 等待         │
└─────────────────────────────────────────────────────────┘
                           │
                           │ yield auth_request 事件
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  DefaultAgentRuntime                    │
│  消费事件 → Controller → UI                              │
│  用户决策 → Controller → Runtime                        │
│  → Executor 继续执行                                    │
└─────────────────────────────────────────────────────────┘
```

### 6.2 并发安全

每个 Executor 实例持有独立的 ToolGuard，天然隔离：
- 会话 A: `run()` → ExecutorA.toolGuardA
- 会话 B: `run()` → ExecutorB.toolGuardB

两个会话完全隔离，互不干扰。

### 6.3 ToolGuard 改造

```typescript
export class ToolGuard {
  private pendingRequests = new Map<string, (approved: boolean) => void>()

  constructor(private emit?: (event: AgentEvent) => void) {}

  async checkAuthorization(req: ToolExecutionRequest): Promise<boolean> {
    const decision = this.evaluateRequest(req)
    if (!decision.requiresUserConfirmation) return decision.allowed

    // 通过 emit 发出授权请求
    this.emit?.({
      type: 'auth_request',
      payload: {
        runId: req.runId,
        requestId: req.requestId!,
        toolName: req.toolName,
        args: req.args,
        reason: decision.reason
      }
    })

    return new Promise(resolve => {
      this.pendingRequests.set(req.requestId!, resolve)
    })
  }

  resolve(requestId: string, approved: boolean): void {
    const resolve = this.pendingRequests.get(requestId)
    if (resolve) {
      resolve(approved)
      this.pendingRequests.delete(requestId)
    }
  }
}
```

### 6.4 Controller 授权响应处理

```typescript
// AgentController.ts

ipcMain.on(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, (_e, res) => {
  if (res?.runId && res?.requestId) {
    // 响应通过事件通道传递回 Executor
    // 由 Runtime 在消费 AsyncGenerator 时处理
    this.broadcast(AGENT_EVENTS.AUTHORIZATION_RESPONSE, res)
  }
})
```

> **为什么不通过 Runtime.resolveAuth() 桥接？**
> 
> 因为 Executor 使用 AsyncGenerator，授权决策通过 `stream.next(approved)` 直接传回 Generator：
> ```typescript
> // Runtime 中
> const stream = executor.execute(context, request)
> const { value: event, done } = await stream.next()
> 
> if (event.type === 'auth_request') {
>   const approved = await this.waitForUserDecision(event.payload)
>   stream.next(approved)  // 直接传回 Executor
> }
> ```

---

## 7. Memory 子系统

### 7.1 两层策略

```
会话记忆  → SessionManager + ContextManager + Summarizer（已有，保持不变）
知识记忆  → MemoryStore → 增强为 KnowledgeMemory（搜索能力）
```

### 7.2 接口定义

```typescript
// src/main/services/memory/types.ts

export interface KnowledgeMemory {
  search(query: string, options?: KnowledgeSearchOptions): Promise<MemoryChunk[]>
  add(text: string, metadata?: Record<string, any>): Promise<void>
  remove(id: string): Promise<void>
}

export interface KnowledgeSearchOptions {
  agentId?: string
  k?: number  // 默认 5
}

export interface MemoryChunk {
  id: string
  text: string
  score: number
  metadata?: Record<string, any>
}
```

### 7.3 FileKnowledgeMemory 实现

```typescript
// src/main/services/memory/FileKnowledgeMemory.ts

export class FileKnowledgeMemory implements KnowledgeMemory {
  constructor(private store: MemoryStore) {}

  async search(query: string, options?: KnowledgeSearchOptions): Promise<MemoryChunk[]> {
    if (!query.trim()) return []   // 空字符串直接返回，避免无意义检索
    const content = this.store.read()
    if (!content) return []
    return this.parseEntries(content)
      .map(entry => ({ id: entry.title, text: entry.content, score: this.score(query, entry) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.k ?? 5)
  }

  async add(text: string, metadata?: Record<string, any>): Promise<void> {
    this.store.save(metadata?.title ?? `memory_${Date.now()}`, text)
  }

  async remove(id: string): Promise<void> {
    this.store.delete(id)
  }
}
```

### 7.4 Knowledge 搜索升级路线

| 阶段 | 实现 | 触发条件 |
|---|---|---|
| 当前（立即可用） | 关键词 + 标题匹配（FileKnowledgeMemory） | — |
| 升级条件 | sqlite-vec 向量检索 | 知识条目 > 200 条，或需要语义检索 |

向量检索不在本次重构范围内，接口（`KnowledgeMemory`）已预留，实现可以无缝替换。

---

## 8. 分阶段实施计划

### 总览

```
Phase 0 ─── Phase 1 ─── Phase 2 ─── Phase 3 ─── Phase 4 ─── Phase 5
 类型基础    并发安全    Runtime     Executor    统一路径    事件系统
 (2天)       (2天)       (3天)       (3天)       (2天)       (2天)
```

**依赖关系：**
```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
(基础)      (紧急修复)   (核心拆分)   (核心拆分)   (统一入口)   (收尾优化)
```

每个 Phase 结束后**必须通过全量测试**才能进入下一阶段。每个 Phase 的代码都可以独立合并到 master，不会破坏现有功能。

---

### Phase 0：类型基础（预计 2 天）

**目标：** 建立新类型系统，不改变运行时行为

**改动范围：**

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/common/types/agent.ts` | 重写 | 删除旧 `AgentContext`/`Message`，定义新 `Agent` 接口 |
| `src/common/types/staff.ts` | 修改 | `StaffProfile extends Agent`，保留旧字段作为可选 |
| `src/main/services/agent/AgentContext.ts` | 新建 | `AgentContext` 接口（独立文件，三层连接点） |
| `src/main/services/agent/types.ts` | 新建 | `AgentEvent`、`AgentRunRequest/Result`、`extractTextFromPrompt` |
| `src/main/services/llm/IChatModel.ts` | 修改 | 新增 `LLMClientFactory` 类型 |

**详细步骤：**

1. 在 `src/common/types/agent.ts` 中删除旧 `AgentContext`（含 `messages: Message[]`）和 `Message` 接口，确认无其他文件引用
2. 定义新的 `Agent` 接口
3. 修改 `StaffProfile` 使其 `extends Agent`，旧字段（`persona`、`provider`、`model`、`memoryFile`、`allowedMcpServerIds`）标记为 `@deprecated` 可选字段，暂不删除以保持兼容
4. 创建 `src/main/services/agent/AgentContext.ts`，定义 `AgentContext` 接口（**不含 toolGuard**）
5. 创建 `src/main/services/agent/types.ts`，定义 `AgentEvent`、`AgentRunRequest`、`AgentRunResult`
5. 在 `IChatModel.ts` 中新增 `LLMClientFactory` 类型
6. 添加 `ToolRegistry.filter()` 方法

**验证标准：**
- [x] TypeScript 编译通过（`tsc --noEmit`）
- [x] 所有现有测试通过
- [x] `AgentContext.ts` 可被 Runtime 和 Executor 层独立 import
- [x] 新类型文件无运行时引用（纯定义）
- [x] `StaffProfile extends Agent` 类型兼容：`const a: Agent = staffProfile` 可编译

**回滚策略：** 还原 `agent.ts`、`staff.ts`、删除 `AgentContext.ts` 和 `types.ts`

---

### Phase 1：并发安全修复（预计 2 天）

**目标：** 修复 P1 并发覆盖 Bug，这是最高优先级的生产问题

**改动范围：**

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/services/agent/AgentRuntime.ts` | 修改 | 将 `stateManager` 改为 `run()` 内局部变量 |
| `src/main/services/agent/ToolGuard.ts` | 修改 | 接受 `emit` 参数，支持 `resolve()` 外部调用 |

**详细步骤：**

1. **AgentRuntime.ts 并发修复**
   - 将 `private stateManager` 从类属性改为 `run()` 内部局部变量
   - `run()` 开头生成 `runId`

2. **ToolGuard 改造**
   - 构造函数接受 `emit?: (event: AgentEvent) => void`
   - `checkAuthorization()` 通过 `emit` 发出 `auth_request` 事件（含 `runId`）
   - 新增 `resolve(requestId, approved)` 方法

**验证标准：**
- [x] 并发测试：两个 session 同时 `run()`，stateManager 互不干扰
- [x] 授权流程测试：ToolGuard emit → Controller 转发 → resolve → Promise resolve
- [x] 原有单 session 功能不受影响

**测试方案：**
```typescript
// 并发测试
const runtime = new AgentRuntime(...)
const results = await Promise.all([
  runtime.run(agentA, requestA),
  runtime.run(agentB, requestB)
])
// 验证两个 run 的 stateManager 互不影响
```

**回滚策略：** 还原 `AgentRuntime.ts` 中的 `stateManager` 为类属性

---

### Phase 2：Runtime 层拆分（预计 3 天）

**目标：** 从 `AgentRuntime` 中提取出 `DefaultAgentRuntime`，实现三层中的 Runtime 层

**改动范围：**

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/services/agent/runtime/AgentRuntime.ts` | 新建 | 接口定义 |
| `src/main/services/agent/runtime/DefaultAgentRuntime.ts` | 新建 | 从 AgentRuntime 提取生命周期逻辑 |
| `src/main/services/agent/executor/AgentExecutor.ts` | 新建 | 接口定义 |
| `src/main/services/agent/executor/DefaultAgenticExecutor.ts` | 新建 | 从 AgentRuntime 提取推理循环，**内部持有 ToolGuard** |
| `src/main/services/agent/AgentRuntime.ts` | 修改 | 逐步瘦身，委托到新类 |

**详细步骤：**

1. 创建目录 `src/main/services/agent/runtime/` 和 `src/main/services/agent/executor/`

2. 定义 `AgentRuntime` 接口（见 4.2 节）和 `AgentExecutor` 接口（见 4.3 节）

3. **创建 `DefaultAgenticExecutor`**
   - 从 `AgentRuntime.ts` 中提取：`executeLlmTurn()`、`handleToolCalls()`、`optimizeContext()`、`handleMaxSteps()`、`handleError()`
   - 构造函数注入 `LLMClientFactory` 和 `AppSettings`
   - **内部每次 `execute()` 创建局部 `ToolGuard`**（私有，不对外暴露）
   - 内部每次 `execute()` 创建局部 `AgentStateManager`
   - 实现 `AsyncGenerator<AgentEvent, AgentRunResult>` 接口
   - **初期实现**：先用 emit callback + return Promise，接口签名已预留 AsyncGenerator

4. **创建 `DefaultAgentRuntime`**
   - 从 `AgentRuntime.ts` 中提取：skill 解析、tool 过滤、history 加载、memory 检索、system prompt 组装、消息持久化
   - 注入 `AgentExecutor` 实例
   - `run()` 内部构建 `AgentContext`（**不含 toolGuard**），委托 `executor.execute()`

5. **旧 AgentRuntime 过渡**
   - `AgentRuntime` 内部委托到 `DefaultAgentRuntime`
   - 保持旧的 `run()` 签名不变（兼容 IM/Scheduler 调用）
   - 内部做参数转换：`AgentRunOptions` → `AgentRunRequest`

6. **Wire up**
   - 在 `AppRouter` 中创建 `DefaultAgenticExecutor` 和 `DefaultAgentRuntime`
   - `AgentController` 改为注入 `AgentRuntime` 接口

**验证标准：**
- [x] 现有 UI 功能完全不受影响（回归测试）
- [x] IM 消息处理正常
- [x] Scheduler 定时任务正常
- [x] 并发安全特性保留（Executor 内部 ToolGuard 隔离）
- [x] 授权流程正常
- [x] 单元测试覆盖 `DefaultAgentRuntime.run()` 的准备阶段
- [x] 单元测试覆盖 `DefaultAgenticExecutor.execute()` 的推理循环

**测试方案：**
```typescript
// Executor 单元测试
const mockLlm: LLMClientFactory = () => createMockLlm({
  responses: [
    { content: '', toolCalls: [{ name: 'read', args: { path: '/test' } }] },
    { content: 'File contents: ...', toolCalls: [] }
  ]
})
const executor = new DefaultAgenticExecutor(mockLlm, settings)
const context = createTestContext({ agent, messages, tools })
const result = await collectAsyncGenerator(executor.execute(context, request))
```

**回滚策略：** 删除 `runtime/` 和 `executor/` 目录，恢复旧 `AgentRuntime.ts`

---

### Phase 3：StaffProfile 迁移与统一（预计 3 天）

**目标：** 统一 Agent/StaffProfile 概念，消除 router.ts 中的三份实例

**改动范围：**

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/common/types/staff.ts` | 修改 | 移除 `@deprecated` 旧字段 |
| `src/main/services/staff/StaffManager.ts` | 修改 | 添加 `migrate()` 函数，处理旧字段映射 |
| `src/main/router.ts` | 重构 | 三份 AgentRuntime 实例合并为一个 |
| `src/main/services/im/` | 修改 | IM 调用路径统一为 `runtime.run(agent, request)` |
| `src/main/services/scheduler/` | 修改 | Scheduler 调用路径统一 |

**详细步骤：**

1. **StaffManager 迁移**
   - 实现 `migrate()` 函数（见 3.2 节）
   - 在 `load()` / `getAll()` 中调用 `migrate()`
   - 写入时使用新字段格式
   - 添加单元测试覆盖迁移逻辑

2. **合并 AgentRuntime 实例**
   - `AppRouter` 中只创建一个 `DefaultAgentRuntime` 实例
   - `AgentController`、`IMServiceManager`、`SchedulerService` 全部注入同一个 `AgentRuntime`
   - IM/Scheduler 调用时构建合适的 `Agent` + `AgentRunRequest`

3. **IM 调用适配**
   - 将 IM 的 `onMessage` 中创建 AgentRuntime 实例的逻辑替换为调用共享的 `runtime.run()`
   - IM 单次消息场景：不传 `sessionId`，history 为空

4. **Scheduler 调用适配**
   - 将 Scheduler 的任务执行逻辑替换为调用共享的 `runtime.run()`
   - 定时任务场景：可传 `sessionId` 维持会话连续性

**验证标准：**
- [x] 已保存的 StaffProfile JSON 文件能正确迁移到新格式
- [x] 新创建的 Staff 使用新字段格式保存
- [x] IM 消息回复正常（单次/多轮）
- [x] Scheduler 定时任务执行正常
- [x] `router.ts` 中只有一个 `AgentRuntime` 实例
- [x] StaffProfile 的 CRUD 操作正常

**数据迁移方案：**
- **不修改磁盘文件**：`migrate()` 只清理内存对象，旧的 JSON 文件保持原样
- **惰性迁移**：每次 `load()` 时检测到旧字段自动转换
- **写回升级**：`save()` 时写入新格式，下次加载不再需要迁移

**回滚策略：** 还原 `router.ts`，恢复三份实例

---

### Phase 4：Controller 瘦身与统一事件（预计 2 天）

**目标：** 消除 Controller 中的业务逻辑，统一事件通道

**改动范围：**

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/controllers/AgentController.ts` | 重构 | 移除 skill 解析/staff 合并逻辑，统一 emit |
| `src/main/controllers/IMController.ts` | 修改 | 类似瘦身 |
| 前端 IPC 监听 | 修改 | 适配新事件格式 |

**详细步骤：**

1. **AgentController 重构**
   - 移除 `onStream` / `onStepUpdate` 双回调，统一为 `emit` 单回调
   - `resolveAgent()` 只做简单的 payload → Agent 转换
   - `buildEmitFn()` 统一处理所有事件类型（见 5.3 节）

2. **前端适配**
   - 合并 `onStream` 和 `onStepUpdate` 监听为统一的 `onAgentEvent`
   - 事件格式对齐 `AgentEvent` 类型定义
   - 授权响应中携带 `runId`

3. **IM Controller 类似瘦身**
   - 移除重复的 Agent 构建逻辑
   - 统一为调用 `runtime.run(agent, request)`

**验证标准：**
- [x] AgentController 行数 < 150 行（当前 ~340 行）
- [x] Controller 中不含 skill 解析、staff 合并逻辑
- [x] 前端功能回归：流式输出、工具步骤展示、授权弹窗
- [x] 无 `onStream` / `onStepUpdate` 双回调残留

**回滚策略：** 还原 `AgentController.ts`，前端恢复双回调

---

### Phase 5：Executor AsyncGenerator 收尾（预计 2 天）

**目标：** 将 Executor 内部实现完全切换到 AsyncGenerator，清理遗留代码

**改动范围：**

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/services/agent/executor/DefaultAgenticExecutor.ts` | 修改 | emit callback → yield event |
| `src/main/services/agent/AgentRuntime.ts` | 删除 | 旧文件，已被 runtime/ 替代 |
| `src/main/services/agent/IAgent.ts` | 删除 | 旧接口，已被 types.ts 替代 |

**详细步骤：**

1. **Executor 内部改造**
   - 将所有 `emit()` 调用替换为 `yield`
   - 确认 `for await...of` 消费端正常工作

2. **清理旧文件**
   - 删除 `src/main/services/agent/AgentRuntime.ts`（已被 `runtime/DefaultAgentRuntime.ts` 替代）
   - 删除 `src/main/services/agent/IAgent.ts`（已被 `types.ts` 替代）
   - 更新所有 import 路径

3. **清理旧类型**
   - 从 `staff.ts` 中移除 `@deprecated` 旧字段
   - 移除 `AgentRunOptions`（已被 `AgentRunRequest` 替代）

4. **补充集成测试**
   - 端到端测试：UI 发送消息 → Controller → Runtime → Executor → LLM → Tool → 返回
   - 并发测试：多 session 同时运行
   - 授权测试：工具授权全流程

**验证标准：**
- [x] `AsyncGenerator<AgentEvent, AgentRunResult>` 完整工作
- [x] 无旧文件残留（`AgentRuntime.ts`、`IAgent.ts` 已删除）
- [x] 无 `@deprecated` 标记残留
- [x] 集成测试全部通过
- [x] `tsc --noEmit` 无错误无警告

**回滚策略：** 恢复 `AgentRuntime.ts` 和 `IAgent.ts`（从 git 历史恢复）

---

## 9. 风险评估与应对

### 9.1 高风险项

| 风险 | 影响 | 概率 | 应对措施 |
|---|---|---|---|
| Phase 1 并发修复引入新 Bug | 多 session 互相干扰 | 低 | 添加并发集成测试，用 Promise.all 模拟并发 |
| StaffProfile 数据迁移丢失字段 | 已保存的数字员工配置异常 | 中 | migrate() 保留所有旧字段作为 fallback，不修改磁盘文件 |
| IM/Scheduler 调用路径改造影响线上 | 消息不回复/定时任务不执行 | 中 | Phase 3 中逐个替换，先 IM 后 Scheduler，每步验证 |
| AsyncGenerator 兼容性问题 | Electron 环境下异步行为异常 | 低 | Phase 2 初期用 callback 实现，Phase 5 才切换 Generator |

### 9.2 降低风险的原则

1. **每步可合并**：每个 Phase 的代码都可以独立合并到 master，不破坏现有功能
2. **渐进式迁移**：先新增新代码，再逐步替换旧代码，最后删除旧代码
3. **旧文件保留**：Phase 2-4 中旧文件保留但委托到新实现，Phase 5 才删除
4. **数据不丢失**：StaffProfile 迁移只处理内存对象，不修改磁盘文件

---

## 10. 测试策略

### 10.1 单元测试（每个 Phase 必须补充）

| 组件 | 测试重点 | Phase |
|---|---|---|
| `Agent` / `StaffProfile` | 类型兼容性、字段迁移 | 0 |
| `ToolGuard` | 并发安全、resolve 时序、内存泄漏 | 1 |
| `DefaultAgentRuntime.run()` | skill 解析、tool 过滤、history 加载、memory 检索 | 2 |
| `DefaultAgenticExecutor.execute()` | 推理循环、tool 执行、错误处理、MAX_LOOPS | 2 |
| `StaffManager.migrate()` | 旧字段→新字段映射、空值处理 | 3 |
| `ToolRegistry.filter()` | 精确匹配、通配符匹配、空列表 | 0 |
| `extractTextFromPrompt()` | string/ContentPart[] 输入 | 0 |

### 10.2 集成测试

| 场景 | 测试方式 | Phase |
|---|---|---|
| UI 聊天全流程 | 启动 Electron，发送消息，验证回复 | 每阶段 |
| 多 session 并发 | 两个窗口同时发送消息 | 1 |
| 授权流程 | 触发高危工具 → 弹窗 → 确认/拒绝 | 1 |
| IM 消息回复 | 模拟 IM 消息，验证 Agent 回复 | 3 |
| 定时任务执行 | 创建定时任务，等待触发，验证结果 | 3 |
| 数字员工对话 | 选择数字员工，发送消息，验证使用员工配置 | 3 |

### 10.3 手动验证清单（每个 Phase 结束后）

- [ ] 新建会话，发送简单消息，验证正常回复
- [ ] 发送需要工具调用的消息（如读文件），验证工具执行和结果
- [ ] 触发需要授权的工具（如 bash），验证授权弹窗和确认/拒绝
- [ ] 选择数字员工对话，验证使用员工的模型和人设
- [ ] 中断正在进行的对话（AbortController），验证正常停止
- [ ] 切换模型设置，验证下次对话使用新模型

---

## 11. 时间线与里程碑

| 里程碑 | Phase | 预计时间 | 交付物 |
|---|---|---|---|
| M1 - 类型基础就绪 | Phase 0 | 第 1-2 天 | 新类型定义文件，编译通过 |
| M2 - 并发安全修复 | Phase 1 | 第 3-4 天 | 并发 Bug 修复，可独立发布 |
| M3 - 三层拆分完成 | Phase 2 | 第 5-7 天 | Runtime + Executor 层，旧代码保留 |
| M4 - 统一调用路径 | Phase 3 | 第 8-10 天 | 三份实例合并，StaffProfile 迁移 |
| M5 - Controller 瘦身 | Phase 4 | 第 11-12 天 | Controller 纯薄壳，统一事件 |
| M6 - 清理收尾 | Phase 5 | 第 13-14 天 | 旧文件删除，全量测试通过 |

**建议节奏：** 每完成一个 Phase 合并一次 master，确保主线始终可用。

---

## 附录 A：ToolGuard 设计决策

### 为什么 ToolGuard 在 Executor 内部而不是 AgentContext？

这是本次重构的核心设计决策之一。以下是详细解释：

#### 1. AgentContext 是纯数据容器

```typescript
export interface AgentContext {
  runId: string
  agent: Agent
  messages: ChatMessage[]
  tools: ToolRegistry
  signal?: AbortSignal
  emit?: (event: AgentEvent) => void
  // 注意：没有 toolGuard
}
```

Context 的职责是**传递数据**，而非**承载行为**。如果在 Context 中放入 ToolGuard：
- Executor 的 `execute()` 方法签名会被污染
- 不同 Executor 实现（如 PlanThenActExecutor）可能需要不同的授权策略
- ToolGuard 的实现细节会泄漏到接口定义

#### 2. 并发安全由 Executor 保证

每个 Executor 实例持有独立的 ToolGuard，天然隔离：

```
会话 A: run() → ExecutorA → toolGuardA
会话 B: run() → ExecutorB → toolGuardB
```

不需要 `activeGuards` Map 来管理并发，因为每个 `run()` 调用创建独立的 Executor 实例。

#### 3. 授权事件通过 emit 传递

```
Executor 内部：
  toolGuard.evaluateRequest() → emit('auth_request') + Promise 等待

Runtime 中：
  for await (const event of stream) {
    if (event.type === 'auth_request') {
      const approved = await this.waitForUserDecision(event.payload)
      stream.next(approved)  // 传回 Executor
    }
  }
```

授权决策通过 `stream.next(approved)` 直接传回 Generator，不需要 Runtime 额外桥接。

#### 4. 可替换性的好处

如果未来需要不同的授权策略，只需创建新的 Executor：

```typescript
class StrictAgenticExecutor implements AgentExecutor {
  // 强制所有工具都授权
}

class RelaxedAgenticExecutor implements AgentExecutor {
  // 只对高风险工具授权
}

class NoAuthExecutor implements AgentExecutor {
  // 完全不授权（内部测试用）
}
```

这些 Executor 可以在内部持有不同配置的 ToolGuard，而不需要修改 Context 接口。

### 总结

| 设计决策 | 选择 | 理由 |
|---|---|---|
| ToolGuard 放哪里 | Executor 内部 | Context 应是纯数据，Executor 是行为载体 |
| 并发安全机制 | 每个 run() 创建独立 Executor | 天然隔离，无需 Map 管理 |
| 授权决策传递 | emit 事件 + stream.next() | 直接通道，无需 Runtime 桥接 |
| 可替换性 | Executor 接口可持有不同 ToolGuard | 灵活支持不同授权策略 |

