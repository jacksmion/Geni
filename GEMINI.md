# Geni Project - AI Agent Documentation

> **Last Updated**: 2026-04-07  
> **Architecture Version**: V3.3 - Layered Architecture

## 1. Project Overview

**Geni** is an Electron-based AI coding assistant designed to act as a "Virtual Pair Programmer". It adopts a **Layered Architecture** with clear separation of concerns:

- **Trigger Layer**: External event sources (Scheduler, IM)
- **Application Layer**: Controllers handling requests
- **Agent Kernel**: Core runtime with explicit state machine
- **Cognitive Layer**: LLM provider abstraction
- **Capability Layer**: Tools (Functions) + Skills (Knowledge)
- **Infrastructure Layer**: Storage, Config, and System services

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Trigger Layer (外部触发源)                     │
│           SchedulerService │ IMServiceManager                    │
│           (Cron Jobs)    │  (Telegram │ WeCom │ Lark │ Wechat)  │
├─────────────────────────────────────────────────────────────────┤
│                   Application Layer (Controllers)                │
│    AgentController │ SessionController │ SystemController        │
│    ToolController │ SchedulerController │ StaffController         │
│    UpdateController │ AppRouter (DI)                            │
├─────────────────────────────────────────────────────────────────┤
│                        Agent Kernel                              │
│   AgentRuntime │ PromptBuilder │ ToolGuard │ ContextManager     │
│   TokenCounter │ Summarizer │ RetryPolicy │ ErrorClassifier     │
├─────────────────────────────────────────────────────────────────┤
│                    Cognitive Layer (LLM)                         │
│         IChatModel │ OpenAIAdapter │ AnthropicAdapter          │
├─────────────────────────────────────────────────────────────────┤
│                 Capability Layer                                 │
│   ToolRegistry │ CoreToolManager │ MCP │ SkillRegistry          │
├─────────────────────────────────────────────────────────────────┤
│                Infrastructure Layer                              │
│   SessionManager │ MemoryStore │ UsageManager                     │
│   PathManager │ ConfigManager │ SystemTrayManager                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Core Design Principles

- **Tool-First Philosophy**: The Agent's core loop is `Think -> Act (Call Tool) -> Observe (Result) -> Reflect`.
- **ITool Interface**: The universal atom of capability. Everything is wrapped as an `ITool`.
- **Skill as Data**: Skills are "knowledge capsules" (SOP, expert experience), not executable functions.
- **Lazy Loading**: System Prompt only contains skill catalog; full content loaded via `load_skill`.
- **Model Agnostic**: Single interface (`IChatModel`) for all LLM providers.
- **Single Source of Truth for Types**: All shared types (`ChatMessage`, `ToolCall`, `AgentStep`) defined in `common/types/`.

### 2.2 System Layers

#### Trigger Layer
- **Components**: SchedulerService, IMServiceManager
- **Role**: External event sources that trigger Agent execution
- **Scheduler**: Cron-based scheduled tasks
- **IM**: Multi-platform messaging (Telegram, WeCom, Lark, WeChat)

#### Frontend (Renderer)
- **Tech**: React 19, Tailwind v4, Zustand, TypeScript 5.9
- **Role**: UI presentation, state management, input handling
- **Key Components**: `Composer` (input), `ChatLayout` (view), Settings pages, `ArtifactPanel`
- **Stores**: `useChatStore`, `useSettingsStore`, `useLayoutStore`, `useModalStore`, `useStaffStore`

#### Backend (Main Process)
- **Tech**: Electron 40, Node.js runtime
- **Role**: Orchestrates the AI Agent, executes tools, handles file system operations
- **Entry Point**: `src/main/main.ts` -> `AppRouter` (DI Container)

#### Shared (Common)
- Types and interfaces shared between processes (`src/common`)
- IPC channel definitions (`src/common/ipc/channels.ts`)
- Internationalization (`src/common/i18n/`)

## 3. The Agent System

