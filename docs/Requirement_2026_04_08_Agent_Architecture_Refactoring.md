# Agent 架构重构技术方案

> 日期：2026-04-08
> 状态：草案
> 核心原则：Agent（是什么）→ Runtime（怎么跑）→ Executor（怎么想）
> 更新：补充 Memory 子系统设计（第 11 章）、授权机制改为事件驱动（第 13 章）

---

## 1. 背景与动机

### 1.1 现状问题

当前 `AgentRuntime.ts` 是一个约 650 行的单体类，承担了过多职责：

| 职责 | 当前位置 | 问题描述 |
|---|---|---|
| Agent 配置解析 | `createChatModel()` | 配置逻辑硬编码在运行时内部，且 Runtime 不应直接调用模型 |
| 运行生命周期管理 | `run()` | 与推理策略混合在同一方法 |
| LLM 推理循环 | `run()` 内 while 循环 | 无法替换为其他推理策略（如单轮、ReAct、Plan-then-Act） |
| 工具执行 | `handleToolCalls()` | 紧耦合在 Runtime 内，无法独立测试 |
| Prompt 构建 | `PromptBuilder`（已提取） | — |
| 状态机 / 授权 / 上下文 | 散落在 `run()` 各处 | 回调注入混乱 |

**具体痛点：**

1. **并发隐患** — `AgentController` 创建单例 `AgentRuntime`，但每次 `run()` 内部重建 `sessionStateManager` / `sessionToolGuard` 并覆盖实例属性（`AgentRuntime.ts:145-163`）
2. **Controller 混入业务逻辑** — skill 解析和 staff profile 合并逻辑在 `AgentController.ts:217-261`，不应属于 IPC 层
3. **事件输出通道割裂** — `onStream`、`onStepUpdate`、`emit` 三个 callback 各自独立缓冲
4. **StaffProfile 与 Agent 概念重叠** — 两者描述同一事物但使用独立接口
5. **`AgentRunOptions` 混合关注点** — 配置（model, temperature）和运行时（signal, emit, history）混在同一个接口

### 1.2 目标

将单体 `AgentRuntime` 拆分为三层：

```
Agent         — 纯配置对象（不可变）
AgentRuntime  — 运行生命周期管理（准备 → 执行 → 后处理）
AgentExecutor — 推理策略（可替换）
```

辅以：

```
AgentContext  — 每次运行的上下文容器
```

---

## 2. 类型定义

### 2.1 Agent（配置对象）

```typescript
// src/common/types/agent.ts

export interface Agent {
  id: string
  name: string

  // Brain
  modelId: string                // 格式: 'provider/model'，如 'openai/gpt-4o', 'anthropic/claude-sonnet-4-6'
  systemPrompt?: string
  temperature?: number

  // Capabilities
  skillIds?: string[]
  allowedTools?: string[]      // undefined = 全部工具，显式指定 = 白名单（内置 + MCP 统一控制）
}
```

**设计决策：**
- `Agent` 是不可变配置，不包含任何运行时状态
- `tools` 不在 `Agent` 中 — 工具列表由 `skillIds` + `allowedTools` 在运行时动态解析
- `id` 用于关联 StaffProfile 和运行日志
- `modelId` 合并了 `provider` + `model` — 避免无效组合（如 `provider: 'openai'` + `model: 'claude-sonnet-4-6'`），由 `LLMClient` 内部按 `/` 拆分
- **不含 memory 相关字段** — 记忆是运行时资源，不是 Agent 配置。由 Runtime 根据 `agent.id` 决定存储位置和是否启用

### 2.2 StaffProfile（Agent 超集）

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

**迁移说明：**
- 当前 `StaffProfile` 字段需要映射：`provider` + `model` → `modelId`，`persona` → `systemPrompt`，`temperature` 保留，`memoryFile` 移除，`allowedMcpServerIds` → `allowedTools`
- `memoryFile` 移除后，存储路径由 Runtime 推导：`memory/agent_{id}.md`
- 重构后 `StaffProfile extends Agent`，仅增加 UI 展示和持久化字段
- `persona` 字段重命名为 `systemPrompt`（通过兼容层过渡）

### 2.3 AgentContext（运行上下文）

```typescript
// src/main/services/agent/types.ts

export interface AgentContext {
  runId: string

  // Agent 配置（含 modelId，Executor 传给 LLMClient）
  agent: Agent

  // 组装好的消息（记忆、skills 已全部注入到 system prompt）
  messages: ChatMessage[]

  // 工具执行能力
  tools: ToolRegistry

  // 控制
  signal?: AbortSignal
  emit?: (event: AgentEvent) => void
}
```

**设计决策：**
- **只包含 Executor 需要的数据，不包含基础设施**
- `agent` — 轻量配置对象，含 `modelId`/`temperature`，Executor 传给 LLMClient
- `messages` — 由 Runtime 从 Agent 配置、记忆、skills 组装好的完整对话，Executor 直接消费
- `tools` — 已根据 `allowedTools` 过滤的工具集（内置 + MCP 统一控制）
- **不在 Context 中的内容及其理由：**
  - `chatModel` / `LLMClient` — Executor 构造时注入，不通过 Context 传递。LLM 调用是 Executor 的职责，不是 Runtime 的
  - `skills` — Runtime 已注入到 system prompt，Executor 不需要
  - `promptBuilder` — Runtime 已完成 prompt 构建，Executor 不需要
  - `knowledgeMemories` — Runtime 已注入到 system prompt，Executor 不需要
  - 授权 — 通过事件机制处理（emit / yield），详见第 13 章

### 2.4 AgentRunRequest / AgentRunResult

```typescript
export interface AgentRunRequest {
  sessionId?: string
  prompt: string | ContentPart[]
  history?: ChatMessage[]
  signal?: AbortSignal
  emit?: (event: AgentEvent) => void

  // 运行时覆盖（覆盖 Agent 配置的默认值）
  skillIds?: string[]        // 覆盖 Agent.skillIds
  toolNames?: string[]       // 限制本次可用的工具（白名单）
}

export interface AgentRunResult {
  finalAnswer: string
  steps: AgentStep[]
  newMessages: ChatMessage[]
}
```

**覆盖优先级：**

```
request.skillIds   >  agent.skillIds            >  全局默认 skills
request.toolNames  >  agent.allowedTools  >  全部工具
```

不指定时使用 Agent 默认配置；指定时用 request 值覆盖。这样同一个 Agent 配置可以在不同请求下使用不同的 skills/tools。

### 2.5 AgentEvent（保持现有定义）

```typescript
// src/common/types/agentEvents.ts — 无变更
// 保持现有的联合类型定义
```

### 2.6 AgentStep（保持现有定义）

```typescript
// src/common/types/chat.ts — 无变更
```

---

## 3. 接口定义

### 3.1 AgentRuntime

```typescript
// src/main/services/agent/runtime/AgentRuntime.ts

export interface AgentRuntime {
  run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult>
}
```

**职责：**
1. 解析 `Agent.skillIds` → 加载 `Skill[]`
2. 根据 `Agent.allowedTools` 过滤工具集（内置 + MCP 统一控制）
3. 加载 Memory：根据 `agent.id` 确定存储路径，检索知识记忆
4. 构建 system prompt（调用 `PromptBuilder`，注入知识记忆）
5. 组装 `messages`
6. 构建 `AgentContext`
7. 委托 `AgentExecutor.execute(context, request)`
8. 桥接授权事件（Controller → ToolGuard.resolve）
9. 后处理：记录 usage、整理 steps、返回 `AgentRunResult`

**不包含：**
- 推理循环逻辑（while loop）
- LLM 调用逻辑（由 Executor 通过注入的 LLMClient 负责）
- 工具执行逻辑
- 授权判断逻辑（由 ToolGuard 在 Executor 内部处理）

