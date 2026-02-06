# MUSE

> **Your AI-Powered Collaborative Workspace Assistant**
> *Enabling inspiration through intelligence.*

MUSE is a modern desktop application designed to bridge the gap between AI intelligence and your local workflow. Built with **Electron**, **React**, and the **Model Context Protocol (MCP)**, MUSE offers a seamless environment for AI-assisted coding, writing, and problem-solving.

## ✨ Features

*   **🤖 Intelligent Chat Interface**: Interact with advanced AI models (Claude, OpenAI) in a deeply integrated chat environment.
*   **🔌 Model Context Protocol (MCP)**: Extensible architecture supporting MCP servers for file system access, terminal execution, and more.
*   **🛠️ Built-in Tools**:
    *   **FileSystem**: Read, write, and search files directly from the chat.
    *   **Terminal**: Execute commands and scripts securely.
*   **🎨 Premium UI/UX**:
    *   Modern, responsive design with **Tailwind CSS v4**.
    *   Dark/Light mode support.
    *   Beautiful Markdown rendering with syntax highlighting and typographic optimization.
*   **⚡ High Performance**: Powered by Vite for lightning-fast HMR and build times.

## 🛠️ Tech Stack

*   **Core**: [Electron](https://www.electronjs.org/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
*   **Build Tool**: [Vite](https://vitejs.dev/)
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
*   **State Management**: [Zustand](https://github.com/pmndrs/zustand)
*   **AI Integration**: [MCP SDK](https://github.com/modelcontextprotocol), Claude Agent SDK

## 🚀 Getting Started

### Prerequisites

*   Node.js (v18 or higher recommended)
*   npm or pnpm

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/muse.git
    cd muse
    ```

2.  Install dependencies:
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
muse/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── services/         # Core business logic (Agents, MCP, Config)
│   │   └── index.ts          # Entry point
│   ├── preload/              # Context isolation & IPC bridge
│   └── renderer/             # React frontend
│       ├── components/       # Reusable UI components
│       ├── layouts/          # Page layouts (Sidebar, etc.)
│       ├── modules/          # Feature scenarios (Chat, etc.)
│       └── store/            # State management (Zustand)
├── build/                    # Icons and build resources
├── release/                  # Packaged output
└── package.json
```

## 📄 License

[ISC](LICENSE)