### 3.1 Agent Runtime (`src/main/services/agent/AgentRuntime.ts`)

The agent implements a **ReAct-like loop** (Reasoning + Acting) with explicit state machine:

#### State Machine States
| State | Description |
|:------|:------------|
| `Idle` | Agent not executing any task |
| `Thinking` | Calling LLM, generating response |
| `ExecutingHelper` | Processing LLM output |
| `ExecutingTool` | Executing tool calls |
| `AwaitingInput` | Waiting for user authorization |
| `Error` | Execution error occurred |
| `Aborted` | User interrupted execution |

#### Execution Loop
1. **Context Construction**: System Prompt + Skills + Tools + History
2. **Call LLM**: Sends prompt + Tool Definitions (Function Calling)
3. **Stream Handling**: Parallel tool calls parsed via `Map<index, ToolCallAccumulator>`
4. **Authorization Check**: ToolGuard evaluates risk and requests user approval if needed
5. **Tool Execution**: Validated commands executed via `ToolRegistry`
6. **Observation**: Result returned to LLM (truncated if too large)
7. **Self-Correction**: If tool fails, a "Reflect" hint added to next prompt
8. **Retry Logic**: RetryPolicy handles transient failures with exponential backoff

### 3.2 Key Agent Components

| Component | File | Purpose |
|:----------|:-----|:--------|
| `AgentRuntime` | `agent/AgentRuntime.ts` | Core execution loop, ReAct pattern |
| `PromptBuilder` | `agent/PromptBuilder.ts` | Constructs system prompt with context |
| `AgentStateManager` | `agent/state/AgentState.ts` | Explicit state machine management |
| `ToolGuard` | `agent/ToolGuard.ts` | Security interceptor, authorization |
| `ContextManager` | `agent/ContextManager.ts` | Token budget, sliding window pruning |
| `TokenCounter` | `agent/TokenCounter.ts` | Token estimation (char/4) |
| `Summarizer` | `agent/Summarizer.ts` | Long conversation summarization |
| `RetryPolicy` | `agent/RetryPolicy.ts` | Retry strategy with backoff |
| `ErrorClassifier` | `agent/ErrorClassifier.ts` | Classify and handle errors |
| `IAgent` | `agent/IAgent.ts` | Agent interface definition |

## 4. Cognitive Layer (LLM Abstraction)

### 4.1 IChatModel Interface (`src/main/services/llm/IChatModel.ts`)

Unified interface for all LLM providers:

```typescript
interface IChatModel {
    readonly providerId: string;
    readonly modelName: string;
    stream(messages: ChatMessage[], options?: ChatModelOptions): AsyncGenerator<ChatStreamEvent>;
    invoke?(messages: ChatMessage[], options?: ChatModelOptions): Promise<ChatMessage>;
}
```

### 4.2 Supported Providers

| Provider | Adapter | Notes |
|:---------|:--------|:------|
| OpenAI | `OpenAIAdapter` | GPT-4, GPT-4o, etc. |
| Anthropic | `AnthropicAdapter` | Claude 3.5 Sonnet, Opus |
| DeepSeek | `OpenAIAdapter` | OpenAI-compatible API |
| ZhipuAI | `OpenAIAdapter` | 智谱 GLM |
| Volcengine | `OpenAIAdapter` | 火山引擎 |
| Qwen | `OpenAIAdapter` | 阿里通义 |
| MiniMax | `OpenAIAdapter` | MiniMax |
| Local (Ollama/LM Studio) | `OpenAIAdapter` | OpenAI-compatible API |

### 4.3 Stream Event Types

| Event Type | Description |
|:-----------|:------------|
| `content_delta` | Text content increment |
| `reasoning_delta` | Reasoning content increment (DeepSeek R1) |
| `tool_call_delta` | Tool call argument increment |
| `message_start` | Message began |
| `message_end` | Message completed (with usage stats) |
| `error` | Error occurred |

## 5. Tools & Capabilities