### 3.2 AgentExecutor

```typescript
// src/main/services/agent/executor/AgentExecutor.ts

export interface AgentExecutor {
  execute(
    context: AgentContext,
    request: AgentRunRequest
  ): AsyncGenerator<AgentEvent, AgentRunResult>
}
```

**设计决策：**
- 使用 `AsyncGenerator` 而非 `Promise` — 事件流是天然流式输出，比 emit callback 更清晰
- Phase 5 之前可以先用内部 emit + 返回 Promise 的方式实现，接口保持兼容
- 默认实现为 `DefaultAgenticExecutor`（当前 while 循环策略）

### 3.3 Tool / ToolRegistry（保持现有接口）

```typescript
// src/common/types/tool.ts — 无变更

export interface ITool {
  getDefinition(): ToolDefinition
  execute(args: Record<string, any>, signal?: AbortSignal, onStream?: (chunk: string) => void): Promise<ToolExecutionResult>
  requireConfirmation?: boolean
}
```

### 3.4 Memory（保持现有接口）

```typescript
// src/main/services/memory/MemoryStore.ts — 无变更
```

---

## 4. 实现设计

### 4.1 AgentRuntime 实现

```typescript
// src/main/services/agent/runtime/DefaultAgentRuntime.ts

export class DefaultAgentRuntime implements AgentRuntime {
  constructor(
    private settings: AppSettings,
    private toolRegistry: ToolRegistry,
    private knowledgeMemory: KnowledgeMemory,
    private usageManager: UsageManager,
    private executor: AgentExecutor   // Executor 内部已持有 LLMClient
  ) {}

  async run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult> {
    const runId = request.sessionId || generateId()

    // === Runtime 只做调度和组装，不做推理和模型调用 ===

    // 1. 合并 Skills（request > agent > 全局默认）
    const effectiveSkillIds = request.skillIds ?? agent.skillIds
    const skills = this.resolveSkills(effectiveSkillIds)

    // 2. 合并 Tools（request > agent > 全部工具）
    const effectiveToolNames = request.toolNames ?? agent.allowedTools
    const tools = this.filterTools(effectiveToolNames)

    // 3. 加载 Memory（Runtime 决定，不归 Agent 管）
    const memories = await this.knowledgeMemory.search(
      typeof request.prompt === 'string' ? request.prompt : '',
      { agentId: agent.id }
    )

    // 4. 构建 PromptBuilder，注入 skills + memories → 产出 system prompt
    const promptBuilder = new PromptBuilder({
      defaultBasePrompt: agent.systemPrompt || this.settings.systemPrompt
    })
    const systemPrompt = promptBuilder.buildSystemPrompt({
      workspacePath: this.settings.workspacePath,
      skills,
      language: this.settings.language,
      knowledgeMemories: memories
    })

    // 5. 组装完整的 messages
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(request.history || []),
      { role: 'user', content: request.prompt }
    ]

    // 6. 构建 Context（不含 chatModel，LLM 调用是 Executor 的职责）
    const context: AgentContext = {
      runId,
      agent,
      messages,
      tools,
      signal: request.signal,
      emit: request.emit
    }

    // 7. 委托 Executor
    const result = await this.executor.execute(context, request)

    // 8. 后处理
    this.recordUsage(runId, result)

    return result
  }
}
```

**组装示例（应用启动时）：**

```typescript
// main/index.ts 或 DI 容器

const llmClient = new DefaultLLMClient(settings.llm)  // LLM 调用唯一入口
const executor = new DefaultAgenticExecutor(llmClient) // Executor 持有 LLMClient
const toolRegistry = new ToolRegistry()
const knowledgeMemory = new FileKnowledgeMemory(memoryStore)

const runtime = new DefaultAgentRuntime(
  settings,           // workspacePath, language, systemPrompt
  toolRegistry,
  knowledgeMemory,
  usageManager,
  executor            // Executor 内部已持有 LLMClient，Runtime 不碰模型
)
```

### 4.2 DefaultAgenticExecutor 实现

```typescript
// src/main/services/agent/executor/DefaultAgenticExecutor.ts

export class DefaultAgenticExecutor implements AgentExecutor {

  constructor(private llm: LLMClient) {}  // LLMClient 构造时注入

  async *execute(
    context: AgentContext,
    request: AgentRunRequest
  ): AsyncGenerator<AgentEvent, AgentRunResult> {
    const { messages, tools, signal, agent } = context
    const stateManager = new AgentStateManager(/* ... */)
    const toolGuard = new ToolGuard(context.emit)

    const newMessages: ChatMessage[] = []
    const steps: AgentStep[] = []

    let loopCount = 0
    const MAX_LOOPS = 50

    try {
      while (loopCount++ < MAX_LOOPS) {
        signal?.throwIfAborted()

        yield { type: 'turn_start', payload: { turnIndex: loopCount } }

        // 上下文优化（Summarizer 也使用 this.llm）
        const optimized = await this.optimizeContext(messages)

        // LLM Turn — 通过注入的 LLMClient 调用
        stateManager.transition(AgentState.Thinking)
        const llmResult = yield* this.executeLlmTurn(
          optimized, tools, stateManager, context
        )

        messages.push(llmResult.assistantMessage)
        newMessages.push(llmResult.assistantMessage)

        // 无工具调用 → 结束
        if (llmResult.toolCalls.length === 0) {
          yield { type: 'agent_end', payload: { totalSteps: steps.length, newMessages } }
          return {
            finalAnswer: llmResult.content,
            steps,
            newMessages
          }
        }

        // 工具执行
        yield* this.executeTools(
          llmResult.toolCalls, tools, messages, newMessages,
          steps, stateManager, toolGuard, context
        )

        yield { type: 'turn_end', payload: { turnIndex: loopCount, hadToolCalls: true } }
      }

      // 超过最大步数
      return this.handleMaxSteps(steps, newMessages)
    } catch (error) {
      return this.handleError(error, steps, newMessages, stateManager, context)
    }
  }
}
```

### 4.3 AgentController 调整

重构后的 Controller 变得更轻量：

```typescript
// src/main/controllers/AgentController.ts

export class AgentController {
  private runtime: AgentRuntime

  async handleStart(event, payload: AgentStartRequest): Promise<AgentStartResponse> {
    // 1. 解析 Agent 配置
    const agent = this.resolveAgent(payload)
    // ↑ 内部逻辑：如果有 staffId，从 StaffManager 获取 StaffProfile（即 Agent）

    // 2. 构建 Request（传递运行时覆盖参数）
    const request: AgentRunRequest = {
      sessionId: payload.sessionId || (await this.sessionManager.createSession()).id,
      prompt: payload.prompt,
      signal: controller.signal,
      emit: this.buildEmitFn(),
      skillIds: payload.options?.skills   // 用户指定的 skill 覆盖
    }

    // 3. 运行
    const result = await this.runtime.run(agent, request)

    // 4. 持久化
    await this.persistMessages(request.sessionId, result.newMessages)

    return { success: true, sessionId: request.sessionId }
  }

  private resolveAgent(payload: AgentStartRequest): Agent {
    // 默认 Agent 来自全局 settings
    const base: Agent = {
      id: 'default',
      name: 'Geni',
      modelId: this.buildModelId(this.settings),
      systemPrompt: this.settings.systemPrompt,
      temperature: this.settings.llm.temperature
    }

    // 如果指定了 staffId，用 StaffProfile 覆盖
    const staffId = payload.options?.staffId
    if (staffId) {
      const profile = this.staffManager.get(staffId)
      if (profile) return profile  // StaffProfile extends Agent
    }

    // 如果指定了 model，覆盖
    if (payload.options?.model) {
      base.modelId = payload.options.model
    }

    return base
  }
}
```

