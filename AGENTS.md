# Cowork Project - AI Agent Documentation

## 1. Project Overview
**Cowork** is an Electron-based AI coding assistant designed to act as a "Virtual Coworker". It differs from standard chat interfaces by adopting a **Tool-First Architecture**, where the AI is primarily a router and executor of capable tools (file editing, command execution, etc.) rather than just a text generator.

## 2. Architecture (V2: Tool-First)
The project follows a modular "Service-Based" architecture, separating the UI (Renderer) from the Logic (Main Process).

### 2.1 Core Concepts
- **Tool-First Philosophy**: The Agent's core loop is `Think -> Act (Call Tool) -> Observe (Result) -> Reflect`.
- **ITool Interface**: The universal atom of capability. Everything (Python script, Bash command, MCP server function) is wrapped as an `ITool`.
- **Service Layer**: Logic resides in `src/main/services`, decoupled from Electron IPC handlers.

### 2.2 System Layers
1.  **Frontend (Renderer)**:
    -   **Tech**: React 19, Tailwind v4, Zustand.
    -   **Role**: UI presentation, state management (`useChatStore`), input handling.
    -   **Key Components**: `Composer` (input), `ChatLayout` (view).
2.  **Backend (Main Process)**:
    -   **Tech**: Electron Node.js runtime.
    -   **Role**: Orchestrates the AI Agent, executes tools, handles file system operations.
    -   **Key Services**:
        -   `AgentService`: Manages the LLM loop (OpenAI/Claude).
        -   `ToolRegistry`: Single source of truth for all available tools.
        -   `SkillLoader`: Loads external/custom skills.
3.  **Shared (Common)**:
    -   Types and interfaces shared between processes (`src/common`).

## 3. The Agent System

### 3.1 Agent Service (`OpenAIAgentService.ts`)
The agent implements a **ReAct-like loop** (Reasoning + Acting):
1.  **Context Construction**:
    -   System Prompt: Injected with "Methodology" (Think/Act/Observe) and [Current Working Directory].
    -   Skills: Active skills are injected into the context as summaries.
    -   History: Sliding window of recent messages.
2.  **Execution Loop**:
    -   **Call LLM**: Sends prompt + Tool Definitions (Function Calling).
    -   **Stream Handling**: buffered tool calls are parsed.
    -   **Tool Execution**: Validated commands are executed via `ToolRegistry`.
    -   **Observation**: Result is returned to LLM (truncated if too large).
    -   **Self-Correction**: If a tool fails, a "Reflect" hint is added to the next prompt.

### 3.2 Tool Registry
Located in `src/main/services/tools/ToolRegistry.ts`. It maps tool names to their implementations.

## 4. Tools & Capabilities
Tools are located in `src/main/services/tools/builtin`. Current built-in tools include:

| Tool Name | Class | Description |
| :--- | :--- | :--- |
| `bash` | `BashTool` | Executes shell commands (PowerShell/Bash). |
| `read_file` | `FileSystemTool` | Reads file content. |
| `write_file` | `FileEditTool` | Writes/Overwrites file content. |
| `replace_content` | `FileEditTool` | Smart search & replace in files. |
| `file_search` | `FileSearchTool` | Finds files via regex/glob. |
| `python_exec` | `PythonExecTool` | Runs Python scripts in a sandboxed manner. |
| `read_skill` | `SkillReaderTool` | Loads full instructions for a specific skill. |

## 5. Directory Structure Map
For an AI working on this codebase, these are the critical paths:

```
d:/VibeCode/cowork/
├── src/
│   ├── common/             # Shared Types
│   │   ├── types/
│   │   │   ├── agent.ts    # Message, AgentContext interfaces
│   │   │   ├── tool.ts     # ITool, ToolDefinition interfaces
│   │   │   └── settings.ts # Configuration interfaces
│   ├── main/               # Backend Logic
│   │   ├── services/
│   │   │   ├── agent/      # LLM Integration (OpenAIAgentService)
│   │   │   ├── tools/      # Tool Implementations
│   │   │   │   └── builtin/# Core tools (Bash, FileSystem, etc.)
│   │   │   ├── ToolRegistry.ts
│   │   │   └── SkillLoader.ts
│   ├── renderer/           # Frontend UI
│   │   ├── store/          # Zustand State (useChatStore)
│   │   └── components/     # React Components
├── docs/                   # Documentation & Arch Specs
│   └── architecture_v2.md  # Detailed V2 Spec
├── package.json            # Dependencies
```

## 6. Development Guidelines
-   **Adding a Tool**:
    1.  Create a class implementing `ITool` in `src/main/services/tools/builtin`.
    2.  Define `input_schema` using JSON Schema.
    3.  Register it in `ToolRegistry` (or ensure dynamic loading).
-   **Modifying Agent Logic**:
    -   Check `OpenAIAgentService.ts` for the main loop.
    -   Ensure `onStepUpdate` is called to keep the UI in sync.
-   **State Changes**:
    -   If changing message formats, update `src/common/types/agent.ts` AND `src/renderer/store/useChatStore.ts`.