### 5.1 Tool Registry (`src/main/services/tools/ToolRegistry.ts`)

Central registry for all available tools. Maps tool names to implementations.

### 5.2 CoreToolManager (`src/main/services/tools/core/CoreToolManager.ts`)

Manages lifecycle of built-in tools: registration, refresh on settings change, trust levels.

### 5.3 Built-in Tools (`src/main/services/tools/core/`)

| Tool Name | Class | Description |
|:----------|:------|:------------|
| `list` | `ListDirTool` | Lists files and directories in a path |
| `read` | `ReadFileTool` | Reads file content with line range support |
| `write` | `WriteFileTool` | Writes/overwrites/appends file content |
| `edit` | `FileEditTool` | Smart search & replace in files |
| `bash` | `BashTool` | Executes shell commands (PowerShell/Bash) |
| `glob` | `GlobTool` | Finds files via glob patterns |
| `grep` | `GrepTool` | Searches for text patterns within files |
| `load_skill` | `SkillLoaderTool` | Loads full instructions for a specific skill |
| `web_fetch` | `WebFetchTool` | Fetches webpage content and converts to markdown |
| `environment_info` | `EnvironmentInfoTool` | Retrieves OS and project context information |
| `todowrite` | `TodoWriteTool` | Creates/updates the entire todo list |
| `todoread` | `TodoReadTool` | Reads the current todo list |
| `memorize` | `MemorizeTool` | Stores information in agent memory |
| `cron` | `CronTool` | Schedules cron-based tasks |

### 5.4 MCP Integration (`src/main/services/tools/mcp/`)

Model Context Protocol support for external tool servers:

| Component | File | Purpose |
|:----------|:-----|:--------|
| `McpManager` | `mcp/McpManager.ts` | Connection pool, lifecycle management |
| `McpToolAdapter` | `mcp/McpToolAdapter.ts` | Converts MCP tools to `ITool` format |

Supports both **Stdio** and **SSE** transport methods.

## 6. Skill System

### 6.1 Skill Philosophy

Skills are **"pluggable knowledge capsules"**:
- **Nature**: NOT executable code, but SOP, expert experience, prompt templates
- **Purpose**: Let Agent "download" expert thinking patterns for specific tasks
- **Consumption**: Lazy Loading via `load_skill` tool

### 6.2 Skill Components (`src/main/services/skills/`)

| Component | File | Purpose |
|:----------|:-----|:--------|
| `SkillParser` | `core/SkillParser.ts` | Parses SKILL.md frontmatter (zod validation) |
| `SkillRegistry` | `core/SkillRegistry.ts` | Skill registration center |

### 6.3 Built-in Skills (`skills/`)

| Skill | Description |
|:------|:------------|
| `find-skills` | Find and search available skills |
| `skill-creator` | Create new skills |
| `web-search` | Web search capability |

### 6.4 SKILL.md Format

```yaml
---
id: git-expert
name: Git Expert
description: Expert knowledge for Git operations
version: 1.0.0
---

# Instructions

[Detailed SOP and expert guidance here]
```

## 7. Session Management (`src/main/services/session/`)

| Component | File | Purpose |
|:----------|:-----|:--------|
| `SessionManager` | `SessionManager.ts` | In-memory cache + persistence coordination |
| `SessionStorage` | `SessionStorage.ts` | File system persistence |

### 7.1 Session Structure

```typescript
interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    variables: Record<string, any>;
    activeSkillIds: string[];
    createdAt: number;
    updatedAt: number;
}
```

## 8. Digital Staff System (`src/main/services/staff/`)

Manages AI personas/assistants with configurable behaviors:

| Component | File | Purpose |
|:----------|:-----|:--------|
| `StaffManager` | `StaffManager.ts` | Digital staff lifecycle management |
| `Staff` | `Staff.ts` | Staff definition and configuration |
| `StaffRegistry` | `StaffRegistry.ts` | Staff registration and lookup |

