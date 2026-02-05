# AI Assistant Core - 增强型设计方案 (Claude Skills 兼容)

## 1. 核心愿景
打造一个桌面端的“个人技能中枢”，完美兼容 Claude 技能定义规范，通过 ReAct 模式赋予 AI 逻辑推理与工具调用能力。

## 2. 技能系统架构 (Claude Skills Interop)

### 2.1 技能定义规范
所有的技能将严格遵循以下目录结构：
```text
skills/
  └── my-skill/
      ├── SKILL.md      # 包含 YAML Frontmatter (name, description)
      ├── handler.py    # Python 逻辑实现 (可选)
      └── handler.js    # JS/Node 逻辑实现 (可选)
```

### 2.2 技能加载流程 (Engine)
1.  **扫描**: Node.js 主进程递归扫描 `skills/` 目录。
2.  **解析**: 利用 `gray-matter` 支持，实时解析 `SKILL.md` 中的元数据。
3.  **Prompt 注入**: 在 LLM 调用时，自动根据当前启用的技能列表，将 `name` 和 `description` 转化为 `Tools` 系统提示。

## 3. 核心子系统设计

### 3.1 信任等级管理 (Trust System)
- **Ask (默认)**: 每次调用技能前需在 UI 确认。
- **Auto**: 允许特定技能在当前对话中自动运行，适合处理数据。

### 3.2 代理引擎 (ReAct Agent)
- **输入**: 用户 Query + 启用的技能集。
- **循环**: 
    1.  **Thinking**: 模型分析用户意图，决定调用的技能。
    2.  **Acting**: 执行 Python 或 Shell 指令。
    3.  **Observing**: 捕获输出并返回给模型。
- **结果**: 生成最终答案。

### 3.3 UI 组件化设计 (Atomic UI)
- **ThoughtPanel**: 类似于代码块的卡片，展示思维链。
- **SkillRegistry**: 列表卡片展示所有技能，支持快速开关。

## 4. 安全性
- **沙箱模拟**: 虽然运行在本地，但通过超时控制和权限标记 (Manifest Flags) 进行限制。
- **明文审计**: 所有生成的 Python 脚本在执行前均可在日志中审计。
