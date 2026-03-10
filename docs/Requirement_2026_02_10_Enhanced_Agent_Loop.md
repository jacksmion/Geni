# Geni 项目 - 增强型 Agent 循环 (Enhanced Agent Loop) 与实时干预机制

> **更新日期**: 2026-03-10 (基于 2026-02-10 草案深度完善，已合入架构评估建议与多模态扩展性设计)
> **状态**: 详细落地规划设计
> **优先级**: 最高 (重构核心基础设施，为 WebSocket Gateway 与多端接入铺路)

## 1. 背景与目标

当前的 `AgentRuntime.ts` 实现了基础的 ReAct (推理与行动) 循环，但在用户体验和架构鲁棒性方面面临挑战。特别是在对接即将到来的 WebSocket Gateway 多端架构（WebUI, CLI, Telegram 通讯）时，现有的多重散装 Callback 机制（`onStream`、`onStepUpdate`、`onStateChange`）将变得极难维护。

通过借鉴业内顶级 Agent 框架（如 `pi-agent-core`），本方案旨在对整个 Agent 执行引擎进行“脱胎换骨”的重构。核心目标有三：
1. **统一事件流 (Unified Event Stream)**：极简、强类型的单一事件向下推送管道。
2. **实时指令干预 (Steering)**：在任务中途允许用户随时“插话打断并纠偏”，提升虚拟结对编程真实感。
3. **可中断的工具执行链 (Interruptible Tool Chain)**：在串行或受控并发的工具调度中，能够根据 Steering 信号进行精确截断。

---

## 2. 核心架构设计

### 2.1 统一事件驱动机制 (Unified Event Stream)
废弃原有的散装回调模式，引入唯一的 `AgentEvent` 联合类型总线。保证端到端的强类型约束。

**多模态内容基础类型 (`src/common/types/chat.ts`)**：
为支持图片输入（及未来的音频、视频），`ChatMessage.content` 需从纯 `string` 演进为联合类型，与 OpenAI/Anthropic 的多模态 API 对齐：

```typescript
// 多模态内容块 - 渐进式扩展
export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
    // 未来按需扩展，遵循 YAGNI
    // | { type: 'audio'; audio: { url: string; format?: string } }
    // | { type: 'video'; video: { url: string; format?: string } }

export interface ChatMessage {
    role: MessageRole;
    content: string | ContentPart[] | null;  // 兼容旧格式 + 新多模态格式
    // ...
}
```

**数据结构标准定义 (`src/common/types/agentEvents.ts`)**：
采用**信封模式 (Envelope Pattern)** 分离语义事件与传输元数据：
- **`AgentEvent`**：纯语义事件（发生了什么），由 `AgentRuntime` 产出，使用辨识联合类型保证类型安全
- **`AgentEventEnvelope`**：传输包装（谁的事、什么时候），由 Controller / Gateway 在转发时填充

引用内容的事件 payload 与 `ChatMessage.content` 保持类型对齐。

```typescript
// ===== 传输信封 =====
// 由 Controller / Gateway 在转发时包装，Runtime 不感知
export interface AgentEventEnvelope {
    sessionId: string;
    timestamp: number;
    event: AgentEvent;
}

// ===== 语义事件（AgentRuntime 只产出这一层）=====
// 采用辨识联合类型保证强类型
export type AgentEvent =
    | { type: 'agent_start'; payload: { taskDescription?: string } }
    | { type: 'message_delta'; payload: {
          delta: string;
          isReasoning?: boolean;
          contentType?: 'text' | 'image';  // 默认 'text'，向后兼容；未来可扩展 'audio' | 'video'
          mediaUrl?: string;               // 当 contentType 非 text 时，指向资源
      }}
    | { type: 'tool_start'; payload: { toolCallId: string; toolName: string; args: Record<string, any> } }
    | { type: 'tool_update'; payload: { toolCallId: string; progress?: number; output?: string } }
    | { type: 'tool_end'; payload: { toolCallId: string; result: string; isError: boolean; duration: number } }
    | { type: 'steering_detected'; payload: {
          newMessage: string | ContentPart[];  // 与 ChatMessage.content 对齐，支持图片干预
          skippedTools: string[];
      }}
    | { type: 'auth_request'; payload: { requestId: string; toolName: string; args: Record<string, any>; reason: string } }
    | { type: 'agent_end'; payload: {
          finalAnswer: string | ContentPart[] | null;  // 与 ChatMessage.content 对齐
          totalSteps: number;
          newMessages: ChatMessage[];                   // 强类型替代 any[]，自动获得多模态能力
      }}
    | { type: 'error'; payload: { message: string; category?: string } };

export type AgentEventType = AgentEvent['type'];  // 从联合类型自动推导，避免手动维护
```
**益处**：
- **Runtime 职责单一**：只关心"发生了什么事"，不需要感知 sessionId
- **Controller / Gateway 负责包装**：在转发时打上 `sessionId` + `timestamp`，语义更准确（时间戳反映发送时间而非产出时间）
- **前端收到完整的 `AgentEventEnvelope`**：通过 `event.type` 做 switch 即享有类型提示