**关键变化：**
- skill 解析逻辑从 Controller 移入 Runtime
- staff profile 合并逻辑变为简单的 `resolveAgent()`
- Controller 不再直接操作 `toolRegistry.getTools()`

---

## 5. 目标目录结构

```
src/main/services/agent/
├── types.ts                        # Agent, AgentContext, AgentRunRequest, AgentRunResult
│
├── runtime/
│   ├── AgentRuntime.ts             # 接口定义
│   └── DefaultAgentRuntime.ts      # 默认实现（生命周期管理）
│
├── executor/
│   ├── AgentExecutor.ts            # 接口定义
│   └── DefaultAgenticExecutor.ts   # 默认实现（while-loop 推理策略）
│
├── context/
│   ├── PromptBuilder.ts            # （保持不变）
│   ├── ContextManager.ts           # （保持不变）
│   └── Summarizer.ts               # （保持不变）
│
├── guard/
│   ├── ToolGuard.ts                # （保持不变）
│   └── ErrorClassifier.ts          # （保持不变）
│
├── state/
│   └── AgentStateManager.ts        # （保持不变）
│
├── policy/
│   ├── RetryPolicy.ts              # （保持不变）
│   └── TokenCounter.ts             # （保持不变）
│
└── index.ts                        # 统一导出
```

**文件迁移映射：**

| 当前文件 | 迁移目标 |
|---|---|
| `AgentRuntime.ts` | 拆分 → `DefaultAgentRuntime.ts` + `DefaultAgenticExecutor.ts` |
| `IAgent.ts` | 拆分 → `types.ts`（AgentRunResult） + `runtime/AgentRuntime.ts`（接口） |
| `PromptBuilder.ts` | 移入 `context/` |
| `ContextManager.ts` | 移入 `context/` |
| `Summarizer.ts` | 移入 `context/` |
| `ToolGuard.ts` | 移入 `guard/` |
| `ErrorClassifier.ts` | 移入 `guard/` |
| `RetryPolicy.ts` | 移入 `policy/` |
| `TokenCounter.ts` | 移入 `policy/` |
| `state/AgentState.ts` | 保持不变 |

---

## 6. 分阶段实施计划

### Phase 1：类型定义（低风险）

**目标：** 定义新接口，不改动运行时代码

**任务清单：**
- [ ] 创建 `src/main/services/agent/types.ts`，定义 `Agent`, `AgentContext`（含 agent/messages/tools/signal/emit，不含 chatModel）, `AgentRunRequest`
- [ ] 更新 `src/common/types/agent.ts`，导出 `Agent` 接口
- [ ] 更新 `src/common/types/staff.ts`，让 `StaffProfile extends Agent`
- [ ] 添加兼容层：`StaffProfile.persona` → `StaffProfile.systemPrompt`（保留 persona 作为别名）
- [ ] 更新所有引用 `StaffProfile` 的代码，适配字段名变化

**验证标准：**
- 编译通过，无运行时行为变化
- 现有测试全部通过

**预计涉及文件：** ~10 个

---

### Phase 2：提取 AgentExecutor（中风险）

**目标：** 将 `AgentRuntime.run()` 的 while 循环拆分为独立的 Executor

**任务清单：**
- [ ] 创建 `executor/AgentExecutor.ts` 接口
- [ ] 创建 `executor/DefaultAgenticExecutor.ts`，从 `AgentRuntime.run()` 迁移以下方法：
  - `executeLlmTurn()` → Executor 私有方法
  - `handleToolCalls()` → Executor 私有方法
  - `checkAuthorization()` → Executor 私有方法
  - `handleMaxSteps()` → Executor 私有方法
  - `handleError()` → Executor 私有方法
  - `optimizeContext()` → Executor 私有方法
- [ ] `AgentRuntime.run()` 改为：准备 context → 调用 `executor.execute()` → 后处理
- [ ] Executor 内部暂时使用 emit callback（不引入 AsyncGenerator），降低迁移风险

**验证标准：**
- Agent 行为不变（同样的输入产生同样的输出）
- 现有测试全部通过
- `AgentRuntime.run()` 从 ~120 行降至 ~30 行

**预计涉及文件：** ~5 个（新增 2，修改 3）

---

### Phase 3：下沉 Controller 逻辑到 Runtime（中风险）

**目标：** 清理 `AgentController`，将业务逻辑移入 `DefaultAgentRuntime`

**任务清单：**
- [ ] 将 `AgentController.resolveAgent()` 逻辑移入 `DefaultAgentRuntime`
- [ ] 将 skill 解析逻辑（`getSkillObjectsByIds`）移入 Runtime
- [ ] 将 tool 过滤逻辑移入 Runtime
- [ ] `AgentController.handleStart()` 精简为：IPC 桥接 + throttling + abort 管理
- [ ] 移除 `AgentRuntime` 的全局 `setStateChangeCallback()` / `setAuthorizationCallback()` setter 方法
- [ ] 所有回调统一通过 `AgentRunRequest` 传入

**验证标准：**
- IPC 通信行为不变
- `AgentController` 不再直接依赖 `ToolController`、`StaffManager`
- 授权流程（UI 弹窗确认）正常工作

**预计涉及文件：** ~8 个

---

### Phase 4：目录重组（低风险）

**目标：** 将文件移入新的目录结构

**任务清单：**
- [ ] 创建 `context/`, `guard/`, `policy/` 子目录
- [ ] 移动文件到对应目录
- [ ] 更新所有 import 路径
- [ ] 创建 `index.ts` 统一导出
- [ ] 清理旧的 `IAgent.ts`（内容已分散到 `types.ts` 和 `runtime/AgentRuntime.ts`）

**验证标准：**
- 编译通过
- 所有测试通过
- 无悬空 import

**预计涉及文件：** ~20 个（主要是 import 路径变更）

---

### Phase 5：emit → AsyncGenerator 事件流（高风险）

**目标：** Executor 接口从 `emit` callback 迁移为 `AsyncGenerator`

**前置条件：** Phase 2-4 全部完成，Executor 接口已稳定

**任务清单：**
- [ ] `AgentExecutor.execute()` 返回类型改为 `AsyncGenerator<AgentEvent, AgentRunResult>`
- [ ] Executor 内部所有 `context.emit?.()` 改为 `yield`
- [ ] `DefaultAgentRuntime.run()` 改为 `for await (const event of executor.execute(...))` 消费事件
- [ ] `AgentController` 统一事件缓冲：移除 `streamBuffer` / `pendingSteps` 分离缓冲，改为单一 `eventQueue`
- [ ] 移除 `onStream` / `onStepUpdate` 回调参数
- [ ] 更新测试：从 mock callback 改为收集 generator 输出

**AsyncGenerator 事件流优势：**

| 维度 | emit callback | AsyncGenerator |
|---|---|---|
| 控制方向 | 生产者推，消费者被动接 | 消费者拉，按自己节奏取 |
| 事件 + 结果 | 两条路径（callback + return） | 一条路径（yield + return） |
| 背压 | 无（可能堆积） | 天然支持（消费者暂停即暂停） |
| 取消 | 需 signal 穿透 | `break` 或 `stream.return()` |
| 测试 | 需要 mock emit | `for await` 直接收集 |
| 中间件 | 只能套 wrapper | `yield*` 链式组合 |

**验证标准：**
- 所有事件类型通过 generator 正确输出
- IPC throttling 行为不变
- 授权流程正常
- 错误传播通过 `generator.throw()` 正确处理

**预计涉及文件：** ~15 个

---

## 7. 风险与缓解

