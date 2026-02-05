# AI Assistant Core - 桌面智能助手设计方案

## 1. 项目概述
本项目旨在开发一个功能类似 Claude Cowork 的桌面智能助手。它不局限于简单的对话，而是一个基于 **ReAct** 模式的智能代理 (Agent)，能够通过 **Python Bridge** 调用本地扩展技能 (Skills)，并具备可视化的技能管理界面。

## 2. 核心技术栈
- **框架**: Electron (桌面外壳)
- **UI 层**: React + Tailwind CSS (现代化界面)
- **调度层**: Node.js (系统调用与进程管理)
- **执行引擎**: Python (本地脚本执行与逻辑扩展)
- **通信**: IPC (进程间通信) + SSE/JSON (LLM 流式通信)

## 3. 关键特性

### 3.1 ReAct 智能代理 (Reasoning & Acting)
- **思维闭环**: 助手遵循 `Thought -> Action -> Observation` 循环。
- **思维可视化**: UI 实时展示助手的“思考过程”，增强交互透明度。
- **自我纠错**: 助手能根据子进程执行的错误反馈 (Observation) 自动修正并重试。

### 3.2 技能系统 (Visual Skill Hub)
- **可视化管理**: 提供独立的 Skills 管理面板，支持一键开关。
- **配置化**: 允许用户为每个技能独立配置参数（如 API Key）和信任级别。
- **安全模式**:
    - **手动确认**: 敏感操作需用户点击确认。
    - **自动处理**: 信任常用技能，由 LLM 自主决定执行。

### 3.3 Python 执行器 (Code Interpreter)
- **动态运行**: 支持实时生成、执行 Python 脚本并捕获输出。
- **本地扩展**: 许多复杂技能（如 Excel 处理、文件搜索）将直接通过 Python 实现。

## 4. 架构设计

### 4.1 进程模型
1. **Renderer Process (React)**: 
   - 聊天界面
   - Skills 管理界面 (Skill Hub)
   - 代码查看与结果展示状态
2. **Main Process (Electron/Node.js)**:
   - 管理 LLM 的 Context 与对话记录
   - 动态装载 `manifest.json` 形式的技能定义
   - 调度 Python 执行环境
3. **Execution Layer (Python)**:
   - 具体的技能执行脚本
   - 自动化任务处理器

### 4.2 技能定义格式 (Skill Manifest)
```json
{
  "id": "python-executor",
  "name": "Python 代码解释器",
  "description": "允许助手直接运行 Python 脚本处理本地数据",
  "version": "1.0.0",
  "trustLevel": "AskEverytime",
  "parameters": {
    "code": "string"
  }
}
```

## 5. 安全与隐私
- **本地优先**: 脚本执行在用户本地进行。
- **权限管控**: 所有的系统级操作均绑定至 Skills 权限系统。

## 6. 后续规划
- 完善插件市场 (Plugin Store)
- 支持多模态交互（屏幕识别）
- 本地 RAG 知识库集成
