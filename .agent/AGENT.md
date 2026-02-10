# Cowork Project - AI Agent Documentation

> **Last Updated**: 2026-02-07  
> **Architecture Version**: V3.0 - Layered Architecture

## 1. Project Overview

**Cowork** is an Electron-based AI coding assistant designed to act as a "Virtual Pair Programmer". It adopts a **Layered Architecture** with clear separation of concerns:

- **Agent Kernel**: Core runtime with explicit state machine
- **Cognitive Layer**: LLM provider abstraction (OpenAI/Claude/DeepSeek)
- **Capability Layer**: Tools (Functions) + Skills (Knowledge)
- **Infrastructure Layer**: Session management and persistence

## 2. Architecture (V3: Layered Architecture)

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
│   ToolRegistry │ Core Tools │ MCP Manager │ SkillRegistry        │
├─────────────────────────────────────────────────────────────────┤
│                Infrastructure (Session + Storage)                │
│              SessionManager │ SessionStorage                     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Core Design Principles

- **Tool-First Philosophy**: The Agent's core loop is `Think -> Act (Call Tool) -> Observe (Result) -> Reflect`.
- **ITool Interface**: The universal atom of capability. Everything is wrapped as an `ITool`.
- **Skill as Data**: Skills are "knowledge capsules" (SOP, expert experience), not executable functions.
- **Lazy Loading**: System Prompt only contains skill catalog; full content loaded via `read_skill`.
- **Model Agnostic**: Single interface (`IChatModel`) for all LLM providers.

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
| `tool_call_delta` | Tool call argument increment |
| `message_start` | Message began |
| `message_end` | Message completed (with usage stats) |
| `error` | Error occurred |

## 5. Tools & Capabilities

### 5.1 Tool Registry (`src/main/services/tools/ToolRegistry.ts`)

Central registry for all available tools. Maps tool names to implementations.

### 5.2 Built-in Tools (`src/main/services/tools/core/`)

| Tool Name | Class | Description |
|:----------|:------|:------------|
| `bash` | `BashTool` | Executes shell commands (PowerShell/Bash) |
| `read_file` | `FileSystemTool` | Reads file content |
| `write_file` | `FileEditTool` | Writes/Overwrites file content |
| `replace_content` | `FileEditTool` | Smart search & replace in files |
| `file_search` | `FileSearchTool` | Finds files via regex/glob |
| `python_exec` | `PythonExecTool` | Runs Python scripts |
| `environment_info` | `EnvironmentInfoTool` | Returns system environment info |
| `read_skill` | `SkillReaderTool` | Loads full instructions for a specific skill |

### 5.3 MCP Integration (`src/main/services/tools/mcp/`)

Model Context Protocol support for external tool servers:

| Component | File | Purpose |
|:----------|:-----|:--------|
| `McpManager` | `mcp/McpManager.ts` | Connection pool, lifecycle management |
| `McpToolAdapter` | `mcp/McpToolAdapter.ts` | Converts MCP tools to `ITool` format |

Supports both **Stdio** and **SSE** transport methods.

## 6. Skill System

### 6.1 Skill Philosophy (Claude Skills Aligned)

Skills are **"pluggable knowledge capsules"**:
- **Nature**: NOT executable code, but SOP, expert experience, prompt templates
- **Purpose**: Let Agent "download" expert thinking patterns for specific tasks
- **Consumption**: Lazy Loading via `read_skill` tool

### 6.2 Skill Components (`src/main/services/skills/`)

| Component | File | Purpose |
|:----------|:-----|:--------|
| `SkillParser` | `core/SkillParser.ts` | Parses SKILL.md frontmatter (zod validation) |
| `SkillRegistry` | `core/SkillRegistry.ts` | Skill registration center |
| `SkillReader` | `runtime/SkillReader.ts` | `read_skill` tool implementation |

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

## 8. IPC & Controllers

### 8.1 Controller Layer (`src/main/controllers/`)

| Controller | File | Purpose |
|:-----------|:-----|:--------|
| `AgentController` | `AgentController.ts` | Agent start/stop, event bridging |
| `SessionController` | `SessionController.ts` | Session CRUD, history |
| `SystemController` | `SystemController.ts` | Settings, file dialogs, LLM test |
| `ToolController` | `ToolController.ts` | Skill toggle, MCP management |

### 8.2 IPC Channels (`src/common/ipc/channels.ts`)

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

### 8.3 AppRouter (`src/main/router.ts`)

Acts as the **Dependency Injection Container**:
- Instantiates all services and controllers
- Wires dependencies together
- Initializes all IPC handlers

## 9. Directory Structure