### 7.1 并发安全

**风险：** 重构过程中 `AgentRuntime` 从单例变为可能的 per-session 实例

**缓解：** `DefaultAgentRuntime` 设计为无状态（不保存 session-specific 数据），所有可变状态在 Executor 局部变量中。单例安全。

### 7.2 StaffProfile 兼容性

**风险：** 字段重命名影响持久化文件和序列化

**缓解：**
- `provider` + `model` → `modelId`：添加 `get modelId() { return \`${this.provider}/${this.model}\` }` 兼容层
- `persona` → `systemPrompt`：添加 `get systemPrompt() { return this.persona }` 兼容层
- `memoryFile` → 移除：Runtime 根据 `agent.id` 自动推导路径
- 持久化格式保持旧字段名不变
- 在 TypeScript 接口层统一使用新字段名

### 7.3 授权流程变更

**风险：** 授权从 callback 改为事件驱动，传递路径变更可能导致 IPC 桥接中断

**缓解：**
- Phase 1-4：ToolGuard 内部通过 `emit('auth_request')` 发出事件，内部用 Promise 等待 resolve
- Runtime 持有 ToolGuard 引用，Controller 调用 `runtime.resolveAuth(requestId, approved)` 完成闭环
- Phase 5：AsyncGenerator 的 `yield` + `generator.next(approved)` 天然支持暂停/恢复，无需额外机制
- 详见第 13 章完整授权方案

### 7.4 AsyncGenerator 错误处理

**风险：** Generator 的 `throw()` 方法行为与 try-catch 不同，可能导致未捕获异常

**缓解：**
- Phase 5 前先在单独的分支上做 POC 验证
- Executor 内部使用 try-catch 包装，将错误转为 `yield { type: 'error' }` 事件
- 不依赖 `generator.throw()` 进行错误传播

---

## 8. 未来扩展性

本次重构完成后，可以轻松支持以下场景：

### 8.1 多种推理策略

```typescript
// 单轮对话（无工具）
class SingleTurnExecutor implements AgentExecutor { ... }

// ReAct 推理
class ReActExecutor implements AgentExecutor { ... }

// Plan-then-Act
class PlanThenActExecutor implements AgentExecutor { ... }

// 按需选择
const executor = agent.requiresPlanning
  ? new PlanThenActExecutor()
  : new DefaultAgenticExecutor()
```

### 8.2 Agent 模板化

```typescript
// Agent 作为可分享的配置文件
const codeReviewer: Agent = {
  id: 'code-reviewer',
  name: 'Code Reviewer',
  modelId: 'anthropic/claude-sonnet-4-6',
  systemPrompt: 'You are a code reviewer...',
  skillIds: ['code-review', 'git-ops']
}
```

### 8.3 多 Agent 协作

```typescript
// Runtime 支持嵌套执行
const result = await runtime.run(orchestratorAgent, {
  prompt: 'Review this PR',
  // orchestrator 内部可以调用其他 Agent
})
```

---

## 9. 核心概念速查

```
┌─────────────────────────────────────────────────┐
│                   Agent                         │
│  纯配置：modelId, systemPrompt, skillIds, tools │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│               AgentRuntime                      │
│  调度组装：解析 skills → 加载 memory → 组装 ctx │
│           → 调用 Executor → 后处理              │
│  ❌ 不调用 LLM                                  │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│           AgentExecutor (持有 LLMClient)         │
│  推理策略：LLM Turn → Tool Call → Loop          │
│           可替换（Default / ReAct / Plan）      │
│           唯一调用 LLM 的层                      │
└─────────────────────────────────────────────────┘

         ┌─── AgentContext ─────┐
         │  Executor 的运行上下文 │
         │  agent, messages,     │
         │  tools, signal        │
         └───────────────────────┘
```

---

## 10. 实施优先级建议

```
Phase 1 (类型定义)        ← 先做，无风险，为后续铺路
   ↓
Phase 2 (提取 Executor)   ← 核心拆分，最关键的一步
   ↓
Phase 3 (下沉 Controller) ← 清理架构，并行于 Phase 2 可做
   ↓
Phase 4 (目录重组)        ← 纯文件移动，随时可做
   ↓
Phase 5 (AsyncGenerator)  ← 最后做，等接口稳定后
```

Phase 2 和 Phase 3 可以并行推进。Phase 4 可以穿插在任意阶段。Phase 5 建议作为独立的里程碑。

---

## 11. Memory 子系统设计

### 11.1 设计原则

**核心判断：现有实现已覆盖 80% 需求，重构重点是增强而非重写。**

当前已有的 Memory 相关组件：

| 组件 | 文件 | 职责 |
|---|---|---|
| `MemoryStore` | `src/main/services/memory/MemoryStore.ts` | 长期记忆持久化（Markdown 文件） |
| `SessionManager` | `src/main/services/session/SessionManager.ts` | 会话消息存储 |
| `ContextManager` | `src/main/services/agent/ContextManager.ts` | Token 预算管理 + 滑动窗口裁剪 |
| `Summarizer` | `src/main/services/agent/Summarizer.ts` | 上下文压缩（LLM 摘要） |
| `PromptBuilder` | `src/main/services/agent/PromptBuilder.ts` | 记忆注入到 System Prompt |

### 11.2 Memory 分层策略

不采用四层（Working / Short-term / Long-term / Episodic），压缩为 **两层 + 两个辅助能力**：

```
四层分类                         实际归属
──────────                      ──────────────────────────────
Working Memory     ─┐           messages[] — 不是独立组件
                   ├─→  会话记忆  SessionManager + ContextManager
Short-term Memory  ┘            （已有实现，保持不变）

Long-term Memory   ───→ 知识记忆  MemoryStore → 增强 KnowledgeMemory
                                 （当前 80% 满足，加搜索能力即可）

Episodic Memory    ───→ 不单独做  用 KnowledgeMemory + metadata 标记
                                 （需要时再拆分）
```

**不拆 Working Memory 的理由：** Working Memory 就是 LLM API 的 `messages[]` 入参。它不是独立的 Memory 组件，不需要 `load()` / `save()` 接口。

**不拆 Episodic Memory 的理由：** 它的数据结构（task + result + steps）本质上就是一条 Knowledge，可以用 `metadata: { type: 'episode' }` 标记。等真正需要语义检索历史任务时再拆出独立接口。

### 11.3 接口设计

按职责分两个接口，不强求统一：

```typescript
// src/main/services/memory/types.ts

/**
 * 会话记忆 — 管理对话上下文
 * 当前由 SessionManager + ContextManager + Summarizer 承担
 */
export interface ConversationMemory {
  load(sessionId: string): Promise<ChatMessage[]>
  save(sessionId: string, messages: ChatMessage[]): Promise<void>
}

/**
 * 知识记忆 — 存取知识片段
 * 当前由 MemoryStore 承担，需增强搜索能力
 */
export interface KnowledgeMemory {
  search(query: string, options?: KnowledgeSearchOptions): Promise<MemoryChunk[]>
  add(text: string, metadata?: Record<string, any>): Promise<void>
  remove(id: string): Promise<void>
}

export interface KnowledgeSearchOptions {
  agentId?: string
  k?: number  // 返回条目数，默认 5
}

export interface MemoryChunk {
  id: string
  text: string
  score: number
  metadata?: Record<string, any>
}
```

**不统一为单一 `Memory` 接口的理由：** `load` 返回 `ChatMessage[]` 对会话记忆合理，但对知识记忆不合理。强求统一签名会导致接口语义不清。

### 11.4 现有组件的归属

不引入 `MemoryManager` 统一管理类，由 `DefaultAgentRuntime` 直接协调：

