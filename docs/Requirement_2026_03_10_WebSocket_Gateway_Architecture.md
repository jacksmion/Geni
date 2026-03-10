# Geni 项目 - 多端架构与统一网关 (WebSocket Gateway) 设计

> **日期**: 2026-03-10
> **状态**: 技术设计与需求规划
> **目标**: 采用“多端适配器”架构，在保留现有 Electron 桌面端极致性能与安全性的基础上，引入统一的接入网关 (Gateway)。借此实现对纯网页 WebUI、终端 CLI 以及各种即时通讯平台 (如 Telegram、微信) 的全面支持，达成“一脑多端”的战略升级。

## 1. 核心架构升级：多端适配器模式 

为了坚守“KISS（保持简单）”和“YAGNI（不折腾不需要的功能）”原则，我们**不破坏**当前桌面端 Electron 稳定且高效的 IPC 通信链路。
架构将被划分为清晰的三层，将现有的 IPC 与新增的 Gateway 作为平级的“接入适配器”：

```text
┌───────────────────────────────────────────────────────────────────┐
│                          3. 客户端展示层                           │
│  [Electron 渲染进程]     [浏览器 WebUI / 终端 CLI]    [IM 工具 (Telegram)] │
│ (走 window.electronAPI)    (走 WsClient 标准协议)       (Telegram 服务器) │
└─────────┬────────────────────────┬──────────────────────┬─────────┘
          │ (本地 IPC)             │ (WebSocket / HTTP)   │ (Long Polling/Webhook)
┌─────────▼──────────────┐ ┌───────▼──────────────────────▼─────────┐
│      IPC 接入层          │ │                网关接入层              │
│ (src/main/controllers) │ │           (src/server/gateway)         │
└─────────┬──────────────┘ └───────┬──────────────────────┬─────────┘
          │                        │ (协议解析与路由剥离)     │
┌─────────▼────────────────────────▼──────────────────────▼─────────┐
│               1. 核心业务层 (Agent 胖服务, 完全纯净的 Node)              │
│      (src/main/services: AgentRuntime, SessionManager 等)           │
└───────────────────────────────────────────────────────────────────┘
```

## 2. 统一网关 (Gateway) 的四大核心职责

网关本质上是一个“翻译官 + 调度中心”，内部**不包含**任何核心 AI 业务逻辑（如调用工具、LLM 推理）。它的职责仅限于数据的出入口管理：

1. **多协议网络托管**: 
   - **HTTP 服务**: 负责下发构建好的纯 WebUI 静态文件，以及接收某些一次性的 RESTful API 请求或外部系统的 Webhook（如钉钉、Slack 等推送）。
   - **WebSocket 服务**: 挂载在相同的端口上，提供全双工通信管道，专门应对 Agent 的高频执行步骤抛出、实时流式打字输出、以及拦截高危动作的弹窗确认机制。
2. **连接与会话路由**: 内部维护一份 `activeConnections` 连接池，负责将传入的网络请求精准绑定并路由给后端的某个 `sessionId`。
3. **协议翻译与标准化**: 将外部发来的繁杂数据包（如 websocket JSON 或者 Telegram 的 Context），扒出纯指令参数后，交给下一层；将底层吐出的纯数据对象，打包穿上各平台所需的外衣（JSON-RPC 或第三方 API 请求）。
4. **节流与缓冲发布**: 应对类似微信或 Telegram 这种无法接收单个字符流式更新的 IM 平台，Gateway 的专门 Connector 会拦截 Agent 的 `onStream` 打字流，并基于时间窗口 (Throttling) 或字数 (Buffering) 拼装后再调用 IM 的修改消息接口。

## 3. 标准通信协议定义 (Standard Protocol)

要接纳百花齐放的 UI 与 IM 端，我们要在网关和底层业务之间，以及网关与客户端之间，制定两套不可逾越的标准。

### 3.1 内部核心接口标准 (Service Layer ABI)
不管外部是 CLI、WebUI 还是 Telegram，网关在处理完请求后，往核心底层的投递模型必须是绝对严格统一的纯数据结构（不包含任何外部框架的请求对象或事件对象）。

```typescript
// 内部引擎只接受这样纯净的请求
interface AgentTaskRequest {
    sessionId: string;
    prompt: string;
    attachments?: string[];
}
// 引擎只发出这样的纯净事件
interface AgentEvent {
    type: 'stream' | 'step' | 'auth_request' | 'error' | 'done';
    payload: any;
}
```

### 3.2 外部暴露协议规范 (基于 WebSocket 的 JSON-RPC)
对于主动连接网关的 WebUI 或 CLI，它们须遵循标准的 JSON-RPC 2.0 格式进行双向通信。
- **客户端发送 (请求)**: 附带操作名 (`method`) 和唯一追踪凭据 (`reqId`)。
- **服务端推送 (流/事件)**: 针对会话广播流数据与拦截事件。

## 4. 特殊异构平台的接入：以 Telegram (Grammy) 为例

很多现代 IM 平台（如 Telegram）并非通过主动发 JSON 到我们的 WS 端口，而是通过**长轮询 (Long Polling)** 加载事件。我们可以在 Gateway 内部单独开辟一个 Connector / Adapter 来负责这块的无缝翻译。

**处理流转过程**:
1. Gateway 内实例化 `bot` 长轮询实例，主动拉取 Telegram 服务器上的用户文字消息。
2. 翻译官 Adapter 从 `ctx.message.text` 抽取文本，映射获得 `sessionId`，并封装为 `AgentTaskRequest` 送给底层大脑 `AgentRuntime`。
3. **节流重组核心策略**: 底层一字一字抛出 `onStream` 流，Adapter 内部设置一个节流锁（例如 1.5 秒），定期将累加的文本字符通过调用 `ctx.api.editMessageText` 刷新回 Telegram 会话框。避免因高频刷新遭遇“429 Too Many Requests”限流惩罚。
4. 如果遇到底层抛出的 `auth_request` 授权高危命令拦截事件，Adapter 则将其翻译重组并以 **“交互按钮 (Inline Keyboard)”** 的形式下发给用户；用户点击后再发回回调路由，由 Adapter 放行底层挂起的挂起器 (Promise)。

## 5. 实施路线图建议

为了保证平稳过渡，推荐分三个阶段实施：
*   **第 1 阶段 (接口统一与服务纯净度检查)**: 审视并翻新 `src/common/types/protocol.ts` 或类似文件，建立上方提到的核心层标准输入输出协议模型。保证底层 `services` 目录的纯 Node 化运行能力。
*   **第 2 阶段 (Gateway 骨架搭建)**: 使用 `express` + `ws` 构建独立的 `src/server/gateway.ts` 服务入口。
*   **第 3 阶段 (各端接入与适配器开发)**: 
    * 前端 WebUI 代码内抽离抽象实现 `WsApiClient`。
    * 建立如 `TelegramAdapter.ts` 对接外部特有系统。 
*   **并线兼容阶段**: 桌面版 `.exe` 启动时，维持原有基于 Electron Native 的高稳定 `ipcMain` 分发控制器继续独立运行，两者互不干扰。
