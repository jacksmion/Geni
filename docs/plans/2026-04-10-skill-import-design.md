# 技能导入功能设计

## 概述

在技能管理（SkillSettings）页面增加"导入技能"功能，支持从文件夹、ZIP 压缩包、.skill 包导入技能到 `~/.geni/skills/`。

## 支持的输入类型

| 类型 | 说明 |
|------|------|
| 文件夹 | 直接包含 SKILL.md 的目录 |
| `.zip` 文件 | 压缩包内含 SKILL.md |
| `.skill` 文件 | 本质也是 ZIP，内含 SKILL.md |

## 数据流

```
用户点击"导入" → 统一文件选择器(文件夹/.zip/.skill)
  → IPC: skill:import {path} → 后端检测类型
    → 文件夹: 验证 SKILL.md 存在
    → ZIP/.skill: 解压到临时目录 → 验证 SKILL.md
  → 检查目标路径 ~/.geni/skills/<skill-name> 是否已存在
    → 无冲突: 直接复制 → 返回成功
    → 有冲突: 返回冲突信息 → 前端弹出对话框(覆盖/跳过/重命名)
      → 用户选择后 IPC: skill:import-confirm → 执行对应操作
  → 刷新技能列表
```

## UI 设计

- 在 SkillSettings 页面添加"导入技能"按钮
- 使用 Electron 统一文件选择器（同时支持 openDirectory 和 openFile，过滤 .zip/.skill）
- 冲突时弹出对话框，提供三个选项：覆盖、跳过、重命名

## 后端架构

### 新建 SkillImportService

职责：
- 检测输入类型（文件夹 / ZIP / .skill）
- ZIP/.skill 解压到临时目录
- 验证 SKILL.md 是否存在，提取技能名称
- 检测目标路径冲突
- 执行导入操作（复制/覆盖/重命名）
- 清理临时文件

### IPC 通道

| 通道 | 参数 | 返回 |
|------|------|------|
| `skill:import` | `{ path: string }` | `{ status: 'success' }` 或 `{ status: 'conflict', skillName, targetPath }` |
| `skill:import-confirm` | `{ sourcePath, skillName, action: 'overwrite' \| 'skip' \| 'rename' }` | `{ status: 'success' }` |

## 涉及文件

| 文件 | 变更 |
|------|------|
| `src/main/services/skills/SkillImportService.ts` | **新建** - 导入逻辑核心 |
| `src/main/controllers/ToolController.ts` | 添加 IPC handler |
| `src/renderer/pages/settings/SkillSettings.tsx` | 添加导入按钮和冲突对话框 |
| IPC channels 注册 | 新增 `skill:import`, `skill:import-confirm` |

## 错误处理

- 无效文件（没有 SKILL.md）→ 提示"不是有效的技能包"
- 解压失败 → 提示错误信息
- 读写权限问题 → 提示错误信息
