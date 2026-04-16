# 数字员工导入导出设计

## 目标

支持数字员工（StaffProfile）配置的单文件导入导出，方便在设备间分享和备份。

## 范围

仅 StaffProfile 配置（名称、模型、提示词、技能、工具权限等），不含技能文件和会话历史。

## 导出文件格式

```json
{
  "version": 1,
  "type": "staff-profile",
  "profile": {
    "name": "代码审查员",
    "modelId": "openai/gpt-4o",
    "systemPrompt": "你是一个代码审查专家...",
    "temperature": 0.7,
    "skillIds": ["code-review"],
    "allowedTools": ["bash", "read", "glob", "grep"],
    "avatar": "🔍",
    "description": "专门审查代码质量"
  }
}
```

- 不含 `id`、`status`、`createdAt`、`updatedAt`（导入时重新生成）
- 文件名默认：`{员工名称}.geni-staff.json`

## 后端设计

在 `StaffManager` 上新增方法：

### `exportToJSON(id: string): { fileName: string; json: string }`

1. 从内存取出 profile
2. 剥离 `id`、`status`、`createdAt`、`updatedAt`
3. 包装成 `{ version: 1, type: 'staff-profile', profile }`
4. 返回文件名 + JSON 字符串

### `importFromJSON(jsonStr: string): ImportResult`

1. 解析 JSON，校验 `version`、`type`、`profile.name` 必填
2. `modelId` 保留原值，为空时兜底默认模型（从 settings 取）
3. 按名称匹配检查是否与现有员工冲突
4. 无冲突 → `create()` 生成新 ID
5. 有冲突 → 返回冲突信息，等前端确认

返回类型：

```typescript
interface ImportResult {
  status: 'success' | 'conflict' | 'error';
  conflictName?: string;
  conflictId?: string;
  warnings?: string[];  // 如 "模型可能不可用"
  error?: string;
}
```

### `confirmImport(jsonStr: string, action: 'overwrite' | 'rename' | 'skip', conflictId?: string): ConfirmResult`

- `skip` → 直接返回成功
- `overwrite` → `update()` 覆盖已有员工
- `rename` → 名称追加后缀，`create()` 新建

## IPC 通道

| Channel | 方向 | 说明 |
|---------|------|------|
| `staff:export` | invoke | 传入 id，返回 `{ fileName, json }` |
| `staff:import` | invoke | 传入 JSON 字符串，返回 ImportResult |
| `staff:confirm-import` | invoke | 传入 JSON + action，完成导入 |

## 前端设计

在员工管理页面（列表和详情）增加：

- **导出按钮**：调 `staff:export` → 系统 SaveDialog 写文件
- **导入按钮**：系统 OpenDialog 读 `.geni-staff.json` → `staff:import` → 冲突弹确认框 → `staff:confirm-import`

文件对话框通过 IPC 让 main 进程调 `dialog.showOpenDialog` / `dialog.showSaveDialog`。

## 方案选择

方案 A：直接扩展 StaffManager（选定）
- 改动最小，复用现有 CRUD 架构
- 导出 = get + 序列化，导入 = 反序列化 + create/update，无需额外抽象层
