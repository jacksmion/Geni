# Geni

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
| AI Integration | MCP SDK, Claude Agent SDK, OpenAI SDK |
| Testing | Vitest |

## Architecture

Geni adopts a **Three-Layer Agent Architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│ Agent (配置层) - id, name, modelId, systemPrompt, skills  │
├─────────────────────────────────────────────────────────────┤
│ Runtime (运行时) - Lifecycle, Context Assembly, Events      │
├─────────────────────────────────────────────────────────────┤
│ Executor (执行器) - ReAct Loop, LLM Calls, Tool Execution  │
└─────────────────────────────────────────────────────────────┘
```

### System Layers

- **Trigger Layer**: Scheduler, IM adapters (Telegram, WeCom, Lark, WeChat)
- **Application Layer**: Controllers handling IPC requests
- **Agent Kernel**: Runtime + Executor + PromptBuilder + ToolGuard
- **Cognitive Layer**: Unified LLM interface (IChatModel)
- **Capability Layer**: Tools (ITool) + Skills (Knowledge Capsules)
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

2. (Optional) Set Electron mirror for faster download (Recommended for users in China):
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
|---------|------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run test` | Run unit tests |
| `npm run lint` | Run ESLint |
| `npm run dist:win` | Build Windows installer |
| `npm run dist:mac` | Build macOS app |
| `npm run dist:linux` | Build Linux package |

## Project Structure

```
geni/
├── src/
│   ├── common/                 # Shared types and IPC definitions
│   │   ├── types/             # TypeScript type definitions
│   │   │   ├── agent.ts       # Agent interface
│   │   │   ├── chat.ts        # ChatMessage, ToolCall, AgentStep
│   │   │   ├── settings.ts    # AppSettings, ProviderConfig
│   │   │   ├── skill.ts       # Skill types
│   │   │   ├── tool.ts        # ITool interface
│   │   │   └── ...
│   │   ├── ipc/               # IPC channel constants
│   │   └── i18n/              # Internationalization (en, zh)
│   ├── main/                   # Electron main process
│   │   ├── main.ts            # Entry point
│   │   ├── preload.ts         # Context isolation bridge
│   │   ├── router.ts          # DI container
│   │   ├── controllers/       # IPC request handlers
│   │   └── services/
│   │       ├── agent/          # Agent Kernel (Three-Layer)
│   │       │   ├── runtime/    # AgentRuntime
│   │       │   ├── executor/   # ReActExecutor
│   │       │   ├── state/      # AgentState
│   │       │   └── ...
│   │       ├── llm/            # LLM adapters
│   │       │   └── providers/  # OpenAI, Anthropic
│   │       ├── tools/          # Tool system
│   │       │   ├── core/       # Built-in tools
│   │       │   └── mcp/       # MCP integration
│   │       ├── skills/        # Skill registry
│   │       ├── session/       # Chat session management
│   │       ├── scheduler/     # Cron task scheduler
│   │       ├── im/            # IM adapters
│   │       ├── staff/         # Digital staff
│   │       ├── memory/        # Memory storage
│   │       ├── usage/         # API usage tracking
│   │       └── update/        # Auto-update
│   └── renderer/               # React frontend
│       ├── App.tsx            # Root component
│       ├── components/        # UI components
│       ├── layouts/           # Page layouts
│       ├── pages/             # Full page components
│       │   └── settings/      # Settings pages
│       ├── modules/           # Feature modules
│       │   └── chat/         # Chat components
│       └── store/             # Zustand stores
├── skills/                     # Built-in skills
│   ├── find-skills/
│   ├── skill-creator/
│   └── web-search/
├── build/                      # Icons and resources
├── release/                    # Packaged output
└── tests/                      # Unit tests (Vitest)
```

## License

[ISC](LICENSE)
