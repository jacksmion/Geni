# AI Assistant Core Implementation Plan (Optimized)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 开发一个完美兼容 Claude Skills 标准、支持 ReAct 模式及可视化管理的桌面端 AI 智能助手。

**Architecture:** Electron (Shell) + React (UI) + Node.js (Skill Management & Agent Engine) + Python (Local Execution).
- **Skill Engine**: 模拟 Claude Code 的技能加载机制，支持 YAML frontmatter 解析和工具化转换。
- **Agent Loop**: 基于 ReAct 模式，将 Skills 转换为 LLM 可调用的 Tools。

**Tech Stack:** Electron, React, Vite, Tailwind CSS, Node.js (`gray-matter` for YAML), Python 3.

---

### Task 1: 项目基础搭建 (Electron + Vite + React)

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `src/main/main.ts`
- Create: `src/main/preload.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.tsx`

**Step 1: 初始化项目结构**
按照现代 Electron + Vite 最佳实践搭建工程。

**Step 2: 安装核心依赖**
`npm install lucide-react gray-matter clsx tailwind-merge`

**Step 3: 提交代码**
```bash
git add .
git commit -m "chore: scaffold electron vite project"
```

---

### Task 2: Claude 兼容的技能加载器 (Skill Loader)

**Files:**
- Create: `src/main/services/SkillLoader.ts`
- Create: `src/common/types/skill.ts`

**Step 1: 实现 YAML Frontmatter 解析**
使用 `gray-matter` 读取 `skills/*/SKILL.md`，提取 `name` 和 `description`。
**Why:** 确保助手能像 Claude 一样通过描述发现技能。

**Step 2: 技能到工具的转换逻辑 (Skill to Tool)**
编写逻辑将 Skill 的定义（及配套的 Python 入口）转换为 OpenAI/Claude 格式的 Tool Definition。

---

### Task 3: 可视化技能管理中心 (Skill Hub UI)

**Files:**
- Create: `src/renderer/components/SkillCard.tsx`
- Create: `src/renderer/pages/SkillHub.tsx`

**Step 1: 构建技能列表界面**
展示技能名称、描述及其启用状态。

**Step 2: 实现信任级别选择器 (Trust Levels)**
支持 `Ask` 和 `Auto` 模式的切换，对应不同的 IPC 调用策略。

---

### Task 4: ReAct Agent 引擎与 UI 反馈

**Files:**
- Create: `src/main/services/AgentEngine.ts`
- Create: `src/renderer/components/ThoughtTrace.tsx`

**Step 1: 构建 ReAct 提示词模板**
参考 Claude 官方最佳实践，强制模型输出 `Thought`, `Action`, `Observation` 结构。

**Step 2: 思考链可视化**
在对话历史中，以优雅的微动画展示助手的思考步进。

---

### Task 5: Python 运行环境桥接 (Code Interpreter)

**Files:**
- Create: `src/main/services/PythonBridge.ts`
- Create: `skills/python-exec/SKILL.md`
- Create: `skills/python-exec/handler.py`

**Step 1: 实现带超时的进程控制器**
确保 Python 脚本运行不会导致应用挂起，实时流式输出 stdout。

**Step 2: 验证首个 Skill**
通过助手调用 `python-exec` 技能完成一个简单的数学计算或文件读取任务。

---

### Task 6: 最终集成与冒烟测试
集成 LLM API，验证从“用户提问 -> 思路分析 -> 技能调用 -> 结果返回”的完整闭环。
