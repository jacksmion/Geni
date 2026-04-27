# Geni

[English](#english) | [中文](#中文)

---

## English

> **Your AI-Powered Collaborative Workspace Assistant**
> *Enabling inspiration through intelligence.*

Geni is a modern desktop application designed to bridge the gap between AI intelligence and your local workflow. Built with **Electron**, **React**, and **Model Context Protocol (MCP)**, Geni offers a seamless environment for AI-assisted coding, writing, and problem-solving.

## Features

- **Intelligent Chat Interface**: Interact with advanced AI models (Claude, GPT-4, DeepSeek, Qwen, etc.) in a deeply integrated chat environment.
- **Model Context Protocol (MCP)**: Extensible architecture supporting MCP servers for file system access, terminal execution, and more.
- **Built-in Tools**:
  - **FileSystem**: Read, write, edit, and search files directly from the chat.
  - **Terminal**: Execute shell commands securely.
  - **Web**: Fetch web pages and search the internet.
  - **Memory**: Persistent memory storage across sessions.
  - **Task**: Todo list management.
  - **Cron**: Schedule automated tasks.
- **Digital Staff**: Create and manage AI personas with customizable behaviors and specialties.
- **Scheduler**: Cron-based automated task execution with IM notifications.
- **Multi-Platform IM Integration**: Connect with Telegram, WeCom, Lark, and WeChat.
- **Skill System**: Extensible knowledge capsules for specialized tasks (code review, git operations, etc.).
- **Premium UI/UX**:
  - Modern, responsive design with **Tailwind CSS v4**.
  - Dark/Light mode support.
  - Beautiful Markdown rendering with syntax highlighting, Mermaid diagrams, and code artifacts.
- **High Performance**: Powered by Vite for lightning-fast HMR and build times.

## Tech Stack

| Category | Technology |
|----------|------------|
| Core | Electron 40, React 19, TypeScript 5.9 |
| Build Tool | Vite 7 |
| Styling | Tailwind CSS v4 |
| State Management | Zustand |
| AI Integration | MCP SDK, Anthropic SDK, OpenAI SDK |
| Testing | Vitest |

## Architecture

Geni adopts a **Three-Layer Agent Architecture**:

```text
┌─────────────────────────────────────────────────────────────┐
│ Agent (Config Layer) - id, name, modelId, systemPrompt,    │
│ skills                                                     │
├─────────────────────────────────────────────────────────────┤
│ Runtime - Lifecycle, Context Assembly, Events              │
├─────────────────────────────────────────────────────────────┤
│ Executor - ReAct Loop, LLM Calls, Tool Execution           │
└─────────────────────────────────────────────────────────────┘
```

### System Layers

- **Trigger Layer**: Scheduler, IM adapters (Telegram, WeCom, Lark, WeChat)
- **Application Layer**: Controllers handling IPC requests
- **Agent Kernel**: Runtime + Executor + PromptBuilder + ToolGuard
- **Cognitive Layer**: Unified LLM interface (`IChatModel`)
- **Capability Layer**: Tools (`ITool`) + Skills (Knowledge Capsules)
- **Infrastructure Layer**: Storage, Config, System services

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or pnpm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/geni.git
   cd geni
   ```

2. (Optional) Set Electron mirror for faster download (recommended for users in China):

   - **Windows (PowerShell)**:

     ```powershell
     $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
     ```

   - **macOS/Linux**:

     ```bash
     export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
     ```

3. Install dependencies:

   ```bash
   npm install
   ```

### Development

Start the development server (runs both Electron main process and React renderer):

```bash
npm run dev
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run test` | Run unit tests |
| `npm run lint` | Run ESLint |
| `npm run dist:win` | Build Windows installer |
| `npm run dist:mac` | Build macOS app |
| `npm run dist:linux` | Build Linux package |

## Screenshots

### Chat Workspace

![Chat Workspace](docs/images/chat-home.png)

### Settings

![Settings](docs/images/setting.png)

### Skills

![Skills](docs/images/skills.png)

### Digital Staff

![Digital Staff](docs/images/agent.png)

## Project Structure

```text
geni/
├── src/
│   ├── common/                # Shared types and IPC definitions
│   │   ├── types/             # TypeScript type definitions
│   │   │   ├── agent.ts       # Agent interface
│   │   │   ├── chat.ts        # ChatMessage, ToolCall, AgentStep
│   │   │   ├── settings.ts    # AppSettings, ProviderConfig
│   │   │   ├── skill.ts       # Skill types
│   │   │   ├── tool.ts        # ITool interface
│   │   │   └── ...
│   │   ├── ipc/               # IPC channel constants
│   │   └── i18n/              # Internationalization (en, zh)
│   ├── main/                  # Electron main process
│   │   ├── main.ts            # Entry point
│   │   ├── preload.ts         # Context isolation bridge
│   │   ├── router.ts          # DI container
│   │   ├── controllers/       # IPC request handlers
│   │   └── services/
│   │       ├── agent/         # Agent Kernel (Three-Layer)
│   │       │   ├── runtime/   # AgentRuntime
│   │       │   ├── executor/  # ReActExecutor
│   │       │   ├── state/     # AgentState
│   │       │   └── ...
│   │       ├── llm/           # LLM adapters
│   │       │   └── providers/ # OpenAI, Anthropic
│   │       ├── tools/         # Tool system
│   │       │   ├── core/      # Built-in tools
│   │       │   └── mcp/       # MCP integration
│   │       ├── skills/        # Skill registry
│   │       ├── session/       # Chat session management
│   │       ├── scheduler/     # Cron task scheduler
│   │       ├── im/            # IM adapters
│   │       ├── staff/         # Digital staff
│   │       ├── memory/        # Memory storage
│   │       ├── usage/         # API usage tracking
│   │       └── update/        # Auto-update
│   └── renderer/              # React frontend
│       ├── App.tsx            # Root component
│       ├── components/        # UI components
│       ├── layouts/           # Page layouts
│       ├── pages/             # Full page components
│       │   └── settings/      # Settings pages
│       ├── modules/           # Feature modules
│       │   └── chat/          # Chat components
│       └── store/             # Zustand stores
├── skills/                    # Built-in skills
│   ├── find-skills/
│   ├── skill-creator/
│   └── web-search/
├── build/                     # Icons and resources
├── release/                   # Packaged output
└── tests/                     # Unit tests (Vitest)
```

## License

This project is released under the [Business Source License 1.1](LICENSE).

- Free of charge for personal use, academic research, teaching, evaluation, and internal use by non-profit organizations
- Commercial use requires a separate license
- Commercial licensing contact: [@jacksmion on X](https://x.com/jacksmion)
- Change Date: `2029-06-18`
- Change License: `Apache License 2.0`

This is a source-available license, not an OSI-approved open source license, until the Change Date takes effect.

---

## 中文

> **你的 AI 协作工作台助手**
> *让灵感借由智能高效落地。*

Geni 是一款现代桌面应用，致力于连接 AI 能力与本地工作流。它基于 **Electron**、**React** 和 **Model Context Protocol (MCP)** 构建，为 AI 辅助编程、写作和问题解决提供流畅的一体化环境。

## 功能特性

- **智能对话界面**：在深度集成的聊天环境中与 Claude、GPT-4、DeepSeek、Qwen 等先进模型协作。
- **模型上下文协议（MCP）**：采用可扩展架构，支持通过 MCP Server 访问文件系统、执行终端命令等能力。
- **内置工具**：
  - **文件系统**：可直接在对话中读取、写入、编辑和搜索文件。
  - **终端**：安全执行 Shell 命令。
  - **网络**：抓取网页内容并进行联网搜索。
  - **记忆**：跨会话持久化保存记忆。
  - **任务**：管理待办事项列表。
  - **定时任务**：支持自动化定时执行。
- **数字员工**：创建和管理具备不同性格、行为与专长的 AI 角色。
- **调度系统**：基于 Cron 的自动任务执行，并可结合 IM 通知。
- **多平台 IM 集成**：支持 Telegram、企业微信、飞书和微信。
- **技能系统**：通过知识胶囊扩展特定能力，例如代码评审、Git 操作等。
- **优质 UI/UX**：
  - 基于 **Tailwind CSS v4** 的现代响应式界面。
  - 支持深色 / 浅色模式。
  - 优秀的 Markdown 渲染体验，支持语法高亮、Mermaid 图表和代码工件展示。
- **高性能体验**：由 Vite 驱动，提供极快的热更新与构建速度。

## 技术栈

| 类别 | 技术 |
|------|------|
| 核心 | Electron 40, React 19, TypeScript 5.9 |
| 构建工具 | Vite 7 |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Zustand |
| AI 集成 | MCP SDK, Anthropic SDK, OpenAI SDK |
| 测试 | Vitest |

## 架构

Geni 采用 **三层 Agent 架构**：

```text
┌─────────────────────────────────────────────────────────────┐
│ Agent（配置层）- id, name, modelId, systemPrompt, skills   │
├─────────────────────────────────────────────────────────────┤
│ Runtime（运行时）- 生命周期、上下文组装、事件管理          │
├─────────────────────────────────────────────────────────────┤
│ Executor（执行器）- ReAct 循环、LLM 调用、工具执行         │
└─────────────────────────────────────────────────────────────┘
```

### 系统分层

- **触发层**：Scheduler、IM 适配器（Telegram、企业微信、飞书、微信）
- **应用层**：处理 IPC 请求的各类 Controller
- **Agent 内核**：Runtime + Executor + PromptBuilder + ToolGuard
- **认知层**：统一的 LLM 接口（`IChatModel`）
- **能力层**：工具（`ITool`）与技能（知识胶囊）
- **基础设施层**：存储、配置和系统服务

## 快速开始

### 环境要求

- Node.js（推荐 v18 或更高版本）
- npm 或 pnpm

### 安装

1. 克隆仓库：

   ```bash
   git clone https://github.com/yourusername/geni.git
   cd geni
   ```

2. （可选）为 Electron 设置镜像源以加快下载速度，推荐中国大陆用户使用：

   - **Windows（PowerShell）**：

     ```powershell
     $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
     ```

   - **macOS / Linux**：

     ```bash
     export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
     ```

3. 安装依赖：

   ```bash
   npm install
   ```

### 开发

启动开发环境（同时运行 Electron 主进程与 React 渲染进程）：

```bash
npm run dev
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发环境 |
| `npm run build` | 构建生产版本 |
| `npm run test` | 运行单元测试 |
| `npm run lint` | 执行 ESLint 检查 |
| `npm run dist:win` | 构建 Windows 安装包 |
| `npm run dist:mac` | 构建 macOS 应用 |
| `npm run dist:linux` | 构建 Linux 安装包 |

## 界面预览

### 聊天工作区

![聊天工作区](docs/images/chat-home.png)

### 设置

![设置](docs/images/setting.png)

### 技能

![技能](docs/images/skills.png)

### 数字员工

![数字员工](docs/images/agent.png)

## 项目结构

```text
geni/
├── src/
│   ├── common/                # 共享类型与 IPC 定义
│   │   ├── types/             # TypeScript 类型定义
│   │   │   ├── agent.ts       # Agent 接口
│   │   │   ├── chat.ts        # ChatMessage、ToolCall、AgentStep
│   │   │   ├── settings.ts    # AppSettings、ProviderConfig
│   │   │   ├── skill.ts       # Skill 类型
│   │   │   ├── tool.ts        # ITool 接口
│   │   │   └── ...
│   │   ├── ipc/               # IPC 通道常量
│   │   └── i18n/              # 国际化资源（en、zh）
│   ├── main/                  # Electron 主进程
│   │   ├── main.ts            # 应用入口
│   │   ├── preload.ts         # 上下文隔离桥接层
│   │   ├── router.ts          # 依赖注入组合根
│   │   ├── controllers/       # IPC 请求处理器
│   │   └── services/
│   │       ├── agent/         # Agent 内核（三层架构）
│   │       │   ├── runtime/   # AgentRuntime
│   │       │   ├── executor/  # ReActExecutor
│   │       │   ├── state/     # AgentState
│   │       │   └── ...
│   │       ├── llm/           # LLM 适配层
│   │       │   └── providers/ # OpenAI、Anthropic
│   │       ├── tools/         # 工具系统
│   │       │   ├── core/      # 内置工具
│   │       │   └── mcp/       # MCP 集成
│   │       ├── skills/        # Skill 注册与加载
│   │       ├── session/       # 会话管理
│   │       ├── scheduler/     # Cron 调度器
│   │       ├── im/            # IM 适配器
│   │       ├── staff/         # 数字员工
│   │       ├── memory/        # 记忆存储
│   │       ├── usage/         # API 使用统计
│   │       └── update/        # 自动更新
│   └── renderer/              # React 渲染进程
│       ├── App.tsx            # 根组件
│       ├── components/        # UI 组件
│       ├── layouts/           # 页面布局
│       ├── pages/             # 完整页面组件
│       │   └── settings/      # 设置页
│       ├── modules/           # 功能模块
│       │   └── chat/          # 聊天模块
│       └── store/             # Zustand 状态仓库
├── skills/                    # 内置技能
│   ├── find-skills/
│   ├── skill-creator/
│   └── web-search/
├── build/                     # 图标与资源文件
├── release/                   # 打包产物
└── tests/                     # 单元测试（Vitest）
```

## 许可证

本项目采用 [Business Source License 1.1](LICENSE)。

- 个人使用、学术研究、教学评估、非营利组织内部使用：免费
- 商业使用：需要单独商业授权
- 商业授权联系：[@jacksmion on X](https://x.com/jacksmion)
- 转换日期：`2029-06-18`
- 转换后协议：`Apache License 2.0`

在转换日期生效前，这是一种源码可见许可，不属于 OSI 认可的开源许可证。
