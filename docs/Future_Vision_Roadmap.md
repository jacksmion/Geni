# Cowork Project - Future Vision & Roadmap

> **Last Updated**: 2026-02-07
> **Status**: Planning Phase
> **Objective**: Evolve Cowork from a single Electron desktop app into a multi-interface AI coding platform.

## 1. Overview

The goal is to decouple the core Agent logic from the Electron runtime, enabling two new modes of interaction:
1.  **Headless Agent Server**: A persistent background service driveable via IM (Instant Messaging) or API.
2.  **TUI (Terminal User Interface)**: A keyboard-centric, high-efficiency CLI tool similar to `claude-code`.

## 2. Core Architecture Refactoring (Prerequisite)

Before implementing new interfaces, the core business logic must be completely decoupled from Electron-specific APIs.

### 2.1 Decoupling Strategy
-   **SessionStorage**:
    -   *Current*: Relies on `electron.app.getPath('userData')`.
    -   *Target*: Inject storage paths via configuration or environment variables.
    -   *Action*: Refactor `SessionStorage` to accept a `basePath` in its constructor.
-   **Path Management**:
    -   *Current*: Hardcoded/Electron-dependent.
    -   *Target*: Use a `PathManager` service that adapts to the runtime environment (Electron vs Node CLI vs Server).
-   **Controllers**:
    -   *Current*: Strongly tied to `ipcMain` and `WebContents`.
    -   *Target*: Extract business logic into "Service Layer" methods that return plain objects. Controllers (IPC, HTTP, CLI) will just be thin wrappers around these services.

## 3. Initiative A: Headless Agent Server

**Concept**: A standalone Node.js process acting as the "Brain", reachable via standard network protocols.

### 3.1 Key Features
-   **Persistent Runtime**: The agent runs as a daemon/background service.
-   **IM Integration**:
    -   Connectors for external platforms (WeChat, Slack, DingTalk).
    -   Support for "Human-in-the-Loop" via message buttons (Approve/Reject).
-   **API Layer**:
    -   REST/WebSocket API for sending prompts and receiving streaming responses.
    -   Webhooks for agent notifications.

### 3.2 Use Cases
-   **Mobile Coding**: Send a voice message to the agent via WeChat to fix a bug or deploy code while away from the keyboard.
-   **CI/CD Integration**: Trigger the agent from a GitHub Action to review a PR automatically.

## 4. Initiative B: TUI Application (CLI)

**Concept**: A developer-focused terminal interface for high-speed interaction, built with `React` + `Ink`.

### 4.1 Key Features
-   **Keyboard-First**: specialized shortcuts for quick navigation.
-   **Rich Display**:
    -   Syntax highlighting for code blocks.
    -   Diff views for file changes.
    -   Spinners and progress bars for long-running tasks.
-   **Deep System Integration**:
    -   Direct access to current shell environment variables.
    -   Seamless piping of shell commands to/from the agent.

### 4.2 Tech Stack
-   **Framework**: [Ink](https://github.com/vadimdemedes/ink) (React for CLI).
-   **State Management**: Reuse existing Zustand logic (if adaptable) or vanilla React hooks.
-   **Output**: ASCII art, colored text, interactive inputs.

## 5. Implementation Roadmap

### Phase 1: Foundation (Estimated: 1-2 Weeks)
-   [ ] Refactor `SessionStorage` to be environment-agnostic.
-   [ ] Abstract `PathManager` for cross-platform path resolution.
-   [ ] Extract `AgentRuntime` logic to ensure zero Electron dependencies.

### Phase 2: Experimental CLI (Estimated: 2 Weeks)
-   [ ] Create `src/cli/index.tsx` entry point.
-   [ ] Implement basic `Ink` UI loop (Input -> Agent -> Output).
-   [ ] Verify file system tools work in CLI mode.

### Phase 3: Server & API (Estimated: 2-3 Weeks)
-   [ ] Create `src/server/index.ts` entry point (Express/Fastify).
-   [ ] Wrap `AgentRuntime` in a WebSocket server.
-   [ ] Build a minimal "IM Connector" interface.