## 9. IM Integration (`src/main/services/im/`)

Multi-platform instant messaging adapters:

| Platform | Adapter | File |
|:---------|:--------|:-----|
| Telegram | `TelegramAdapter` | `adapters/TelegramAdapter.ts` |
| 企业微信 | `WeComAdapter` | `adapters/WeComAdapter.ts` |
| 飞书 | `LarkAdapter` | `adapters/LarkAdapter.ts` |
| 个人微信 | `WechatAdapter` | `adapters/WechatAdapter.ts` |

| Component | File | Purpose |
|:----------|:-----|:--------|
| `IMServiceManager` | `IMServiceManager.ts` | Unified IM service management |
| `IIMAdapter` | `IIMAdapter.ts` | IM adapter interface |

## 10. Scheduler System (`src/main/services/scheduler/`)

Cron-based task scheduling with IM notification support:

| Component | File | Purpose |
|:----------|:-----|:--------|
| `SchedulerService` | `SchedulerService.ts` | Cron job management |
| `SchedulerStorage` | `SchedulerStorage.ts` | Task persistence |
| `SchedulerLog` | `SchedulerLog.ts` | Execution history logging |

## 11. Memory & Usage Tracking

| Component | File | Purpose |
|:----------|:-----|:--------|
| `MemoryStore` | `memory/MemoryStore.ts` | Persistent memory storage |
| `UsageManager` | `usage/UsageManager.ts` | API usage statistics and tracking |

## 12. Auto-Update System (`src/main/services/update/`)

| Component | File | Purpose |
|:----------|:-----|:--------|
| `UpdateService` | `UpdateService.ts` | App update management |

## 13. Shared Type System (`src/common/types/`)

All shared types are defined in `src/common/types/` as the **Single Source of Truth**:

| Type | File | Used By |
|:-----|:-----|:--------|
| `ChatMessage` | `chat.ts` | LLM layer, Agent, Session, UI |
| `ToolCall` | `chat.ts` | LLM layer, Agent, UI |
| `AgentStep` | `chat.ts` | Agent, UI |
| `ChatSession` | `chat.ts` | Session, UI |
| `agent` | `agent.ts` | Agent core types |
| `agentEvents` | `agentEvents.ts`| IPC request/response types |
| `ITool` | `tool.ts` | Tools, Agent |
| `Skill` | `skill.ts` | Skills, Agent |
| `AppSettings` | `settings.ts` | All layers |
| `staff` | `staff.ts` | Digital staff types |
| `usage` | `usage.ts` | Usage tracking types |
| `update` | `update.ts` | Update types |

> **Important**: The LLM layer (`IChatModel.ts`) re-exports `ChatMessage`, `ToolCall`, and `ChatMessageRole` from `common/types/chat.ts`. Do NOT define duplicate types.

## 14. IPC & Controllers

### 14.1 Controller Layer (`src/main/controllers/`)

| Controller | File | Purpose |
|:-----------|:-----|:--------|
| `AgentController` | `AgentController.ts` | Agent start/stop, event bridging |
| `SchedulerController`| `SchedulerController.ts` | Schedules and manages timed background tasks |
| `SessionController` | `SessionController.ts` | Session CRUD, history |
| `SystemController` | `SystemController.ts` | Settings, file dialogs, LLM test |
| `ToolController` | `ToolController.ts` | Skill toggle, MCP management |
| `StaffController` | `StaffController.ts` | Digital staff management |
| `UpdateController` | `UpdateController.ts` | App update operations |

### 14.2 IPC Channels (`src/common/ipc/channels.ts`)

```typescript
// Agent
agent:start, agent:stop, agent:get-state

// Agent Events (Server -> Client)
agent:stream, agent:step, agent:state, agent:error

// Session
session:create, session:list, session:get, session:delete, session:get-history

// System
system:get-settings, system:save-settings, system:select-file, system:test-llm

// Tools
tool:get-skills, tool:toggle-skill, tool:mcp-connect, tool:mcp-list-tools

// Scheduler
scheduler:create, scheduler:list, scheduler:delete, scheduler:toggle

// Staff
staff:list, staff:get, staff:create, staff:update, staff:delete

// Update
update:check, update:download, update:install
```

