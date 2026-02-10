# 需求文档：多模型动态切换与会话级配置 (Multi-Model Selection)

## 1. 背景与目标 (Background & Objective)
目前 Cowork 采用全局统一的 LLM 配置。为了提升灵活性（例如：用 GPT-4 处理复杂逻辑，用 DeepSeek 处理快速问答），用户需要能在不同会话中独立选择模型。
同时，通过将会话配置从全局设置中解耦，使核心逻辑向“无状态化”演进，直接支撑未来 **Headless Agent Server** 的并发任务处理能力。

## 2. 核心功能需求 (Functional Requirements)

1.  **会话级状态绑定**：每个聊天会话（Session）应记录其选中的 `providerId` 和 `modelName`。
2.  **界面模型选择器**：在输入框（Composer）区域添加模型切换菜单，支持快速在 OpenAI、Claude、DeepSeek 等已配置的模型间切换。
3.  **动态运行时切换**：Agent 在执行 `run` 循环时，应根据当前会话配置动态创建 `IChatModel` 实例，而非固定读取全局默认值。
4.  **模型一致性还原**：重新打开会话或重启应用后，每个会话应保留其最后选中的模型配置。

## 3. 技术实施方案 (Technical Plan)

### 第一阶段：数据模型与持久化 (Infrastructure & Types)
*   **类型定义维护**：在 `src/common/types/chat.ts` 的 `ChatSession` 接口中增加 `providerId?: string` 和 `modelName?: string` 字段。
*   **存储逻辑更新**：更新 `src/main/services/session/SessionStorage.ts`，确保保存和加载 JSON 会话文件时包含模型字段。
*   **通信协议扩展**：在 `src/common/ipc/channels.ts` 定义新的 IPC 频道，用于前端获取可用模型列表及更新会话配置。

### 第二阶段：后端逻辑解耦 (Backend - Agent Kernel)
*   **AgentRuntime 重构**：
    *   修改 `AgentRuntime.run()` 方法，使其优先接受外部传入的提供商配置。
    *   优化 `ChatModelFactory` 的调用逻辑，支持根据会话上下文动态实例化适配器。
*   **配置注入优化**：确保 `AgentRuntime` 能够脱离 `AppSettings` 进行实例化，为 Headless Server 模式下的依赖注入做准备。

### 第三阶段：前端 UI 与状态管理 (Renderer - UI)
*   **Zustand Store 扩展**：在 `useChatStore.ts` 中添加管理当前会话模型状态的 Action。
*   **模型选择组件**：新建 `ModelSelector.tsx` 组件，展示模型图标和名称。
*   **输入框集成**：将选择器集成到 `Composer.tsx`，确保切换模型时能即时响应并更新 Store。

## 4. 验收标准 (Acceptance Criteria)
*   [ ] 用户在 Session A 切换为 Claude，在 Session B 切换为 GPT-4，两者互不干扰。
*   [ ] 应用重启后，Session A 依然默认选择 Claude。
*   [ ] 当用户未在全局设置中配置某个 Provider 的 API Key 时，模型选择器应有相应的视觉提示或置灰处理。
*   [ ] 核心 Agent 执行逻辑测试：能同时启动两个指向不同模型的 Agent 实例。

## 5. 对 Headless Server 的意义
*   **请求级隔离**：消除了对单例全局配置的依赖。
*   **分布式支持**：Session 文件作为配置载体，可以轻松移植到数据库或分布式存储中，作为 Server 端任务分配的依据。
