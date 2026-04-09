# Geni

> **Your AI-Powered Collaborative Workspace Assistant**
> *Enabling inspiration through intelligence.*

Geni is a modern desktop application designed to bridge the gap between AI intelligence and your local workflow. Built with **Electron**, **React**, and the **Model Context Protocol (MCP)**, Geni offers a seamless environment for AI-assisted coding, writing, and problem-solving.

## ✨ Features

*   **🤖 Intelligent Chat Interface**: Interact with advanced AI models (Claude, GPT-4, DeepSeek, Qwen, etc.) in a deeply integrated chat environment.
*   **🔌 Model Context Protocol (MCP)**: Extensible architecture supporting MCP servers for file system access, terminal execution, and more.
*   **🛠️ Built-in Tools**:
    *   **FileSystem**: Read, write, edit, and search files directly from the chat.
    *   **Terminal**: Execute shell commands securely.
    *   **Web**: Fetch web pages and search the internet.
    *   **Memory**: Persistent memory storage across sessions.
    *   **Task**: Todo list management.
    *   **Cron**: Schedule automated tasks.
*   **🎭 Digital Staff**: Create and manage AI personas with customizable behaviors and specialties.
*   **⏰ Scheduler**: Cron-based automated task execution with IM notifications.
*   **💬 Multi-Platform IM Integration**: Connect with Telegram, WeCom, Lark, and WeChat.
*   **📚 Skill System**: Extensible knowledge capsules for specialized tasks (code review, git operations, etc.).
*   **🎨 Premium UI/UX**:
    *   Modern, responsive design with **Tailwind CSS v4**.
    *   Dark/Light mode support.
    *   Beautiful Markdown rendering with syntax highlighting, Mermaid diagrams, and code artifacts.
*   **⚡ High Performance**: Powered by Vite for lightning-fast HMR and build times.

## 🛠️ Tech Stack

*   **Core**: [Electron 40](https://www.electronjs.org/), [React 19](https://react.dev/), [TypeScript 5.9](https://www.typescriptlang.org/)
*   **Build Tool**: [Vite 7](https://vitejs.dev/)
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
*   **State Management**: [Zustand](https://github.com/pmndrs/zustand)
*   **AI Integration**: [MCP SDK](https://github.com/modelcontextprotocol), Claude Agent SDK, OpenAI SDK

## 🚀 Getting Started

### Prerequisites

*   Node.js (v18 or higher recommended)
*   npm or pnpm

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/geni.git
    cd geni
    ```

2.  (Optional) Set Electron mirror for faster download (Recommended for users in China):
    - **Windows (PowerShell)**:
      ```powershell
      $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
      ```
    - **macOS/Linux**:
      ```bash
      export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
      ```

3.  Install dependencies:
    ```bash
    npm install
    # or
    pnpm install
    ```

### Development

Start the development server (runs both Electron main process and React renderer):

```bash
npm run dev
```

## 📦 Building and Release

To package the application for production:

**Windows:**
```bash
npm run dist:win
```

**macOS:**
```bash
npm run dist:mac
```

**Linux:**
```bash
npm run dist:linux
```

The output artifacts (installers, executables) will be generated in the `release` directory.

## 📂 Project Structure

```
geni/
├── src/
│   ├── common/                 # Shared types and IPC definitions
│   │   ├── types/              # TypeScript type definitions
│   │   ├── ipc/                # IPC channel constants
│   │   └── i18n/               # Internationalization
│   ├── main/                   # Electron main process
│   │   ├── controllers/        # IPC controllers
│   │   └── services/           # Core business logic
│   │       ├── agent/          # AI Agent runtime
│   │       ├── llm/            # LLM provider adapters
│   │       ├── tools/          # Tool system (built-in + MCP)
│   │       ├── skills/         # Skill registry
│   │       ├── session/        # Chat session management
│   │       ├── scheduler/      # Cron task scheduler
│   │       ├── im/             # IM platform adapters
│   │       ├── staff/          # Digital staff management
│   │       ├── memory/         # Memory storage
│   │       ├── usage/          # API usage tracking
│   │       └── update/         # Auto-update service
│   ├── preload/                # Context isolation & IPC bridge
│   └── renderer/               # React frontend
│       ├── components/         # Reusable UI components
│       ├── layouts/           # Page layouts
│       ├── pages/             # Full page components
│       └── store/             # Zustand state management
├── skills/                     # Built-in skills
├── build/                      # Icons and build resources
├── release/                    # Packaged output
└── tests/                      # Unit tests (Vitest)
```

## 📄 License

[ISC](LICENSE)
