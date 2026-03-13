# Geni 核心提议：数字员工 (Digital Employee) UI/UX 设计方案

**日期**: 2026-03-13  
**版本**: V1.0  
**状态**: 草案 / 已评审  

---

## 1. 概念背景 (Concept)

将 Geni 从单纯的“AI 助手”进化为**虚拟团队协作平台**。通过“数字员工”这一概念，将 Agent 的配置（System Prompt）、能力（Skills & MCP Tools）和持久化资产（Memory）进行高度封装和拟人化。

### 1.1 核心公式
> **数字员工 (Agent)** = **人格 (Persona)** + **软技能 (Skills)** + **硬工具 (Tools)** + **经验 (Memory)**

---

## 2. 功能板块设计 (Team Hub)

建议新增独立导航页 **“Staffing / Studio”**，用于统一管理数字员工的一生。

### 2.1 员工档案 (Dossier View)
- **视觉呈现**: 采用 Grid 栅格布局，卡片化展示。
- **关键属性**:
    - **Avatar**: 支持自定义头像或 AI 生成。
    - **Job Title**: 明确其专业领域（如：Frontend Architect, Go Optimizer）。
    - **Status**: 展示当前状态（Idle, Busy, Off-duty）。
- **能力矩阵**: 使用 **Radar Chart (雷达图)** 直观展示其在 Coding, Debugging, Testing, Documentation 等维度的强项。

### 2.2 配置工作台 (Workbench)
在详情编辑页，采用模块化设计：
- **Brain 模块**: 定义模型、Temperature 以及 System Prompt (人格约束)。
- **Skill 模块**: 勾选已加载的技能包 (SOP/经验文档)。
- **Action 模块**: 分配 MCP Tools 权限。
- **Memory 模块**: 管理其私有存储空间，支持查看、导出或清空其生成的 `MemoryStore` 条目。

---

## 3. 使用场景与交互 (Usage)

### 3.1 会话指派制 (Consultant Pattern)
- **交互**: 在创建新聊天会话时，弹出“指派列表”。
- **效果**: 会话被锁定为特定员工的上下文，UI 头像同步替换，提升沉浸感。

### 3.2 随时召唤制 (@Mention Pattern)
- **交互**: 在通用会话中打出 `@` 符号弹出员工列表。
- **效果**: 实现多专家协同。例如：`@Architect` 设计方案 -> `@Coder` 编写代码 -> `@Tester` 生成边缘用例。

### 3.3 自动化协作 (Scheduler Integration)
- **交互**: 在 `Scheduler` 配置中，将“数字员工”指派给特定 Cron 任务。
- **效果**: 员工可以在后台独立执行“每日零点代码审计”或“定时竞品监控”并推送报告。

---

## 4. 技术演进建议

1. **Memory 隔离**: 建议为每个数字员工分配独立的持久化文件（如 `memory/staff_001.md`），确保知识库不互相干扰。
2. **体验反馈**: 在 `Thought Trace` (思维链路) 中，加入数字员工独有的语气和风格标记。
3. **动态生成**: 支持 `/hire` 命令，允许在对话过程中基于当前上下文逻辑，反向提取并保存为一个新的数字员工。

---

> **结论**: 数字员工板块不仅是配置的集合，更是 Geni “虚拟配对程序员”愿景的具体载体，旨在通过视觉上的“团队感”降低用户的管理心智负担。
