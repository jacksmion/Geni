# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Geni is an Electron desktop app — an AI-powered collaborative workspace assistant. It uses a **Three-Layer Agent Architecture** (Agent config → AgentRuntime lifecycle → ReActExecutor reasoning) with a ReAct loop (Think → Act → Observe → Reflect) at its core.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (Electron main + React renderer with HMR) |
| `npm run build` | TypeScript check + Vite production build (`tsc && vite build`) |
| `npm run test` | Run all Vitest tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run dist:win` | Build Windows installer |

Run a single test file: `npx vitest run tests/path/to/test.test.ts`

## Architecture

### Process Split

- **Main process** (`src/main/`): Electron/Node.js — agent execution, tool running, file system, LLM calls
- **Renderer process** (`src/renderer/`): React 19 browser — UI, state management, user interaction
- **Shared** (`src/common/`): TypeScript types, IPC channel constants, i18n locales

### IPC Communication

Namespace-based channel architecture via `contextBridge`:
- **Request/Response**: `ipcRenderer.invoke()` → `ipcMain.handle()` (e.g., `agent:start`, `session:list`)
- **Server Push**: `webContents.send()` → `ipcRenderer.on()` (e.g., `agent:stream`, `agent:step`)
- Channels defined in `src/common/ipc/channels.ts`, typed bridge in `src/main/preload.ts`

### Agent System (`src/main/services/agent/`)

Three layers with clear separation:
- **Agent** (`common/types/agent.ts`): Pure config — `id`, `name`, `modelId`, `systemPrompt`, `skillIds`, `allowedTools`
- **AgentRuntime** (`runtime/AgentRuntime.ts`): Lifecycle — loads skills, filters tools, assembles system prompt, manages history
- **ReActExecutor** (`executor/ReActExecutor.ts`): Reasoning — AsyncGenerator pattern (yield events, next() for auth), token budget management, context compression

State machine: `Idle → Thinking → ExecutingHelper → ExecutingTool → AwaitingInput → Error/Aborted`

### Tool System (`src/main/services/tools/`)

- `ITool` interface: `getDefinition()` + `execute(args, signal, onStream)` → `ToolExecutionResult`
- `ToolRegistry`: Central registry for built-in + MCP tools
- 14 built-in tools in `core/` (bash, read, write, edit, glob, grep, list, web_fetch, memorize, cron, load_skill, todowrite, todoread, environment_info)
- MCP tools via `McpManager` + `McpToolAdapter` (Stdio and SSE transports)
- `ToolGuard`: Risk assessment (Safe/Low/Medium/High/Dangerous) with trust levels and "remember decision"

### Skill System (`src/main/services/skills/`)

Skills are markdown-based knowledge capsules (SKILL.md files), not executable code. Loaded lazily — system prompt only contains catalog, full content loaded via `load_skill` tool. Sources in priority: builtin → global (~/.geni/skills/) → dotAgents → project (.geni/skills/).

### LLM Abstraction (`src/main/services/llm/`)

`IChatModel` interface with `stream()` returning `AsyncGenerator<ChatStreamEvent>`. Two adapters: `OpenAIAdapter` (used by 9+ providers via OpenAI-compatible APIs) and `AnthropicAdapter`. Factory via `ChatModelFactory`.

### Frontend (`src/renderer/`)

No router library — tab-based navigation controlled by `activeTab` in Zustand store. 5 stores: `useChatStore` (sessions, messages, artifacts), `useSettingsStore`, `useLayoutStore`, `useModalStore`, `useStaffStore`. Stores call `window.electronAPI.*` IPC methods directly.

### DI Container

`AppRouter` in `src/main/router.ts` is the composition root — all services and controllers are instantiated and wired there.

## Key Conventions

- **ESM throughout** (`"type": "module"`)
- **TypeScript strict mode**, no `any` (warn), unused vars prefixed with `_`
- **`@` path alias** maps to `src/*` (configured in tsconfig, vite, vitest)
- **Shared types are the single source of truth**: All types in `src/common/types/`. Never duplicate across layers.
- **IPC changes**: Must update both `src/common/ipc/channels.ts` AND `src/main/preload.ts`
- **Tests**: Mirror `src/` structure under `tests/`. Use `@/` imports. Vitest node environment.
- **i18n**: Two locales (Chinese default, English) at `src/common/i18n/locales/`
- **Data storage**: All persisted under `~/.geni/` via `PathManager`

## Adding New Capabilities

- **New tool**: Implement `ITool` in `src/main/services/tools/core/`, register in `CoreToolManager.ts` `toolFactories`
- **New LLM provider**: Implement `IChatModel` in `src/main/services/llm/providers/`, add to `ChatModelFactory`
- **New skill**: Create directory with `SKILL.md` (frontmatter: id, name, description, version) under `skills/` or `~/.geni/skills/`
- **New IM adapter**: Implement `IIMAdapter` in `src/main/services/im/adapters/`, register in `IMServiceManager`