### 14.3 AppRouter (`src/main/router.ts`)

Acts as the **Dependency Injection Container**:
- Instantiates all services and controllers
- Wires dependencies together
- Initializes all IPC handlers

## 15. Frontend Structure (`src/renderer/`)

### 15.1 Pages

| Page | File | Description |
|:-----|:-----|:------------|
| Settings | `pages/Settings.tsx` | Main settings container |
| SchedulerPage | `pages/SchedulerPage.tsx` | Cron task management |
| StaffPage | `pages/StaffPage.tsx` | Digital staff management |

### 15.2 Settings Pages (`pages/settings/`)

| Page | Description |
|:-----|:------------|
| `GeneralSettings.tsx` | General preferences |
| `ModelSettings.tsx` | LLM model configuration |
| `SkillSettings.tsx` | Skill management |
| `MCPSettings.tsx` | MCP server configuration |
| `IMSettings.tsx` | IM platform settings |
| `AboutSettings.tsx` | About and updates |

### 15.3 Layouts

| Layout | File | Description |
|:-------|:-----|:------------|
| ChatLayout | `layouts/ChatLayout.tsx` | Main chat interface |
| Sidebar | `layouts/Sidebar.tsx` | Navigation sidebar |
| SessionSidebar | `layouts/SessionSidebar.tsx` | Session list |

### 15.4 Components

| Component | Description |
|:----------|:------------|
| `ThoughtTrace` | Reasoning trace display |
| `MermaidBlock` | Mermaid diagram renderer |
| `ArtifactPanel` | Code artifact viewer |
| `SkillCard` | Skill info card |
| `Composer` | Message input |
| `MessageList` | Chat messages display |

### 15.5 State Stores

| Store | File | Purpose |
|:-------|:-----|:--------|
| `useChatStore` | `store/useChatStore.ts` | Chat state and sessions |
| `useSettingsStore` | `store/useSettingsStore.ts` | App settings |
| `useLayoutStore` | `store/useLayoutStore.ts` | UI layout state |
| `useModalStore` | `store/useModalStore.ts` | Modal visibility |
| `useStaffStore` | `store/useStaffStore.ts` | Digital staff state |

## 16. Directory Structure

