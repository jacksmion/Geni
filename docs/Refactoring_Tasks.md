# Agent 架构重构与任务执行清单 (v2.1)

本文档基于 `Architecture_and_Skills_Revamp.md` 提供的架构蓝图，拆解为可执行的详细开发任务。
所有代码变更主要位于 `src/main/services` 目录下。

## Phase 0: 基础设施重构 (Infrastructure) ✅ COMPLETED

> **目标**: 建立符合分层架构的物理目录结构，完成文件迁移，确保编译通过。

- [x] **0.1 建立目录结构**
    - [x] `src/main/services/agent/state` (存放状态机相关)
    - [x] `src/main/services/llm/providers` (存放 OpenAI, Anthropic 等实现)
    - [x] `src/main/services/tools/core` (存放 FS, Bash 等原子工具)
    - [x] `src/main/services/tools/mcp` (存放 MCP Client)
    - [x] `src/main/services/skills/core` (存放 Registry, Parser)
    - [x] `src/main/services/skills/runtime` (存放 SkillReader, Injector)
    - [x] `src/main/services/skills/repository` (存放本地/网络源加载器)
    - [x] `src/main/services/session` (存放 SessionManager)

- [x] **0.2 核心文件迁移 (File Migration)**
    - [x] 移动 `OpenAIAgentService.ts` -> `src/main/services/agent/AgentRuntime.ts` (暂时保留类名，仅移动文件)
    - [x] 移动 `IOpenAIAgentService.ts` -> `src/main/services/agent/IAgent.ts`
    - [x] 移动 `ToolRegistry.ts` (如果有) -> `src/main/services/tools/ToolRegistry.ts`
    - [x] 移动 `SkillLoader.ts` -> `src/main/services/skills/core/LegacySkillLoader.ts` (标记为废弃，待重构)

## Phase 1: 运行时核心修复 (Agent Kernel) ✅ COMPLETED

> **目标**: 修复 `OpenAIAgentService` 的并行调用缺陷，引入状态机，并对核心类进行解耦拆分。

- [x] **1.1 修复并行工具调用 (Fix Parallel Function Calls)**
    - **文件**: `src/main/services/agent/AgentRuntime.ts`
    - **问题**: 当前 `toolCallBuffer` 为单对象，无法处理 OpenAI 流式返回的交叉多工具调用 (ex: index 0 chunk, index 1 chunk, index 0 chunk)。
    - **设计**:
        - 引入 `Map<number, ToolCallAccumulator>`，key 为 `index`。
        - 结构定义: `interface ToolCallAccumulator { id: string; name: string; arguments: string; type: string; }`
        - 逻辑:
            1. 监听 `chunk.tool_calls`。
            2. 获取 `chunk.index`。
            3. 若 Map 中不存在该 index，初始化 Accumulator。
            4. 增量追加 `arguments` 字符串。
            5. 流结束时，将 Map values 转为数组进行执行。
 
- [x] **1.2 提取 PromptBuilder (Decouple Context)**
    - **文件**: `src/main/services/agent/PromptBuilder.ts`
    - **设计**:
        - 类 `PromptBuilder`
        - 方法 `buildSystemPrompt(context: AgentContext): string`
        - 功能:
            - 注入 Persona (System Instruction)
            - 注入 Time/OS/CWD (Environment Info)
            - 注入 Skill Summary (从 Context 中获取 enabled skills)
            - 注入 Methodology (CoT 指引)
    - **行动**: 将 `AgentRuntime.ts` 中的字符串拼接逻辑移动至此。

- [x] **1.3 引入显式状态机 (Explicit State Machine)**
    - **文件**: `src/main/services/agent/state/AgentState.ts`
    - **设计**:
        - 定义状态枚举: `Idle`, `Thinking` (Calling LLM), `ExecutingHelper` (Processing output), `ExecutingTool`, `AwaitingInput`。
        - 在 `AgentRuntime` 中维护 `currentState`。
        - **价值**: 让 UI 能精确展示当前 Agent 在做什么（"正在思考...", "正在执行命令...", "等待确认"）。

