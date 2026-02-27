# Geni Project - AI Agent Documentation

> **Last Updated**: 2026-02-27  
> **Architecture Version**: V3.1 - Layered Architecture

## 1. Project Overview

**Geni** is an Electron-based AI coding assistant designed to act as a "Virtual Pair Programmer". It adopts a **Layered Architecture** with clear separation of concerns:

- **Agent Kernel**: Core runtime with explicit state machine
- **Cognitive Layer**: LLM provider abstraction (OpenAI/Claude/DeepSeek)
- **Capability Layer**: Tools (Functions) + Skills (Knowledge)
- **Infrastructure Layer**: Session management and persistence

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Application Layer (Controllers)                │
│    AgentController │ SessionController │ SystemController        │
│                     ToolController │ AppRouter (DI)              │
├─────────────────────────────────────────────────────────────────┤
│                        Agent Kernel                              │
│   AgentRuntime │ PromptBuilder │ StateManager │ ToolGuard        │
│   ContextManager │ TokenCounter │ Summarizer                     │
├─────────────────────────────────────────────────────────────────┤
│                    Cognitive Layer (IChatModel)                  │
│         OpenAIAdapter │ AnthropicAdapter │ ChatModelFactory      │
├─────────────────────────────────────────────────────────────────┤
│                 Capability Layer (Tools + Skills)                │
│   ToolRegistry │ CoreToolManager │ MCP Manager │ SkillRegistry  │
├─────────────────────────────────────────────────────────────────┤
│                Infrastructure (Session + Storage)                │
│              SessionManager │ SessionStorage                     │
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

#### Frontend (Renderer)
- **Tech**: React 19, Tailwind v4, Zustand
- **Role**: UI presentation, state management (`useChatStore`), input handling
- **Key Components**: `Composer` (input), `ChatLayout` (view), Settings pages

#### Backend (Main Process)
- **Tech**: Electron Node.js runtime
- **Role**: Orchestrates the AI Agent, executes tools, handles file system operations
- **Entry Point**: `src/main/main.ts` -> `AppRouter` (DI Container)

#### Shared (Common)
- Types and interfaces shared between processes (`src/common`)
- IPC channel definitions (`src/common/ipc/channels.ts`)

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
| Local (Ollama) | `OpenAIAdapter` | OpenAI-compatible API |

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
| `todowrite` | `TodoWriteTool` | Creates/updates the entire todo list |
| `todoread` | `TodoReadTool` | Reads the current todo list |

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

### 6.3 SKILL.md Format

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

## 8. Shared Type System (`src/common/types/`)

All shared types are defined in `src/common/types/` as the **Single Source of Truth**:

| Type | File | Used By |
|:-----|:-----|:--------|
| `ChatMessage` | `chat.ts` | LLM layer, Agent, Session, UI |
| `ToolCall` | `chat.ts` | LLM layer, Agent, UI |
| `AgentStep` | `chat.ts` | Agent, UI |
| `ChatSession` | `chat.ts` | Session, UI |
| `ITool` | `tool.ts` | Tools, Agent |
| `Skill` | `skill.ts` | Skills, Agent |
| `AppSettings` | `settings.ts` | All layers |

> **Important**: The LLM layer (`IChatModel.ts`) re-exports `ChatMessage`, `ToolCall`, and `ChatMessageRole` from `common/types/chat.ts`. Do NOT define duplicate types.

## 9. IPC & Controllers

### 9.1 Controller Layer (`src/main/controllers/`)

| Controller | File | Purpose |
|:-----------|:-----|:--------|
| `AgentController` | `AgentController.ts` | Agent start/stop, event bridging |
| `SessionController` | `SessionController.ts` | Session CRUD, history |
| `SystemController` | `SystemController.ts` | Settings, file dialogs, LLM test |
| `ToolController` | `ToolController.ts` | Skill toggle, MCP management |