```
d:/VibeCode/cowork/
├── src/
│   ├── common/                    # Shared Types & IPC
│   │   ├── ipc/
│   │   │   └── channels.ts        # IPC channel constants
│   │   └── types/
│   │       ├── agent.ts           # Agent types
│   │       ├── agentEvents.ts     # IPC request/response types
│   │       ├── chat.ts            # ChatSession, ChatMessage
│   │       ├── settings.ts        # AppSettings
│   │       ├── skill.ts           # Skill types
│   │       └── tool.ts            # ITool, ToolDefinition
│   ├── main/                      # Backend Logic
│   │   ├── main.ts                # Entry point (slim, ~109 lines)
│   │   ├── preload.ts             # Electron preload bridge
│   │   ├── router.ts              # AppRouter (DI Container)
│   │   ├── controllers/           # IPC Controllers
│   │   │   ├── AgentController.ts
│   │   │   ├── SessionController.ts
│   │   │   ├── SystemController.ts
│   │   │   └── ToolController.ts
│   │   └── services/
│   │       ├── agent/             # Agent Kernel
│   │       │   ├── AgentRuntime.ts
│   │       │   ├── PromptBuilder.ts
│   │       │   ├── ToolGuard.ts
│   │       │   ├── ContextManager.ts
│   │       │   ├── TokenCounter.ts
│   │       │   ├── Summarizer.ts
│   │       │   └── state/
│   │       │       └── AgentState.ts
│   │       ├── llm/               # Cognitive Layer
│   │       │   ├── IChatModel.ts
│   │       │   ├── ChatModelFactory.ts
│   │       │   └── providers/
│   │       │       ├── OpenAIAdapter.ts
│   │       │       └── AnthropicAdapter.ts
│   │       ├── tools/             # Capability Layer - Hard
│   │       │   ├── ToolRegistry.ts
│   │       │   ├── core/          # Built-in tools
│   │       │   │   ├── BashTool.ts
│   │       │   │   ├── FileSystemTool.ts
│   │       │   │   ├── FileEditTool.ts
│   │       │   │   ├── FileSearchTool.ts
│   │       │   │   ├── PythonExecTool.ts
│   │       │   │   ├── EnvironmentInfoTool.ts
│   │       │   │   └── SkillReaderTool.ts
│   │       │   └── mcp/           # MCP Integration
│   │       │       ├── McpManager.ts
│   │       │       └── McpToolAdapter.ts
│   │       ├── skills/            # Capability Layer - Soft
│   │       │   ├── core/
│   │       │   │   ├── SkillParser.ts
│   │       │   │   └── SkillRegistry.ts
│   │       │   └── runtime/
│   │       │       └── SkillReader.ts
│   │       ├── session/           # Infrastructure Layer
│   │       │   ├── SessionManager.ts
│   │       │   └── SessionStorage.ts
│   │       └── ConfigManager.ts
│   └── renderer/                  # Frontend UI
│       ├── store/                 # Zustand State
│       │   └── useChatStore.ts
│       └── components/            # React Components
├── skills/                        # Skill definitions (SKILL.md files)
├── docs/                          # Documentation
│   ├── Architecture_and_Skills_Revamp.md  # Architecture blueprint
│   └── Refactoring_Tasks.md       # Refactoring task list
└── package.json
```

## 10. Development Guidelines

### 10.1 Adding a New Tool

1. Create a class implementing `ITool` in `src/main/services/tools/core/`
2. Define `getDefinition()` with `input_schema` using JSON Schema
3. Implement `execute(input)` method
4. Set `requireConfirmation` for dangerous operations
5. Register in `main.ts` via `toolRegistry.register(new YourTool())`

### 10.2 Adding a New LLM Provider

1. Create adapter implementing `IChatModel` in `src/main/services/llm/providers/`
2. Implement `stream()` method converting provider events to `ChatStreamEvent`
3. Add provider to `ChatModelFactory.createChatModel()`
4. Update `normalizeProviderId()` for provider aliases

### 10.3 Adding a New Skill

1. Create directory under `skills/`
2. Create `SKILL.md` with frontmatter (id, name, description, version)
3. Write detailed instructions in markdown body
4. Skills are auto-loaded on startup

### 10.4 Modifying Agent Logic

- Core loop: `src/main/services/agent/AgentRuntime.ts`
- State transitions: `src/main/services/agent/state/AgentState.ts`
- Security: `src/main/services/agent/ToolGuard.ts`
- Ensure `onStream` and `onStepUpdate` callbacks are called for UI sync

### 10.5 State Changes

- Message formats: Update `src/common/types/chat.ts` AND `src/renderer/store/useChatStore.ts`
- IPC protocols: Update `src/common/ipc/channels.ts` AND `src/main/preload.ts`

## 11. Key Files Quick Reference

| Purpose | File Path |
|:--------|:----------|
| Entry Point | `src/main/main.ts` |
| DI Container | `src/main/router.ts` |
| Agent Core | `src/main/services/agent/AgentRuntime.ts` |
| LLM Interface | `src/main/services/llm/IChatModel.ts` |
| Tool Registry | `src/main/services/tools/ToolRegistry.ts` |
| Skill Registry | `src/main/services/skills/core/SkillRegistry.ts` |
| Session Manager | `src/main/services/session/SessionManager.ts` |
| IPC Channels | `src/common/ipc/channels.ts` |
| Preload Bridge | `src/main/preload.ts` |
| Chat Types | `src/common/types/chat.ts` |
| Tool Types | `src/common/types/tool.ts` |