- [x] **1.4 实现工具执行拦截 (Tool Execution Interceptor)**
    - **文件**: `src/main/services/agent/ToolGuard.ts`
    - **设计**:
        - 在 `AgentRuntime` 执行工具前增加拦截逻辑。
        - 检查工具的 `trustLevel` (或 `dangerLevel`)。
        - 若涉及敏感操作，回调通知 UI 申请权限，并将 Agent 状态置为 `AwaitingInput`。
        - 仅在获得用户授权 (`UserApprovedContext`) 后继续执行。

## Phase 1.5: 工具协议集成 (MCP Integration) ✅ COMPLETED

> **目标**: 标准化工具层，集成 Model Context Protocol，扩展 Agent 的物理能力。

- [x] **1.5.1 定义 MCP Client 管理器**
    - **文件**: `src/main/services/tools/mcp/McpManager.ts`
    - **功能**:
        - 负责建立与外部 MCP Server 的 SSE/Stdio 连接。
        - 维护连接池，支持连接状态跟踪 (`McpConnectionState`)。
        - 将 MCP Tools 转换为内部 `ITool` 格式并注册到 `ToolRegistry`。
        - 支持单服务器断开与工具自动清理。
        - 提供 `getConnectionStatuses()` 查询所有连接状态。

## Phase 2: 认知层抽象 (Cognitive Layer) ✅ COMPLETED

> **目标**: 定义统一的 LLM 交互接口，支持无缝切换模型提供商。

- [x] **2.1 定义 IChatModel 接口**
    - **文件**: `src/main/services/llm/IChatModel.ts`
    - **接口定义**:
        ```typescript
        export interface IChatModel {
            providerId: string;
            stream(messages: ChatMessage[], options?: ChatModelOptions): AsyncGenerator<ChatStreamEvent>;
        }
        ```
    - **类型定义**: 规范化 `ChatMessage` (统一 User/Assistant/System/Tool) 和 `ChatStreamEvent` (统一 Delta/ToolCall)。

- [x] **2.2 实现 OpenAIAdapter**
    - **文件**: `src/main/services/llm/providers/OpenAIAdapter.ts`
    - **设计**:
        - 实现 `IChatModel`。
        - 封装 `openai` SDK 实例。
        - 将 OpenAI 的 chunk 格式转换为标准的 `ChatStreamEvent`。
    - **集成**: 在 `AgentRuntime` 中注入 `IChatModel`，替代直接的 `new OpenAI()`。

- [x] **2.3 实现 AnthropicAdapter**
    - **文件**: `src/main/services/llm/providers/AnthropicAdapter.ts`
    - **设计**:
        - 集成 `@anthropic-ai/sdk`。
        - 适配 Claude 3.5 Sonnet 的 Tool Use 格式。
        - 确保 `stream` 输出与 OpenAI Adapter 保持一致。

- [x] **2.4 ChatModelFactory 工厂模式**
    - **文件**: `src/main/services/llm/ChatModelFactory.ts`
    - **设计**:
        - 根据 providerId 自动创建对应的适配器实例
        - 支持 OpenAI、Anthropic、DeepSeek、Local (Ollama) 等提供商
        - DeepSeek/Local 使用 OpenAI 兼容接口

## Phase 3: Skill 系统重构 (Skill System 2.0) ✅ COMPLETED

> **目标**: 实现 "Skill as Data" 理念，区分 Tool (函数) 和 Skill (知识)。

- [x] **3.1 实现 SkillObject 模型与 Parser**
    - **文件**: `src/main/services/skills/core/SkillParser.ts`
    - **设计**:
        - 解析 `SKILL.md` 的 Frontmatter (yaml)。
        - 验证必填字段: `id`, `name`, `description`, `version`。
        - 读取 Markdown 正文作为 `instruction`。