### 9.2 IPC Channels (`src/common/ipc/channels.ts`)

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
```

### 9.3 AppRouter (`src/main/router.ts`)

Acts as the **Dependency Injection Container**:
- Instantiates all services and controllers
- Wires dependencies together
- Initializes all IPC handlers

## 10. Directory Structure

```
src/
├── common/                    # Shared Types & IPC
│   ├── ipc/
│   │   └── channels.ts        # IPC channel constants
│   └── types/
│       ├── chat.ts            # ChatMessage, ToolCall, AgentStep, ChatSession (SSoT)
│       ├── agentEvents.ts     # IPC request/response types
│       ├── settings.ts        # AppSettings
│       ├── skill.ts           # Skill types
│       └── tool.ts            # ITool, ToolDefinition
├── main/                      # Backend Logic
│   ├── main.ts                # Entry point
│   ├── preload.ts             # Electron preload bridge
│   ├── router.ts              # AppRouter (DI Container)
│   ├── controllers/           # IPC Controllers
│   │   ├── AgentController.ts
│   │   ├── SessionController.ts
│   │   ├── SystemController.ts
│   │   └── ToolController.ts
│   └── services/
│       ├── agent/             # Agent Kernel
│       │   ├── AgentRuntime.ts
│       │   ├── IAgent.ts
│       │   ├── PromptBuilder.ts
│       │   ├── ToolGuard.ts
│       │   ├── ContextManager.ts
│       │   ├── TokenCounter.ts
│       │   ├── Summarizer.ts
│       │   └── state/
│       │       └── AgentState.ts
│       ├── llm/               # Cognitive Layer
│       │   ├── IChatModel.ts   # Interface + re-exports from common
│       │   ├── ChatModelFactory.ts
│       │   └── providers/
│       │       ├── OpenAIAdapter.ts
│       │       └── AnthropicAdapter.ts
│       ├── tools/             # Capability Layer - Hard
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
│       │   │   └── TodoTool.ts
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
│       ├── ConfigManager.ts
│       └── PathManager.ts
└── renderer/                  # Frontend UI
    ├── store/                 # Zustand State
    │   └── useChatStore.ts
    └── components/            # React Components
```

## 11. Development Guidelines

### 11.1 Adding a New Tool

1. Create a class implementing `ITool` in `src/main/services/tools/core/`
2. Define `getDefinition()` with `input_schema` using JSON Schema
3. Implement `execute(input)` method
4. Register in `CoreToolManager.ts` `toolFactories` map

### 11.2 Adding a New LLM Provider

1. Create adapter implementing `IChatModel` in `src/main/services/llm/providers/`
2. Implement `stream()` method converting provider events to `ChatStreamEvent`
3. Add provider to `ChatModelFactory.createChatModel()`
4. Update `normalizeProviderId()` for provider aliases

### 11.3 Adding a New Skill

1. Create directory under `skills/`
2. Create `SKILL.md` with frontmatter (id, name, description, version)
3. Write detailed instructions in markdown body
4. Skills are auto-loaded on startup

### 11.4 Modifying Agent Logic

- Core loop: `src/main/services/agent/AgentRuntime.ts`
- State transitions: `src/main/services/agent/state/AgentState.ts`
- Security: `src/main/services/agent/ToolGuard.ts`
- Ensure `onStream` and `onStepUpdate` callbacks are called for UI sync

### 11.5 Type Changes

- **All shared types**: Define in `src/common/types/` (Single Source of Truth)
- **LLM layer**: Re-exports from common via `IChatModel.ts`
- **Never define duplicate types** across layers
- IPC protocols: Update `src/common/ipc/channels.ts` AND `src/main/preload.ts`

## 12. Key Files Quick Reference

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
| Shared Types | `src/common/types/chat.ts` |
| IPC Channels | `src/common/ipc/channels.ts` |
| Preload Bridge | `src/main/preload.ts` |
