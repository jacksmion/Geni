# AI Assistant Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 开发一个具备 ReAct 模式、可视化技能管理和 Python 执行能力的桌面端 AI 智能助手。

**Architecture:** 基于 Electron 的多进程架构。渲染进程 (React) 负责 UI 和交互，主进程 (Node.js) 负责调度 LLM、解析 ReAct 逻辑并管理 Python 代码执行环境。

**Tech Stack:** Electron, React (Vite), Tailwind CSS, Node.js, Python 3, IPC.

---

### Task 1: 项目初始化 (Init & Setup)

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `src/main.ts` (Electron Main)
- Create: `src/index.html`

**Step 1: 初始化工程结构**
初始化 Electron + Vite + React 的基础结构。

**Step 2: 配置 Tailwind CSS**
运行: `npx tailwindcss init -p`

**Step 2: 提交代码**
```bash
git init
git add .
git commit -m "chore: initial project setup"
```

---

### Task 2: 核心桥接与窗口管理 (Core Shell & IPC)

**Files:**
- Modify: `src/main.ts`
- Create: `src/preload.ts`
- Create: `src/renderer/App.tsx`

**Step 1: 建立安全 IPC 桥梁**
在 `preload.ts` 中定义 `window.electronAPI`，支持文件读取和子进程状态监听。

**Step 2: 实现基础 Chat 布局**
使用 Tailwind 编写侧边栏（Skills）与主对话区。

---

### Task 3: Python 执行引擎 (Python Bridge)

**Files:**
- Create: `src/services/pythonManager.ts` (Node.js)
- Create: `scripts/test_script.py`

**Step 1: 实现异步进程执行器**
编写一个能够启动 Python 子进程、实时捕获 `stdout/stderr` 并通过 IPC 回传渲染进程的模块。

**Step 2: 编写测试脚本验证**
Run: `python scripts/test_script.py` 并由 Node.js 捕获结果。

---

### Task 4: ReAct 代理逻辑 (Agent Thinking & Loop)

**Files:**
- Create: `src/services/agentEngine.ts`
- Create: `src/renderer/components/ThoughtBox.tsx`

**Step 1: 定义思考模式 (Thought/Action/Observation)**
在前端或主进程中实现解析器，正则解析 LLM 返回的 Thought 和 Tool Call 指令。

**Step 2: 实现思维链可视化组件**
在对话历史中插入一个 `ThoughtBox`，支持折叠展示助手的“思考过程”。

---

### Task 5: 技能管理中心 (Skill Hub)

**Files:**
- Create: `src/renderer/pages/SkillHub.tsx`
- Create: `src/services/skillLoader.ts`
- Create: `skills/manifest.json` (Example)

**Step 1: 扫描并加载本地 Skills**
主进程扫描 `skills/` 目录下的所有 `manifest.json`，并将信息传递给前端。

**Step 2: 实现 Skill 开关与信任度配置界面**
在 Skill Hub 中允许用户修改 `trustLevel`（自动执行 vs 需确认）。

---

### Task 6: 最终集成与测试

**Files:**
- Modify: `src/main.ts`

**Step 1: 集成全流程测试**
模拟一次“读取 Excel 数据并分析”的 ReAct 流程，测试从 Thought -> Python -> Observation -> 回答的完整闭环。
