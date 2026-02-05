# Agent 核心接口 (IAgentService) 演变计划书

## 1. 当前现状与痛点分析

### 1.1 结构化程度不足 (Type Safety)
- **现状**：`AgentRunResult.steps` 被定义为 `any[]`。
- **风险**：前后端透传信息依赖约定而非约束，增加“耗时”、“Token 数”、“工具截图”等字段时极易出错。
- **目标**：定义强类型的 `AgentStep` 辨识联合类型（Discriminated Unions）。

### 1.2 缺乏“中途干预”机制 (Human-in-the-loop)
- **现状**：`run` 是单次长异步，无法在执行中途安全暂停。
- **需求**：当 Agent 尝试执行危险操作（如 `rm` 或发送外部请求）时，需要用户确认。
- **目标**：引入 `Interrupt/Resume` 状态机。

### 1.3 上下文感知与成本控制 (Context Management)
- **现状**：全量传递 `history`，无压缩策略。
- **风险**：Token 消耗过快，且超出模型 Context Window 后会导致 Agent “失忆”或报错。
- **目标**：引入 `ContextStrategy` 接口，支持自动摘要和智能裁剪。

### 1.4 强绑定 OpenAI 协议 (Provider Decoupling)
- **现状**：`AgentRunOptions` 包含 `model`, `temperature` 等模型特定参数。
- **目标**：参数抽象化（如 `CreativityLevel`），并提供 `providerOptions` 透传各家模型的特有配置。

### 1.5 事件流架构缺失 (Event-Driven)
- **现状**：依赖 `onStream` 和 `onStepUpdate` 回调，难以扩展监听维度。
- **目标**：引入 `EventEmitter` 模式，标准化 Agent 生命周期事件。

---

## 2. 优化路线图 (Roadmap)

### 第一阶段：强类型化与事件重塑 (基础改造)
- [ ] 定义 `AgentStep` 联合类型。
- [ ] 将分散的回调整合为 `AgentCallbacks` 对象或 `EventEmitter`。
- [ ] 在 `AgentRunResult` 中注入执行元数据（耗时、Token 统计）。

### 第二阶段：人机协作增强 (安全增强)
- [ ] 在 `ITool` 定义中增加 `dangerLevel`。
- [ ] 实现在工具调用前的“断点”停顿机制。
- [ ] 前端 UI 适配“确认/拒绝”操作流。

### 第三阶段：记忆与多模型适配 (架构解耦)
- [ ] 抽象 `PromptBuilder` 和 `ResponseParser`。
- [ ] 实现针对长会话的 `SummaryStrategy`。
- [ ] 支持本地模型（Ollama）和多模态模型（Gemini/Claude）。

---

## 3. 设计原则
1. **最小惊讶原则**：接口变更应尽量保持对旧逻辑的兼容。
2. **渐进式增强**：通过 `metadata` 和 `options` 提供扩展性，而非频繁修改接口签名。
3. **可观测性**：Agent 的每一步“思考”和“行动”都应是可溯源、可量化的。