### 2.2 核心双循环结构与 IAgentService 重构

**重构 `IAgent.ts` 接口**：
```typescript
interface IAgentService {
    run(
        prompt: string,
        tools: ITool[],
        options?: AgentRunOptions,
        emit?: (event: AgentEvent) => void
    ): Promise<{ success: boolean; reason?: string }>;
}
```

**双循环重塑 `AgentRuntime.run(emit)`**：
- **外部大循环 (Turn Loop)**：调用 LLM，监听流式推流。
- **内部小循环 (Tool Chain Loop)**：当前已经是逐一执行工具，需在其中植入 Steering 检查点。

### 2.3 实时指令干预 (Steering) 机制与边界条件

这是本次重构的“灵魂级特性”。

**实现机制与 Queue 归属**：
- **指控注入**：采用依赖注入形式。在 `AgentRunOptions` 中注入 `steeringQueue` 对象，由 Controller 或 Gateway 负责向其中 push 消息，Runtime 只负责 peek/drain。
```typescript
export interface AgentRunOptions {
    steeringQueue?: {
        peek: () => string | null;
        drain: () => string[];
    };
    // ...
}
```

**关键边界条件处理**：
1. **内循环哨兵 (Steering Checkpoints)**：在触发每个工具执行前，调用 `steeringQueue.drain()` 获取新指令。如果有指令，则触发 `steering_detected`。
2. **LLM 流式输出中途**：在 `executeLlmTurn` 的推流循环中也要加入检查点（例如按 chunk 批次检查），避免长输出时响应迟钝。
3. **授权等待期干预**：如果在 `AwaitingInput` 状态收到 Steering 消息，立即取消当次授权等待，抛弃该工具并进入 Steering 逻辑。
4. **部分工具已执行**：如 LLM 规划了 A、B 两个工具。A 执行完毕，在 B 执行前检测到 Steering，则**保留 A 的结果，跳过 B**。
5. **消息合并**：如果队列中有快速多条输入，由 `drain()` 合并为单一连续指令供后续参考。

**规范化伪造回执 (Mock Result)**：
拦截工具执行后，必须为 LLM 构造严谨的 Tool Result 回复，以满足 OpenAI/Anthropic 等 API 的强约束（每个 tool_call 必须有对应的 tool message，否则报错）：
```json
{
  "role": "tool",
  "tool_call_id": "{call_id}",
  "content": "[System Note] Tool execution was skipped because the user sent a new instruction: \"{最新指令}\". Please adjust your plan accordingly."
}
```

### 2.4 状态机演进 (AgentState)

新增状态以清晰反映 Agent 的底层行为流转，特别是 UI 应对 Steering 和 Auth 中断的反馈：

- 新增 `Steering` 状态（或从 `Thinking` 派生子状态）。
- 更新 `isValidTransition`，允许从 `ExecutingTool` -> `Steering` -> `Thinking`。

### 2.5 多模态扩展性设计 (Multimodal Extensibility)

为支持用户输入图片（后续可能扩展至音频、视频），采用**"改根不改叶"**的策略：修改根类型 `ChatMessage.content`，让变更自然传播到引用它的事件字段。

**核心改动 — `ChatMessage.content` 类型演进**：
```
string | null  →  string | ContentPart[] | null
```

**事件影响分析**：