```
DefaultAgentRuntime.run()
  │
  ├── ConversationMemory.load()     ← SessionManager.getHistory()
  │                                    ContextManager.prune()
  │                                    Summarizer.summarize()
  │
  ├── KnowledgeMemory.search()      ← MemoryStore（增强搜索）
  │
  ├── PromptBuilder.buildSystemPrompt()  ← 注入 KnowledgeMemory 结果
  │
  ├── Executor.execute()            ← 消费组装好的 messages
  │
  ├── ConversationMemory.save()     ← SessionManager.addMessage()
  │
  └── KnowledgeMemory.add()         ← memorize 工具触发
```

**不引入 MemoryInjector 的理由：** `PromptBuilder.buildMemory()` 已实现注入逻辑（`PromptBuilder.ts:187-207`），不需要额外抽象。

**不引入 MemoryCompressor 的理由：** `Summarizer` 已实现压缩逻辑，且支持分块摘要。

### 11.5 知识记忆实现路线

#### 第一步：基于文件的搜索增强（立即可做）

```typescript
// src/main/services/memory/FileKnowledgeMemory.ts

export class FileKnowledgeMemory implements KnowledgeMemory {
  constructor(private store: MemoryStore) {}

  async search(query: string, options?: KnowledgeSearchOptions): Promise<MemoryChunk[]> {
    const content = this.store.read()
    if (!content) return []

    // 按条目分割
    const entries = this.parseEntries(content)

    // 关键词 + 标题匹配评分
    return entries
      .map(entry => ({
        id: entry.title,
        text: entry.content,
        score: this.computeRelevance(query, entry),
        metadata: { title: entry.title }
      }))
      .filter(chunk => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.k || 5)
  }

  async add(text: string, metadata?: Record<string, any>): Promise<void> {
    const title = metadata?.title || `memory_${Date.now()}`
    this.store.save(title, text)
  }

  async remove(id: string): Promise<void> {
    this.store.delete(id)
  }
}
```

**优势：** 在现有 `MemoryStore` 基础上增加搜索能力，无额外依赖。

#### 第二步：本地向量检索（需要时引入）

```
技术选型：sqlite-vec（SQLite 向量扩展）

优势：
- 单文件嵌入，无需额外服务进程
- 跨平台（Electron 桌面应用友好）
- 支持向量检索 + 元数据过滤
- 比 Markdown 文件搜索精确得多
- 可配合轻量级 Embedding 模型（如本地 ONNX）

何时引入：
- 文件搜索明显不够用时（知识条目 > 200 条）
- 需要语义级检索（"用户上次提到过类似的问题吗？"）
- 不建议在 Phase 1-5 期间引入，稳定后再加
```

### 11.6 经验记忆的务实做法

不单独建 `EpisodicMemory` 接口。用现有 `KnowledgeMemory` + 结构化标题存储：

```typescript
// 通过 memorize 工具保存任务经验
await knowledgeMemory.add(
  JSON.stringify({
    task: 'Review PR #42',
    result: 'Approved with 3 comments',
    success: true,
    steps: [/* AgentStep[] */],
    duration: 45000
  }),
  {
    title: 'episode:code-review-2026-04',
    type: 'episode',
    agentId: 'code-reviewer'
  }
)

// 检索历史经验
const episodes = await knowledgeMemory.search('code review', {
  agentId: 'code-reviewer',
  k: 5
})
```

**等真正需要时再升级：** 当以下需求出现时，拆分为独立的 `EpisodicMemory`：
- 按 `success: true/false` 过滤
- 按任务类型聚合统计
- 需要语义级任务相似度匹配

### 11.7 Memory 在 Runtime 中的使用流程

```typescript
// DefaultAgentRuntime.run() 内部
async run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult> {
  // 1. 加载会话历史（ConversationMemory）
  const history = await this.sessionManager.getHistory(request.sessionId)

  // 2. 搜索相关知识（KnowledgeMemory）
  const memories = await this.knowledgeMemory.search(
    typeof request.prompt === 'string' ? request.prompt : '',
    { agentId: agent.id }
  )

  // 3. 注入到 system prompt（通过 PromptBuilder）
  const systemPrompt = this.promptBuilder.buildSystemPrompt({
    basePrompt: agent.systemPrompt,
    workspacePath: this.settings.workspacePath,
    skills: resolvedSkills,
    language: this.settings.language,
    knowledgeMemories: memories  // 新增字段
  })

  // 4. 组装 messages
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: request.prompt }
  ]

  // 5. 执行
  const result = await this.executor.execute(context, request)

  // 6. 保存会话历史（ConversationMemory）
  for (const msg of result.newMessages) {
    await this.sessionManager.addMessage(request.sessionId, msg)
  }

  return result
}
```

### 11.8 PromptBuilder 扩展

在现有 `PromptBuilder.buildMemory()` 基础上，增加对 `MemoryChunk[]` 的支持：

```typescript
// PromptBuilder.ts — 扩展 AgentContext 接口
export interface AgentContext {
  basePrompt?: string
  workspacePath?: string
  skills?: Skill[]
  language?: 'zh' | 'en'
  memory?: string                    // 保留：全量记忆文本（兼容）
  knowledgeMemories?: MemoryChunk[]  // 新增：检索结果
}

// buildMemory 方法增强
private buildMemory(context: AgentContext): string {
  const instructions = `...（保持不变）...`

  // 检索结果优先于全量记忆
  const memoryContent = context.knowledgeMemories?.length
    ? context.knowledgeMemories
        .map((chunk, i) => `${i + 1}. [相关度: ${(chunk.score * 100).toFixed(0)}%] ${chunk.text}`)
        .join('\n')
    : context.memory

  if (!memoryContent) {
    return `<memory>\n${instructions}\n</memory>`
  }

  // token 预算保护（保持不变）
  let content = typeof memoryContent === 'string'
    ? memoryContent
    : memoryContent
  if (content.length > MAX_MEMORY_CHARS) {
    content = this.truncateMemory(content, MAX_MEMORY_CHARS)
  }

  return `<memory>\n${instructions}\n\n${content}\n</memory>`
}
```

### 11.9 Memory 相关目录结构

```
src/main/services/memory/
├── types.ts                     # ConversationMemory, KnowledgeMemory, MemoryChunk
├── MemoryStore.ts               # 底层存储（Markdown 文件）— 保持不变
├── FileKnowledgeMemory.ts       # KnowledgeMemory 文件搜索实现（新增）
└── index.ts                     # 统一导出

src/main/services/agent/context/
├── PromptBuilder.ts             # 扩展 buildMemory() 支持 MemoryChunk[]
├── ContextManager.ts            # Token 裁剪 — 保持不变
└── Summarizer.ts                # 上下文压缩 — 保持不变
```

### 11.10 设计决策总结

| 讨论的方案 | 最终决策 | 理由 |
|---|---|---|
| 4 层 Memory 分类 | 压缩为 2 层 | Working = messages[]，Episodic = Knowledge 子集 |
| 统一 `Memory` 接口 | 分为 `ConversationMemory` + `KnowledgeMemory` | 返回类型不同，强求统一语义不清 |
| 独立 `MemoryManager` | Runtime 直接协调 | 避免多一层间接调用，逻辑更直观 |
| 独立 `MemoryInjector` | 在 `PromptBuilder` 里做 | 已有 `buildMemory()` 实现 |
| 独立 `MemoryCompressor` | 用现有 `Summarizer` | 已实现分块摘要 |
| Vector DB | 先文件搜索，后 sqlite-vec | 桌面应用引入外部 DB 过重 |
| Episodic Memory 独立接口 | 用 KnowledgeMemory + metadata | 短期无语义检索需求 |

---

## 12. 完整架构速查