```
src/
├── common/                    # Shared Types & IPC
│   ├── ipc/
│   │   └── channels.ts        # IPC channel constants
│   ├── types/
│   │   ├── agent.ts           # Core Agent types
│   │   ├── chat.ts            # ChatMessage, ToolCall, AgentStep, ChatSession (SSoT)
│   │   ├── agentEvents.ts     # IPC request/response types
│   │   ├── settings.ts        # AppSettings
│   │   ├── skill.ts           # Skill types
│   │   ├── tool.ts            # ITool, ToolDefinition
│   │   ├── staff.ts           # Digital staff types
│   │   ├── usage.ts           # Usage tracking types
│   │   └── update.ts          # Update types
│   └── i18n/                   # Internationalization
├── main/                      # Backend Logic
│   ├── main.ts                # Entry point
│   ├── preload.ts             # Electron preload bridge
│   ├── router.ts              # AppRouter (DI Container)
│   ├── controllers/           # IPC Controllers
│   │   ├── AgentController.ts
│   │   ├── SchedulerController.ts
│   │   ├── SessionController.ts
│   │   ├── SystemController.ts
│   │   ├── ToolController.ts
│   │   ├── StaffController.ts
│   │   └── UpdateController.ts
│   └── services/
│       ├── agent/             # Agent Kernel
│       │   ├── AgentRuntime.ts
│       │   ├── IAgent.ts
│       │   ├── PromptBuilder.ts
│       │   ├── ToolGuard.ts
│       │   ├── ContextManager.ts
│       │   ├── TokenCounter.ts
│       │   ├── Summarizer.ts
│       │   ├── RetryPolicy.ts
│       │   ├── ErrorClassifier.ts
│       │   └── state/
│       │       └── AgentState.ts
│       ├── llm/               # Cognitive Layer
│       │   ├── IChatModel.ts   # Interface + re-exports from common
│       │   ├── ChatModelFactory.ts
│       │   └── providers/
│       │       ├── OpenAIAdapter.ts
│       │       └── AnthropicAdapter.ts
│       ├── tools/             # Capability Layer
│       │   ├── ToolRegistry.ts
│       │   ├── core/          # Built-in tools
│       │   │   ├── CoreToolManager.ts
│       │   │   ├── BashTool.ts
│       │   │   ├── ListDirTool.ts
│       │   │   ├── ReadFileTool.ts
│       │   │   ├── WriteFileTool.ts
│       │   │   ├── FileEditTool.ts
│       │   │   ├── GlobTool.ts
│       │   │   ├── GrepTool.ts
│       │   │   ├── SkillLoaderTool.ts
│       │   │   ├── WebFetchTool.ts
│       │   │   ├── EnvironmentInfoTool.ts
│       │   │   ├── TodoTool.ts
│       │   │   ├── MemorizeTool.ts
│       │   │   └── CronTool.ts
│       │   └── mcp/           # MCP Integration
│       │       ├── McpManager.ts
│       │       └── McpToolAdapter.ts
│       ├── skills/            # Capability Layer - Soft
│       │   └── core/
│       │       ├── SkillParser.ts
│       │       └── SkillRegistry.ts
│       ├── session/           # Infrastructure Layer
│       │   ├── SessionManager.ts
│       │   └── SessionStorage.ts
│       ├── scheduler/         # Trigger Layer
│       │   ├── SchedulerService.ts
│       │   ├── SchedulerStorage.ts
│       │   └── SchedulerLog.ts
│       ├── im/                # Trigger Layer
│       │   ├── IMServiceManager.ts
│       │   ├── IIMAdapter.ts
│       │   └── adapters/
│       │       ├── TelegramAdapter.ts
│       │       ├── WeComAdapter.ts
│       │       ├── LarkAdapter.ts
│       │       └── WechatAdapter.ts
│       ├── staff/             # Application Layer
│       │   ├── StaffManager.ts
│       │   ├── Staff.ts
│       │   └── StaffRegistry.ts
│       ├── memory/            # Infrastructure Layer
│       │   └── MemoryStore.ts
│       ├── usage/             # Infrastructure Layer
│       │   └── UsageManager.ts
│       ├── update/            # Application Layer
│       │   └── UpdateService.ts
│       ├── ConfigManager.ts   # Infrastructure Layer
│       ├── PathManager.ts     # Infrastructure Layer
│       └── SystemTrayManager.ts # Infrastructure Layer
└── renderer/                  # Frontend UI
    ├── main.tsx               # Renderer entry point
    ├── App.tsx                # Root component
    ├── pages/                 # Full Page Components
    │   ├── Settings.tsx
    │   ├── SchedulerPage.tsx
    │   ├── StaffPage.tsx
    │   └── settings/
    │       ├── GeneralSettings.tsx
    │       ├── ModelSettings.tsx
    │       ├── SkillSettings.tsx
    │       ├── MCPSettings.tsx
    │       ├── IMSettings.tsx
    │       └── AboutSettings.tsx
    ├── layouts/
    │   ├── ChatLayout.tsx
    │   ├── Sidebar.tsx
    │   └── SessionSidebar.tsx
    ├── components/
    │   ├── modals/
    │   ├── ThoughtTrace.tsx
    │   ├── MermaidBlock.tsx
    │   ├── ArtifactPanel.tsx
    │   ├── SkillCard.tsx
    │   ├── Composer.tsx
    │   └── MessageList.tsx
    ├── store/                 # Zustand State
    │   ├── useChatStore.ts
    │   ├── useSettingsStore.ts
    │   ├── useLayoutStore.ts
    │   ├── useModalStore.ts
    │   └── useStaffStore.ts
    ├── hooks/
    │   ├── useShortcuts.ts
    │   └── useBreakpoint.ts
    └── utils/
        ├── theme.ts
        ├── markdown.ts
        └── artifact.ts

skills/                        # Built-in Skills
├── find-skills/
├── skill-creator/
└── web-search/

build/                         # Build resources
release/                       # Release output
tests/                         # Test files
```