- [x] **3.2 实现 SkillRegistry (注册中心)**
    - **文件**: `src/main/services/skills/core/SkillRegistry.ts`
    - **功能**:
        - `register(skill: SkillObject)`
        - `get(id: string): SkillObject`
        - `getAll(): SkillObject[]`
        - 支持从文件系统扫描 (`Repository` 模式)。

- [x] **3.3 改造 SkillReader (运行时注入)**
    - **文件**: `src/main/services/skills/runtime/SkillReader.ts` (原 SkillReaderTool)
    - **逻辑变更**:
        - 这是一个原子工具 (`tool_type: function`)。
        - 输入: `{ skill_name: string }`。
        - 执行: 调用 `SkillRegistry.get(skill_name)`。
        - 输出: 返回 Skill 的 `instruction` 内容。
        - **关键点**: 确保 System Prompt 中只包含 Skill 列表（名称+描述），而具体内容通过此工具“懒加载”。


## Phase 4: 上下文与状态管理 (Context Engine)

> **目标**: 解决长对话遗忘问题，管理 Token 预算。

- [x] **4.1 实现 TokenCounter**
    - **文件**: `src/main/services/agent/TokenCounter.ts`
    - **设计**: 使用 `tiktoken` 或简单的字符估算 (char count / 4) 作为 MVP。

- [x] **4.2 实现 ContextManager (Sliding Window)**
    - **文件**: `src/main/services/agent/ContextManager.ts`
    - **功能**:
        - `prune(messages: ChatMessage[], maxTokens: number): ChatMessage[]`
        - 策略: 保留 System Prompt，保留最近 N 轮对话，丢弃中间层。
    - **集成**: 在 `AgentRuntime` 调用 LLM 前，先经过 `ContextManager` 处理消息队列。

- [x] **4.3 SessionManager (多会话支持)**
    - **文件**: `src/main/services/session/SessionManager.ts`
    - **设计**:
        - 维护 `Map<sessionId, SessionState>`。
        - `SessionState` 包含: `history`, `variables`, `activeSkillIds`。

- [x] **4.4 实现摘要服务 (Summarization Service)**
    - **文件**: `src/main/services/agent/Summarizer.ts`
    - **功能**:
        - 当上下文超过阈值（如 80% Token Limit），触发后台摘要任务。
        - 使用模型将旧对话压缩为摘要，替换原始历史记录。

## Phase 5: 应用层对接 (Application Layer)

> **目标**: 构建 Electron IPC 通信层，将 Agent 能力暴露给前端 UI。

- [x] **5.1 设计 IPC 通信协议**
    - **文件**: `src/common/ipc/channels.ts` & `src/common/types/agentEvents.ts`
    - **内容**:
        - 定义 Channel 常量 (e.g., `AGENT_START`, `AGENT_STOP`, `SESSION_CREATE`).
        - 定义 Request/Response 类型接口.
        - 定义 Event 类型 (e.g., `token`, `state`, `step`).

- [x] **5.2 实现 AgentController**
    - **文件**: `src/main/controllers/AgentController.ts`
    - **职责**:
        - 接收 IPC 请求。
        - 实例化或复用 `AgentRuntime`。
        - 桥接 `onStream` / `onStepUpdate` 回调到 `WebContents.send`。
        - 处理错误并返回标准化响应。

- [x] **5.3 实现 SessionController**
    - **文件**: `src/main/controllers/SessionController.ts`
    - **职责**:
        - 处理会话的创建、列出、删除。
        - 获取会话历史记录。

- [x] **5.4 注册主进程路由 (AppRouter)**
    - **文件**: `src/main/router.ts` (或 `src/main/ipc.ts`)
    - **职责**:
        - 统一注册所有 Controller 的 `ipcMain.handle`。
        - 确保单例模式的依赖注入 (Service Container)。