| 事件类型 | 是否需要改 | 原因 |
|:---------|:----------:|:-----|
| `agent_start` | ⚪ 不需要 | 生命周期信号，不含用户/模型内容 |
| `message_delta` | 🔴 需要 | 增加 `contentType` + `mediaUrl` 可选字段，向后兼容 |
| `tool_start` | ⚪ 不需要 | 工具元信息，不含内容 |
| `tool_update` | ⚪ 不需要 | `output?: string` 足够，工具进度无需多模态 |
| `tool_end` | ⚪ 推迟 | `result: string` 目前够用；等有图片生成工具需求时再评估 |
| `steering_detected` | 🔴 需要 | `newMessage` 对齐 `ChatMessage.content`，支持图片干预 |
| `auth_request` | ⚪ 不需要 | 纯控制信号 |
| `agent_end` | 🔴 需要 | `finalAnswer` 对齐 `ChatMessage.content`；`newMessages` 改 `any[]` → `ChatMessage[]` |
| `error` | ⚪ 不需要 | 错误信息始终为文本 |

**入口适配 — `AgentStartRequest`**：
```typescript
export interface AgentStartRequest {
    prompt: string;
    attachments?: Array<{            // 可选附件通道
        type: 'image' | 'file';      // 未来扩展 'audio' | 'video'
        data: string;                 // base64 or URL
        mimeType?: string;
    }>;
    // ...
}
```

**设计原则**：
1. **类型预埋，行为推迟**：Phase 1 定义好 `ContentPart` 和兼容类型，运行时逻辑暂时仍按 `string` 处理
2. **向后兼容**：`content: string` 仍然合法，老代码无需立即修改
3. **YAGNI**：`audio`、`video` 类型仅以注释预留，不提前实现

---

## 3. 实施步骤与渐进式迁移路线图 (Safe Implementation Roadmap)

为降低核心引擎重构的风险，采用渐进式 6 阶段迁移。

### Phase 1: 弱侵入式改造 (Types & Events)
- [ ] **1a:** 在 `common/types/chat.ts` 中定义 `ContentPart` 类型，将 `ChatMessage.content` 演进为 `string | ContentPart[] | null`。
- [ ] **1b:** 在 `common/types/agentEvents.ts` 中定义严谨的 `AgentEvent` 联合类型，受影响事件的 payload 与 `ChatMessage.content` 类型对齐。
- [ ] **1c:** 演进 `IAgentService` 接口，增加 `emit` 参数，但同时保留对旧散装 callback 的调用（双向兼容期）。
- [ ] **1d:** 在 `AgentStartRequest` 中增加可选 `attachments` 字段（类型预埋，暂不实现处理逻辑）。

### Phase 2: Steering 引擎植入 (Steering Core)
- [ ] **2a:** 实现 `SteeringQueue` 机制，并加入 `AgentRunOptions`。
- [ ] **2b:** 在 `AgentRuntime` 的内部循环 (Tool Loop) 和推流循环 (LLM Loop) 中植入 `steeringQueue.drain()` 检查点。
- [ ] **2c:** 实现严谨的跳过工具 Mock Result 生成，并保证多工具调用截断的健壮性。

### Phase 3: Controller 适配与前端兼容 (Adapter Layer)
- [ ] **3a:** 在 `AgentController.ts` 中实现 `AgentEventToIpcAdapter`，负责接收统一事件，聚合并翻译为现存的 `agent:stream` 和 `agent:step` 等 IPC 消息，维护现有的节流 (Throttling) 逻辑。
- [ ] **3b:** 由 Controller 从 `agent_end` 与 `message_delta` 生命周期中提取数据并处理 Session 持久化（与现有逻辑对齐）。
- [ ] **3c:** 对前端 `useChatStore` 的 UI 表现进行适配：如遇到 skipped tools 将其渲染为灰色。

### Phase 4: 旧系统剥离 (Deprecation)
- [ ] 在确认适配器稳定且未来 Gateway 就绪后，移除 `AgentRuntime` 中的旧回调重载。

---

## 4. 技术备忘与参考
- **Event Sourcing (事件溯源)**：当前只需实现 **Level 1 (审计日志)** 标准，确保所有的改变通过 `emit` 推送即可，无需实现可重放的 CQRS，遵循 YAGNI 原则。
- **与 LLM 接口兼容**：必须确保所有未执行的 Tool Calls 都能有符合 `tool` role 协议的返回文本。
- **并发与锁**：在 Session 粒度上，确保同一个 Session 内 Steering 的注入和读取是线程（或异步执行序）安全的。
- **测试策略前置**：必须编写单元测试验证 `SteeringQueue` 的收发以及在不同检查点（LLM 推流、Auth 阻塞、多工具并发）打断的正确性。