```
┌─────────────────────────────────────────────────────┐
│                      Agent                          │
│  纯配置：modelId, systemPrompt, skillIds, tools     │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                   AgentRuntime                      │
│  生命周期：创建 model → 解析 skills → 组装 ctx      │
│           → 加载 Memory → 调用 Executor → 后处理    │
└────────────┬───────────────────────┬────────────────┘
             │                       │
             ▼                       ▼
┌──────────────────────────┐  ┌────────────────────────────┐
│  AgentExecutor           │  │     Memory 协调             │
│  持有 LLMClient          │  │                            │
│  唯一调用 LLM 的层       │  │  ConversationMemory        │
│  LLM → Tool → Loop       │  │    SessionManager           │
└──────────────────────────┘  │    ContextManager (裁剪)     │
                              │                            │
                              │  KnowledgeMemory            │
                              │    MemoryStore (持久化)      │
                              │    FileKnowledgeMemory (搜索)│
                              └────────────────────────────┘

         ┌─── AgentContext ───────────┐
         │  Executor 的运行上下文      │
         │  agent, messages, tools,   │
         │  signal                    │
         └────────────────────────────┘
```

---

## 13. 授权机制：事件驱动设计

### 13.1 设计原则

授权本质上是一个事件，不是上下文。它是一个 **请求-等待-响应** 的双向流程：

```
Executor → "这个工具需要授权" → Runtime → Controller → UI
Executor ← "用户同意了"      ← Runtime ← Controller ← UI
```

将 `onAuthorizationRequired` callback 放在 `AgentContext` 中意味着 Executor 必须感知授权机制的存在，违反了"Executor 只管推理策略"的原则。

**核心改进：授权通过事件机制传递，不侵入 AgentContext。**

### 13.2 Phase 1-4：emit + ToolGuard Promise

Executor 内部的 ToolGuard 通过 `emit` 发出授权请求，内部用 Promise 等待外部 resolve：

```typescript
// guard/ToolGuard.ts — 改造

export class ToolGuard {
  private pendingRequests = new Map<string, (approved: boolean) => void>()

  constructor(private emit?: (event: AgentEvent) => void) {}

  async checkAuthorization(req: ToolExecutionRequest): Promise<boolean> {
    const decision = this.evaluateRequest(req)

    if (!decision.requiresUserConfirmation) return true

    // 通过事件发出授权请求（不使用 callback）
    this.emit?.({
      type: 'auth_request',
      payload: {
        requestId: req.requestId,
        toolName: req.toolName,
        args: req.args,
        reason: decision.reason
      }
    })

    // 内部 Promise 等待外部 resolve
    return new Promise((resolve) => {
      this.pendingRequests.set(req.requestId!, resolve)
    })
  }

  /**
   * 由 Runtime 调用，将用户的授权决策传回
   */
  resolve(requestId: string, approved: boolean): void {
    const resolve = this.pendingRequests.get(requestId)
    if (resolve) {
      resolve(approved)
      this.pendingRequests.delete(requestId)
    }
  }
}
```

### 13.3 Runtime 的授权桥接角色

Runtime 持有 Executor 创建的 ToolGuard 实例引用，暴露 `resolveAuth` 方法给 Controller 调用：

```typescript
// runtime/DefaultAgentRuntime.ts

export class DefaultAgentRuntime implements AgentRuntime {
  private currentToolGuard: ToolGuard | null = null

  async run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult> {
    // ...准备工作...

    // Executor 内部创建 ToolGuard 并传入 emit
    // Runtime 通过 executor 实例获取 ToolGuard 引用
    const executor = new DefaultAgenticExecutor()
    this.currentToolGuard = executor.getToolGuard()

    const result = await executor.execute(context, request)

    this.currentToolGuard = null
    return result
  }

  /**
   * 由 Controller 调用 — 用户在 UI 做出授权决策后
   */
  resolveAuth(requestId: string, approved: boolean): void {
    this.currentToolGuard?.resolve(requestId, approved)
  }
}
```

### 13.4 Controller 的授权处理

Controller 监听 IPC 授权响应，调用 Runtime 的 `resolveAuth`：

```typescript
// controllers/AgentController.ts

export class AgentController {

  registerHandlers(): void {
    ipcMain.handle(AGENT_CHANNELS.START, this.handleStart.bind(this))
    ipcMain.handle(AGENT_CHANNELS.STOP, this.handleStop.bind(this))

    // 监听 UI 的授权响应
    ipcMain.on(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, (_event, response) => {
      if (response?.requestId) {
        this.runtime.resolveAuth(response.requestId, response.approved)
      }
    })
  }

  // emit 函数中拦截 auth_request 转发到 UI
  private buildEmitFn(): (event: AgentEvent) => void {
    return (event: AgentEvent) => {
      if (event.type === 'auth_request') {
        // 转发到 UI
        this.broadcast(AGENT_EVENTS.AUTHORIZATION_REQUEST, event.payload)
      }
      // ... 其他事件处理 ...
    }
  }
}
```

### 13.5 Phase 5：AsyncGenerator 的天然方案

AsyncGenerator 的 `yield` + `next(value)` 天然支持暂停-恢复，授权变成最干净的形态：

```typescript
// executor/DefaultAgenticExecutor.ts — Phase 5

async *execute(context, request): AsyncGenerator<AgentEvent, AgentRunResult> {
  // ...
  for (const tc of toolCalls) {
    const decision = this.toolGuard.evaluate(req)

    if (decision.requiresUserConfirmation) {
      // yield 暂停执行，将 auth_request 交给 consumer
      const approved = yield {
        type: 'auth_request',
        payload: { requestId: req.requestId, toolName, args, reason }
      }
      // generator.next(true) → approved = true
      // generator.next(false) → approved = false

      if (!approved) {
        // 记录拒绝，跳过此工具
        continue
      }
    }

    // 执行工具
  }
}
```

```typescript
// runtime/DefaultAgentRuntime.ts — Phase 5

async run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult> {
  // ...
  const stream = executor.execute(context, request)

  while (true) {
    const { value: event, done } = await stream.next()
    if (done) return event  // AgentRunResult

    if (event.type === 'auth_request') {
      // 转发到 UI，等待用户决策
      request.emit?.(event)
      const approved = await this.waitForUserDecision(event.payload.requestId)
      // 将决策传回 generator，恢复执行
      stream.next(approved)
    } else {
      // 普通事件，转发
      request.emit?.(event)
    }
  }
}
```

**AsyncGenerator 的关键能力：** `generator.next(value)` 可以把值传回 yield 表达式。这意味着授权决策不需要 callback、不需要 Promise、不需要 Map 查找，Generator 本身就是通信通道。

### 13.6 授权机制演进路线

```
Phase 1-4                              Phase 5
──────────                             ──────────
ToolGuard                              ToolGuard
  emit('auth_request')                   yield auth_request
  Promise 等待                           (generator 自动暂停)
  Runtime.resolveAuth()                  Runtime
  ToolGuard.resolve()                      stream.next(approved)
  Promise resolve → Executor 继续          (generator 自动恢复)

链路:                                  链路:
Executor → ToolGuard → emit           Executor → yield
  → Runtime → Controller → UI           → Runtime → Controller → UI
  → Controller → Runtime → ToolGuard    → Controller → Runtime → stream.next()
  → Promise resolve → Executor 继续      → Executor 继续
```

| 维度 | Phase 1-4 | Phase 5 |
|---|---|---|
| 通信机制 | emit + Promise + resolve | yield + next(value) |
| Executor 感知 | 知道 ToolGuard 的存在 | 只知道 yield，不知道授权 |
| 需要的额外组件 | ToolGuard.pendingRequests Map | 无 |
| Runtime 职责 | 持有 ToolGuard 引用，桥接 resolve | 消费 generator，转发 auth，回传决策 |
| 测试复杂度 | 需要 mock emit + 手动 resolve | `stream.next(mockApproved)` |

