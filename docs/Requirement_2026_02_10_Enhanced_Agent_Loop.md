# Feature Request: Enhanced Agentic Loop (借鉴 pi-ai 实现)

> **Created**: 2026-02-10
> **Status**: Draft
> **Priority**: High (Infrastructure Improvement)

## 1. Context

当前的 `AgentRuntime.ts` 实现了一个基础的 Agent 循环，但在用户体验和鲁棒性方面仍有提升空间。
通过参考 `pi-ai` 库中的 `agent-loop` 实现，我们计划引入一套更成熟、高响应、且易于扩展的 Agent 执行核心逻辑。

主要改进方向包括：**统一事件流、实时指令干预（Steering）、以及可中断的工具执行链。**

---

## 2. Requirement A: 统一事件驱动 (Unified Event Stream)

### 2.1 问题描述
目前的 `AgentRuntime` 使用了多个分散的回调（`onStream`, `onStepUpdate`, `onStateChange`）。
这种方式导致 UI 层需要监听多个管道，逻辑耦合度高且难以维护。

### 2.2 解决方案
借鉴 `pi-ai` 的 `EventStream<AgentEvent>` 模式，将所有 Agent 生命周期内的行为封装成统一的事件。

- **核心事件类型**:
    - `agent_start` / `agent_end`: 任务整体生命周期。
    - `turn_start` / `turn_end`: 单个 LLM 交互回合。
    - `message_delta`: 消息增量内容（包括思维链和文本）。
    - `tool_start` / `tool_update` / `tool_end`: 工具执行状态映射。
    - `steering_detected`: 系统检测到用户干预。

---

## 3. Requirement B: 实时指令干预 (Steering Messages)

### 3.1 问题描述
当 Agent 正在执行（尤其是正在连续调用工具）时，用户无法插话。如果 Agent 任务理解有偏差或陷入死循环，用户只能干等或强行点击 Stop（这会导致上下文丢失）。

### 3.2 解决方案
引入 **Steering (舵向控制)** 机制。

- **实现方式**:
    - 在 `AgentRuntimeOptions` 中增加 `getSteeringMessages` 异步回调。
    - 在每次调用 LLM 前，以及执行每一个工具的前后，主动 Pull 最新的用户消息。
    - 如果发现新消息，立即将其注入到当前 Context 中，并可能需要中断后续的既定动作。

---

## 4. Requirement C: 可中断工具链 (Interruptible Tool Chain)

### 4.1 问题描述
目前的工具执行是“原子化”列表。一旦 LLM 返回了 5 个工具调用，系统会串行/并行跑完这 5 个工具才会进入下一回合，即便用户在第 1 个工具跑完时就发出了新指令。

### 4.2 解决方案
参考 `skipToolCall` 逻辑实现“优雅跳过”。

- **策略**:
    - 在工具执行循环内部加入干预检查点。
    - 若检测到 Steering Messages，立即标记后续尚未开始的工具为 `Skipped` 状态。
    - 为跳过的工具生成占位符 `ToolResult`（如：`Skipped due to queued user message.`），告知 LLM 任务方向已变。

---

## 5. Implementation Plan

### Phase 1: 类型与接口重构 (Infrastructure)
- [ ] 定义 `AgentEvent` 类型与事件总线接口。
- [ ] 扩展 `AgentRuntimeOptions` 以支持指令获取回调。
- [ ] 在 `AgentRuntime` 中引入双层循环结构（Outer/Inner Loop）。

### Phase 2: Steering 机制集成 (Intelligence)
- [ ] 实现 `getSteeringMessages` 的轮询逻辑。
- [ ] 在 `executeToolCalls` 中添加中断检查点。
- [ ] 实现通用的 `skipToolCall` 结果生成器。

### Phase 3: 前端 UI 适配 (UX)
- [ ] 升级前端 Chat 组件，使用统一的 `onEvent` 事件流进行渲染。
- [ ] 优化“消息队列”逻辑，支持在 Agent 运行时发送“追问/打断”指令。

---

## 6. 参考资料
- `pi-ai` 库 `agent-loop.ts` 实现
- 内部 `AgentRuntime.ts` 现有实现
