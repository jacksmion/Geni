# Architecture V2: Tool-First & MCP Ready

## Overview
The V2 architecture shifts from a monolithic "script-based" approach to a modular "service-based" architecture. The core design philosophy is **Tool-First**: the Agent is primarily a router and executor of tools.

## Layered Design

### 1. Frontend (Renderer)
- **State Management**: `zustand` store (`useChatStore`) separates data from UI.
- **Components**: 
  - `ChatLayout`: Orchestrates the main view.
  - `Composer`: Handles input and stream processing.
  - `Sidebar`: Manages navigation.
  - `SkillHub`: Redesigned to show "Enabled Tools" status.

### 2. Backend (Main Process)
- **Controllers**: `AgentController` handles IPC requests, validating input before passing to services.
- **Service Layer**:
  - `ToolRegistry`: Single source of truth for all capabilities.
  - `AgentService`: Abstract strategy for differnet LLM providers (Claude/OpenAI).
  - `MCPLoader`: (Future) Connects to local/remote MCP servers.

## Core Interfaces

### ITool (The Universal Atom)
Every capability, whether it's a simple Python script, a system command, or a complex MCP resource, is wrapped as an `ITool`.

```typescript
interface ITool {
  name: string;
  input_schema: JSONSchema;
  execute(args: any): Promise<Result>;
}
```

### The New Agent Loop (Phase 2 Goal)
Instead of Regex parsing, we use native Tool Use / Function Calling:

1. **User Input** -> `AgentService`
2. `AgentService` gets tools from `ToolRegistry`
3. **LLM Call** (with `tools` definition)
4. **LLM Output**: `tool_use` (e.g., name="read_file", args={path:"..."})
5. `ToolRegistry` executes "read_file" -> returns content
6. **LLM Loop** -> Final Answer

## Roadmap

- [x] **Phase 1**: Component decoupling & State Management
- [x] **Phase 1**: Interface Definitions (`ITool`, `IAgentService`)
- [ ] **Phase 2**: Implement `AgentService` with standard Function Calling
- [ ] **Phase 3**: Built-in Tools (`FileSystem`, `CommandExec` with Docker/Wasm)
- [ ] **Phase 4**: MCP Client Implementation

## Security Note
By channeling all execution through `ToolRegistry`, we can implement a central **Permission Gate**.
e.g., "Tool 'bash' is requesting to run 'rm -rf'. Allow? [Y/N]"