### 13.7 设计决策总结

| 决策 | 选择 | 理由 |
|---|---|---|
| 授权放在 AgentContext 中？ | 否 | 授权是事件，不是上下文。Executor 不应感知授权机制 |
| 授权放在 AgentRunRequest 中？ | 否 | Request 是输入，授权是交互过程中的双向通信 |
| 授权如何传递？ | 事件（emit / yield） | 与所有其他 AgentEvent 一致，统一出口 |
| Executor 如何等待结果？ | Phase 1-4: Promise, Phase 5: yield 暂停 | 渐进演进，最终形态最干净 |
| Runtime 的角色？ | 授权桥接（Executor ↔ Controller） | Runtime 是唯一同时持有 Executor 和外部通信能力的组件 |

---

## 14. 补充风险分析（代码审查发现）

> 基于对当前 `AgentRuntime.ts`、`AgentController.ts`、`ToolGuard.ts`、`StaffProfile`、`router.ts` 的实际代码比对，发现以下方案未覆盖的问题。

### 14.1 🔴 高风险问题

#### 14.1.1 `LLMClient` 接口从未定义

方案多处引用 `DefaultLLMClient`，但当前代码库只有 `IChatModel` + `createChatModel()` 工厂函数。

**核心矛盾：**

| 维度 | 当前实现 | 方案设计 |
|---|---|---|
| 创建时机 | 每次 `run()` 时动态读 settings | 应用启动时注入单例 |
| 模型切换 | 下次 `run()` 自动生效 | 需要重建 Executor |

**后果：** 用户在 Settings 页面切换模型/provider 后，Executor 持有的 LLM 实例仍是旧的，直到应用重启。

**建议方案（两选一）：**

```typescript
// 方案 A：直接声明等价关系，Executor 构造时拿工厂而不是实例
type LLMClient = IChatModel
export class DefaultAgenticExecutor {
  constructor(private llmFactory: (agent: Agent) => IChatModel) {}

  async *execute(context: AgentContext, request: AgentRunRequest) {
    const llm = this.llmFactory(context.agent)  // 每次 run 动态创建
    // ...
  }
}

// 方案 B：Executor 依赖 ConfigManager，内部用 createChatModel() 解析
export class DefaultAgenticExecutor {
  constructor(private configManager: ConfigManager) {}
}
```

方案 A 更符合依赖注入原则，推荐采用。

---

#### 14.1.2 并发多会话的 `currentToolGuard` 竞态

方案第 7.1 章声称 `DefaultAgentRuntime` 设计为无状态，但第 13.3 章的授权机制却引入了实例属性：

```typescript
// 方案代码 — 存在竞态
private currentToolGuard: ToolGuard | null = null

async run(agent: Agent, request: AgentRunRequest) {
    this.currentToolGuard = executor.getToolGuard()  // ← 覆盖旧值！
    const result = await executor.execute(...)
    this.currentToolGuard = null
}
```

**问题场景：**

```
会话 A: run() → currentToolGuard = GuardA
会话 B: run() → currentToolGuard = GuardB  ← 覆盖！
会话 A: bash 工具触发授权 → resolveAuth() → GuardB.resolve()  ← 错误！
会话 A 的授权 Promise 永远 hang
```

**建议修复：**

```typescript
// 用 Map 按 runId 存取
private activeGuards = new Map<string, ToolGuard>()

async run(agent: Agent, request: AgentRunRequest) {
    const runId = generateId()
    const guard = new ToolGuard(request.emit)
    this.activeGuards.set(runId, guard)
    try {
        return await executor.execute({ ...context, runId }, request)
    } finally {
        this.activeGuards.delete(runId)
    }
}

resolveAuth(runId: string, requestId: string, approved: boolean): void {
    this.activeGuards.get(runId)?.resolve(requestId, approved)
}
```

Controller 的 `AUTHORIZATION_RESPONSE` IPC 消息中需要同时携带 `runId`。

---

#### 14.1.3 `IMServiceManager` 和 `SchedulerService` 持有独立 `AgentRuntime` 实例

当前 `router.ts` 中：

```typescript
// IMServiceManager 内部创建 AgentRuntime
this.imServiceManager = new IMServiceManager(
    settings, this.toolRegistry, this.sessionManager,
    this.toolController, memoryStore, this.usageManager
)

// SchedulerService 内部创建 AgentRuntime
this.schedulerService = new SchedulerService(
    settings, this.toolRegistry, this.sessionManager,
    this.toolController, schedulerStorage, memoryStore,
    this.usageManager, this.imServiceManager, this.configManager
)
```

**方案的 5 个 Phase 完全没有提到这两个路径。** 重构后两者都需要迁移到新的 `AgentRuntime.run(agent, request)` 接口，否则会出现：
- 新旧两套接口并存，维护负担加倍
- IM/Scheduler 走旧接口，无法使用新的 Executor 可替换能力

**建议：** 在 Phase 3 中明确增加以下任务：
- [ ] 将 `IMServiceManager` 的 `AgentRuntime` 替换为注入的 `DefaultAgentRuntime`
- [ ] 将 `SchedulerService` 的 `AgentRuntime` 替换为注入的 `DefaultAgentRuntime`
- [ ] 两者构建 `Agent` 配置对象时使用 `modelId` 格式（`'provider/model'`）

---

### 14.2 🟠 中风险问题

#### 14.2.1 `filterTools()` 实现未说明，且与 `allowedMcpServerIds` 粒度不同

方案中 `DefaultAgentRuntime.run()` 调用 `this.filterTools(effectiveToolNames)`，但：

1. `ToolRegistry` 当前只有 `getTools(): ITool[]`，无过滤能力
2. `Agent.allowedTools` 是**工具名级别**白名单（`string[]`）
3. 当前 `StaffProfile.allowedMcpServerIds` 是 **MCP server 级别**限制（粒度更粗）

MCP 工具的名称格式为 `server_name__tool_name`（运行时动态注册），无法在 `Agent` 配置中静态列举。

**建议：** `filterTools()` 实现时区分两种过滤模式：

```typescript
private filterTools(toolNames?: string[]): ToolRegistry {
    if (!toolNames) return this.toolRegistry  // undefined = 全部工具

    // 支持工具名精确匹配 + server 前缀通配符
    // 例如 allowedTools: ['read', 'bash', 'github_mcp/*']
    return this.toolRegistry.filter(tool => {
        const name = tool.getDefinition().name
        return toolNames.some(pattern =>
            pattern.endsWith('/*')
                ? name.startsWith(pattern.slice(0, -2))
                : name === pattern
        )
    })
}
```

迁移映射：`allowedMcpServerIds: ['github']` → `allowedTools: ['github/*']`

---

#### 14.2.2 `executor.getToolGuard()` 接口污染

方案让 Runtime 调用 `executor.getToolGuard()`，但 `AgentExecutor` 接口只声明了 `execute()`。

**违反原则：** Interface Segregation — 所有 Executor 实现都被迫暴露 `getToolGuard()`，即使某些策略（如 `SingleTurnExecutor`）根本不使用 ToolGuard。

**建议替代方案：** ToolGuard 由 Runtime 创建并通过 `AgentContext` 传入 Executor（正好与第 13 章授权事件方案配合）：

```typescript
// Runtime 创建 ToolGuard，放入 Context
const guard = new ToolGuard(request.emit)
this.activeGuards.set(runId, guard)
const context: AgentContext = { runId, agent, messages, tools, signal, emit, toolGuard: guard }
```

