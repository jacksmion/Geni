# Agent 管理功能技术实现方案 (Agent Management System)

**日期**: 2026-03-14  
**版本**: V1.1  
**状态**: 需求确认 & 方案设计

---

## 1. 需求概述 (Requirements)

为了提升 Geni 的专业化能力，需要实现一套 Agent 管理系统，允许用户根据不同场景定制专属的 AI 专家。

### 核心能力：
- **独立人格 (Custom Prompts)**: 每个 Agent 拥有独立的 System Instruction。
- **能力沙箱 (Scoped Tools/Skills)**: 允许为每个 Agent 勾选特定的工具（如 Bash, Python Interpreter）和技能（如 Git Expert, TDD SOP）。
- **会话绑定 (Session Persistence)**: 会话可以锁定特定 Agent，确保上下文连贯性。
- **多角色切换 (Agent Switching)**: 支持在对话中通过 `@` 提及或 UI 快速切换角色。

---

## 2. 技术设计 (Technical Solution)

### 2.1 数据模型 (Data Model)

在 `src/common/types/agent.ts` 中定义实体：

```typescript
export interface AgentConfig {
  id: string;          // 唯一标识
  name: string;        // 员工姓名 (如: 架构师助手)
  jobTitle: string;    // 职位 (如: Frontend Expert)
  description: string; // 职责简介
  avatar?: string;     // 头像/Emoji
  instructions: string;// 核心 System Prompt
  
  // 能力边界
  tools: string[];     // 启用的工具 ID 列表
  skills: string[];    // 关联的业务技能 ID 列表
  
  // 运行配置 (覆盖全局设置)
  modelConfig?: {
    provider: string;
    model: string;
    temperature: number;
  };
  
  createdAt: number;
  updatedAt: number;
}
```

### 2.2 后端服务集成 (Backend)

1.  **AgentManager**: 新增 `src/main/services/agent/AgentManager.ts` 用于处理 Agent 的增删改查及文件持久化 (`agents.json`)。
2.  **Session 增强**: 在 `ChatSession` 结构中增加 `agentId` 字段，持久化存储当前会话使用的专家角色。
3.  **Runtime 动态构建**: 
    - 修改 `AgentRuntime.run()`，根据 `options` 中的 `agentId` 从 `AgentManager` 获取配置。
    - 动态组合 `PromptBuilder` 的上下文，注入 Agent 的 `instructions`。
    - 实时过滤 `tools` 列表，实现“最小权限原则”。

### 2.3 前端交互 (Frontend)

- **Agent 广场 (Studio)**: 提供一个管理界面，用于配置专家。
- **会话初始化**: 在新建会话时，用户可从“员工池”中指派一名成员。
- **UI 反馈**: 会话界面顶部的头像和标题随绑定的 Agent 实时更新。

---

## 4. 实施计划 (Implementation Roadmap)

1.  **Phase 1 (基础)**: 定义 `AgentConfig` 类型，实现 `AgentManager` 后端 CRUD。
2.  **Phase 2 (内核)**: 升级 `AgentRuntime` 和 `PromptBuilder`，支持基于配置的动态加载模式。
3.  **Phase 3 (界面)**: 开发“数字员工中心”配置页，并在会话创建中加入指派逻辑。
4.  **Phase 4 (增强)**: 实现多 Agent 自动路由 (基于 `@mentions`)。

---

> [!TIP]
> **设计原则**: 保持底层 `AgentRuntime` 的纯粹性，通过“配置注入”而非“硬编码”来实现多角色切换，确保系统的高扩展性。