## 17. Development Guidelines

### 17.1 Adding a New Tool

1. Create a class implementing `ITool` in `src/main/services/tools/core/`
2. Define `getDefinition()` with `input_schema` using JSON Schema
3. Implement `execute(input)` method
4. Register in `CoreToolManager.ts` `toolFactories` map

### 17.2 Adding a New LLM Provider

1. Create adapter implementing `IChatModel` in `src/main/services/llm/providers/`
2. Implement `stream()` method converting provider events to `ChatStreamEvent`
3. Add provider to `ChatModelFactory.createChatModel()`
4. Update `normalizeProviderId()` for provider aliases

### 17.3 Adding a New Skill

1. Create directory under `skills/`
2. Create `SKILL.md` with frontmatter (id, name, description, version)
3. Write detailed instructions in markdown body
4. Skills are auto-loaded on startup

### 17.4 Adding a New IM Adapter

1. Create adapter implementing `IIMAdapter` in `src/main/services/im/adapters/`
2. Implement message sending, receiving, and connection management
3. Register adapter in `IMServiceManager.ts`

### 17.5 Writing Unit Tests

1. Create tests in the `/tests/` directory at the project root, mirroring the `src/` directory structure.
2. Use `vitest` as the testing framework.
3. Use absolute path aliases (`@/`) to import source modules (e.g., `import { TokenCounter } from '@/main/services/agent/TokenCounter';`).
4. Run tests using `npm run test` or `npm run test:watch`.

### 17.6 Modifying Agent Logic

- Core loop: `src/main/services/agent/AgentRuntime.ts`
- State transitions: `src/main/services/agent/state/AgentState.ts`
- Security: `src/main/services/agent/ToolGuard.ts`
- Ensure `onStream` and `onStepUpdate` callbacks are called for UI sync

### 17.7 Type Changes

- **All shared types**: Define in `src/common/types/` (Single Source of Truth)
- **LLM layer**: Re-exports from common via `IChatModel.ts`
- **Never define duplicate types** across layers
- IPC protocols: Update `src/common/ipc/channels.ts` AND `src/main/preload.ts`

## 18. Key Files Quick Reference

| Purpose | File Path |
|:--------|:----------|
| Entry Point | `src/main/main.ts` |
| DI Container | `src/main/router.ts` |
| Agent Core | `src/main/services/agent/AgentRuntime.ts` |
| LLM Interface | `src/main/services/llm/IChatModel.ts` |
| Tool Registry | `src/main/services/tools/ToolRegistry.ts` |
| Tool Manager | `src/main/services/tools/core/CoreToolManager.ts` |
| Skill Registry | `src/main/services/skills/core/SkillRegistry.ts` |
| Session Manager | `src/main/services/session/SessionManager.ts` |
| Staff Manager | `src/main/services/staff/StaffManager.ts` |
| Scheduler Service | `src/main/services/scheduler/SchedulerService.ts` |
| IM Service | `src/main/services/im/IMServiceManager.ts` |
| Shared Types | `src/common/types/chat.ts` |
| IPC Channels | `src/common/ipc/channels.ts` |
| Preload Bridge | `src/main/preload.ts` |
| Chat Store | `src/renderer/store/useChatStore.ts` |
| Settings Store | `src/renderer/store/useSettingsStore.ts` |