注意：这与第 13 章"授权不在 AgentContext 中"的决策有冲突，需要裁决：**ToolGuard 实例**（基础设施）vs **授权回调**（业务逻辑）不是同一个层次的概念，前者放入 Context 是合理的。

---

#### 14.2.3 `Settings` 动态更新传播断层

当前 `AppRouter` 的 settings 变更链：

```
settingsChangeCallback → agentController.updateSettings() → agentRuntime.updateSettings()
                                                          → promptBuilder.updateConfig()
```

重构后 `DefaultAgentRuntime` 是启动时创建的单例，但方案没有说明：
- Runtime 如何接收 settings 更新？
- `Executor` 持有的 LLMClient（或 llmFactory）如何感知 provider 切换？

**建议：** Runtime 保留 `updateSettings(settings: AppSettings)` 方法，更新内部 `this.settings` 引用。若采用 14.1.1 中的"工厂函数"方案，切换模型无需重建 Executor。

---

#### 14.2.4 `history` 职责归属模糊，可能双重加载

方案第 11.7 章：Runtime 内部调用 `sessionManager.getHistory(sessionId)`。
当前 `AgentController`：也调用了 `sessionManager.getHistory(sid)` 并传入 `runOptions.history`。

若两者都保留，`history` 将被加载两次并拼接，导致历史消息重复。

**建议：** 明确清理规则：

```
重构后：
- AgentController 不再传 history（删除 L210-211）
- DefaultAgentRuntime 通过 request.sessionId 内部加载
- AgentRunRequest.history 保留作为"无 sessionId 时的显式历史"备用字段
```

---

### 14.3 🟡 低风险问题

#### 14.3.1 `StaffProfile` 持久化兼容性 — TypeScript getter 不适用于 plain object

方案：
```typescript
get systemPrompt() { return this.persona }
```

`StaffManager.load()` 从 JSON 文件反序列化后返回的是 plain object，**getter 定义在 class prototype 上，对 plain object 不生效**，`systemPrompt` 仍为 `undefined`。

**建议：** 在 `StaffManager.load()` 中加显式迁移函数：

```typescript
private migrate(raw: any): StaffProfile {
    return {
        ...raw,
        // 字段迁移
        systemPrompt: raw.systemPrompt ?? raw.persona,
        modelId: raw.modelId ?? (raw.provider && raw.model ? `${raw.provider}/${raw.model}` : undefined),
        // 清理旧字段
        persona: undefined,
        provider: undefined,
        model: undefined,
        memoryFile: undefined,
    }
}
```

---

#### 14.3.2 `AgentContext` 命名冲突

`src/common/types/agent.ts` 中当前已存在 `AgentContext` 接口：

```typescript
// 当前（旧）
export interface AgentContext {
    messages: Message[]    // ← 旧的 Message 类型（非 ChatMessage）
    activeTools: string[]  // ← Skill ID 列表
}
```

方案新定义的 `AgentContext`（`src/main/services/agent/types.ts`）字段完全不同。两者并存会造成 TypeScript 导入混乱。

**建议：** Phase 1 新增任务：将 `src/common/types/agent.ts` 中的旧 `AgentContext` 重命名为 `LegacyAgentContext` 或直接删除（检查是否有实际使用）。

---

#### 14.3.3 多模态 `prompt` 的知识检索失效

方案 Runtime 中：

```typescript
const memories = await this.knowledgeMemory.search(
    typeof request.prompt === 'string' ? request.prompt : '',  // ← ContentPart 时为空字符串
    { agentId: agent.id }
)
```

用户发送图片 + 文字的多模态消息时，文本部分被丢弃，记忆检索用空字符串，返回结果无意义。

**建议：** 在 `agent/types.ts` 中提供工具函数：

```typescript
export function extractTextFromPrompt(prompt: string | ContentPart[]): string {
    if (typeof prompt === 'string') return prompt
    return prompt
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join(' ')
}
```

---

#### 14.3.4 `onStream('', true)` reset 信号没有 `emit` 等价物

当前 `AgentController` 使用 `onStream('', true)` 通知 UI"清空当前流式区域，开始新一轮思考"（每个 loop 开始时触发）。

方案迁移到 `emit` 事件后，`turn_start` 事件的 payload 中未明确包含此语义。

**建议：** 在 `turn_start` 事件 payload 中添加 `resetStream: true` 字段：

```typescript
yield {
    type: 'turn_start',
    payload: {
        turnIndex: loopCount,
        resetStream: true   // ← UI 接收后清空流式缓冲区
    }
}
```

并在 `AgentController.buildEmitFn()` 中拦截处理：

```typescript
case 'turn_start':
    if (event.payload.resetStream) {
        this.flushThrottledEvents()
        this.broadcast(AGENT_EVENTS.STREAM, { content: '', isReset: true })
    }
    break
```

---

### 14.4 补充任务清单

以下任务需要分散并入原有各 Phase：

**Phase 1 新增：**
- [ ] 检查并清理 `src/common/types/agent.ts` 中旧的 `AgentContext` 接口（重命名或删除）
- [ ] 添加 `extractTextFromPrompt()` 工具函数到 `agent/types.ts`

**Phase 2 新增：**
- [ ] 明确 `LLMClient` 与 `IChatModel` 的关系（推荐采用 llmFactory 注入方案）
- [ ] 确认 `Summarizer.summarize(messages, chatModel)` 的 chatModel 来源（Executor 内部持有）
- [ ] 在 `turn_start` 事件 payload 中增加 `resetStream` 字段

**Phase 3 新增（重要）：**
- [ ] 将 `IMServiceManager` 内部的 `AgentRuntime` 替换为注入的 `DefaultAgentRuntime`
- [ ] 将 `SchedulerService` 内部的 `AgentRuntime` 替换为注入的 `DefaultAgentRuntime`
- [ ] 明确 `AgentController` 不再传 `history`，由 Runtime 内部通过 `sessionId` 加载
- [ ] 将 `currentToolGuard: ToolGuard | null` 替换为 `activeGuards: Map<runId, ToolGuard>`
- [ ] 在 `AUTHORIZATION_RESPONSE` IPC 消息中添加 `runId` 字段
- [ ] 在 `StaffManager.load()` 中实现字段迁移函数（不依赖 TypeScript getter）

**Phase 4 新增：**
- [ ] 为 `ToolRegistry` 添加 `filter(toolNames: string[])` 方法，支持 server 前缀通配符

### 14.5 风险等级汇总

| 风险等级 | 问题 | 影响 |
|---|---|---|
| 🔴 高 | LLMClient 未定义 — 模型切换失效 | 用户体验严重受损 |
| 🔴 高 | 并发 ToolGuard 竞态 | 授权流程挂起，会话卡死 |
| 🔴 高 | IM/Scheduler AgentRuntime 未迁移 | 重构不完整，双轨并存 |
| 🟠 中 | filterTools 实现 + allowedTools/allowedMcpServerIds 粒度不统一 | Staff 工具限制失效 |
| 🟠 中 | executor.getToolGuard() 接口污染 | 违反接口最小化，扩展性受损 |
| 🟠 中 | Settings 更新传播断层 | 模型切换后需重启应用才生效 |
| 🟠 中 | history 双重加载 | 历史消息重复，context 膨胀 |
| 🟡 低 | StaffProfile getter 不适用 plain object | 字段迁移静默失败 |
| 🟡 低 | AgentContext 命名冲突 | TypeScript 导入混乱 |
| 🟡 低 | 多模态 prompt 记忆检索失效 | 知识记忆对图文消息不生效 |
| 🟡 低 | onStream reset 信号无 emit 等价物 | UI 流式区域不清空，出现视觉残影 |
