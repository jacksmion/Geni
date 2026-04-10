# Skill Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add skill import functionality to SkillSettings page, supporting folders, ZIP, and .skill packages.

**Architecture:** New `SkillImportService` in main process handles file detection, ZIP extraction, SKILL.md validation, and conflict detection. ToolController exposes IPC handlers. Frontend adds import button + conflict dialog in SkillSettings.

**Tech Stack:** Electron IPC, adm-zip (new dependency), React, TypeScript, Tailwind CSS, react-i18next

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/main/services/skills/SkillImportService.ts` | **Create** | Core import logic: detect type, extract ZIP, validate, detect conflicts, copy |
| `src/common/ipc/channels.ts` | Modify | Add `IMPORT_SKILL` and `IMPORT_SKILL_CONFIRM` channels |
| `src/main/controllers/ToolController.ts` | Modify | Add IPC handlers delegating to SkillImportService |
| `src/main/preload.ts` | Modify | Expose `importSkill` and `importSkillConfirm` in tools namespace |
| `src/renderer/electron-api.d.ts` | Modify | Add type declarations for new IPC methods |
| `src/renderer/pages/settings/SkillSettings.tsx` | Modify | Add import button, file dialog call, conflict dialog |
| `src/common/i18n/locales/zh.json` | Modify | Add Chinese translations for import UI |
| `src/common/i18n/locales/en.json` | Modify | Add English translations for import UI |
| `src/main/router.ts` | Modify | Instantiate SkillImportService and pass to ToolController |
| `package.json` | Modify | Add adm-zip dependency |

---

### Task 1: Install adm-zip dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install adm-zip**

Run:
```bash
cd D:/workspace/Geni && npm install adm-zip
```

- [ ] **Step 2: Install types**

Run:
```bash
cd D:/workspace/Geni && npm install -D @types/adm-zip
```

- [ ] **Step 3: Verify installation**

Run:
```bash
cd D:/workspace/Geni && node -e "const AdmZip = require('adm-zip'); console.log('adm-zip OK')"
```
Expected: `adm-zip OK`

---

### Task 2: Add IPC channels

**Files:**
- Modify: `src/common/ipc/channels.ts`

- [ ] **Step 1: Add import channels to TOOL_CHANNELS**

In `src/common/ipc/channels.ts`, add two new entries to the `TOOL_CHANNELS` object (after the existing `CORE_TOOL_SET_TRUST_LEVEL` line):

```typescript
IMPORT_SKILL: 'tool:import-skill',
IMPORT_SKILL_CONFIRM: 'tool:import-skill-confirm',
```

The full `TOOL_CHANNELS` block should end with:
```typescript
export const TOOL_CHANNELS = {
    GET_SKILLS: 'tool:get-skills',
    TOGGLE_SKILL: 'tool:toggle-skill',
    SET_TRUST_LEVEL: 'tool:set-trust-level',
    MCP_CONNECT: 'tool:mcp-connect',
    MCP_LIST_TOOLS: 'tool:mcp-list-tools',
    MCP_TOGGLE_TOOL: 'tool:mcp-toggle-tool',
    MCP_SET_TOOL_TRUST_LEVEL: 'tool:mcp-set-tool-trust-level',
    MCP_TOGGLE_SERVER: 'tool:mcp-toggle-server',
    MCP_GET_STATUSES: 'tool:mcp-get-statuses',
    CORE_TOOL_LIST: 'tool:core-tool-list',
    CORE_TOOL_TOGGLE: 'tool:core-tool-toggle',
    CORE_TOOL_SET_TRUST_LEVEL: 'tool:core-tool-set-trust-level',
    IMPORT_SKILL: 'tool:import-skill',
    IMPORT_SKILL_CONFIRM: 'tool:import-skill-confirm',
} as const;
```

---

### Task 3: Create SkillImportService

**Files:**
- Create: `src/main/services/skills/SkillImportService.ts`

- [ ] **Step 1: Create the service file**

Create `src/main/services/skills/SkillImportService.ts` with the following content:

```typescript
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import { SkillParser } from './core/SkillParser';
import { existsSync } from 'node:fs';

export type ImportAction = 'overwrite' | 'skip' | 'rename';

export interface ImportResult {
    status: 'success' | 'conflict' | 'error';
    skillName?: string;
    targetPath?: string;
    sourceTempDir?: string;
    error?: string;
}

export interface ConfirmResult {
    status: 'success' | 'error';
    skillName?: string;
    error?: string;
}

export class SkillImportService {
    private globalSkillsDir: string;

    constructor(globalSkillsDir: string) {
        this.globalSkillsDir = globalSkillsDir;
    }

    /**
     * Import a skill from a folder or ZIP/.skill file.
     * Returns conflict info if the skill already exists, otherwise imports directly.
     */
    async importSkill(sourcePath: string): Promise<ImportResult> {
        try {
            // Validate source exists
            if (!existsSync(sourcePath)) {
                return { status: 'error', error: 'Source path does not exist' };
            }

            let skillDir: string;
            let isTemp = false;

            const stat = fsSync.statSync(sourcePath);

            if (stat.isDirectory()) {
                // Direct folder import
                skillDir = sourcePath;
            } else if (stat.isFile()) {
                const ext = path.extname(sourcePath).toLowerCase();
                if (ext === '.zip' || ext === '.skill') {
                    // Extract ZIP to temp directory
                    skillDir = await this.extractZip(sourcePath);
                    isTemp = true;
                } else {
                    return { status: 'error', error: 'Unsupported file type. Only .zip and .skill files are supported.' };
                }
            } else {
                return { status: 'error', error: 'Invalid source path' };
            }

            // Validate SKILL.md exists
            const validation = await this.validateSkillDir(skillDir);
            if (!validation.valid) {
                if (isTemp) {
                    await this.cleanup(skillDir);
                }
                return { status: 'error', error: validation.error };
            }

            const skillName = this.sanitizeName(validation.skillName!);
            const targetPath = path.join(this.globalSkillsDir, skillName);

            // Check for conflict
            if (existsSync(targetPath)) {
                // Return conflict info — keep temp dir alive for confirmation
                return {
                    status: 'conflict',
                    skillName,
                    targetPath,
                    sourceTempDir: isTemp ? skillDir : undefined,
                };
            }

            // No conflict — copy directly
            await this.copySkill(skillDir, targetPath);
            if (isTemp) {
                await this.cleanup(skillDir);
            }

            return { status: 'success', skillName };
        } catch (error: any) {
            console.error('[SkillImportService] Import failed:', error);
            return { status: 'error', error: error.message || 'Unknown error' };
        }
    }

    /**
     * Confirm an import after conflict resolution.
     */
    async confirmImport(
        originalSourcePath: string,
        sourceTempDir: string | undefined,
        skillName: string,
        action: ImportAction
    ): Promise<ConfirmResult> {
        try {
            if (action === 'skip') {
                if (sourceTempDir) {
                    await this.cleanup(sourceTempDir);
                }
                return { status: 'success', skillName };
            }

            // Determine source directory
            let skillDir: string;
            let isTemp = false;

            if (sourceTempDir && existsSync(sourceTempDir)) {
                skillDir = sourceTempDir;
                isTemp = true;
            } else {
                // Re-resolve from original path
                const stat = fsSync.statSync(originalSourcePath);
                if (stat.isDirectory()) {
                    skillDir = originalSourcePath;
                } else {
                    skillDir = await this.extractZip(originalSourcePath);
                    isTemp = true;
                }
            }

            let targetPath = path.join(this.globalSkillsDir, skillName);

            if (action === 'rename') {
                // Find an available name
                let counter = 1;
                let newName = `${skillName}-${counter}`;
                while (existsSync(path.join(this.globalSkillsDir, newName))) {
                    counter++;
                    newName = `${skillName}-${counter}`;
                }
                targetPath = path.join(this.globalSkillsDir, newName);
            }

            // For overwrite: remove existing first
            if (action === 'overwrite' && existsSync(targetPath)) {
                await fs.rm(targetPath, { recursive: true, force: true });
            }

            await this.copySkill(skillDir, targetPath);
            if (isTemp) {
                await this.cleanup(skillDir);
            }

            return { status: 'success', skillName: path.basename(targetPath) };
        } catch (error: any) {
            console.error('[SkillImportService] Confirm import failed:', error);
            return { status: 'error', error: error.message || 'Unknown error' };
        }
    }

    /**
     * Extract a ZIP file to a temporary directory and return the extracted path.
     * If the ZIP contains a single top-level directory, returns that directory path.
     */
    private async extractZip(zipPath: string): Promise<string> {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geni-skill-import-'));
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tempDir, true); // true = overwrite

        // Check if extracted content is a single directory
        const entries = await fs.readdir(tempDir);
        if (entries.length === 1) {
            const singleEntryPath = path.join(tempDir, entries[0]);
            const singleStat = await fs.stat(singleEntryPath);
            if (singleStat.isDirectory()) {
                return singleEntryPath;
            }
        }

        return tempDir;
    }

    /**
     * Validate that a directory contains a valid SKILL.md.
     */
    private async validateSkillDir(dir: string): Promise<{ valid: boolean; skillName?: string; error?: string }> {
        const skillMdPath = path.join(dir, 'SKILL.md');
        if (!existsSync(skillMdPath)) {
            return { valid: false, error: 'No SKILL.md found. Not a valid skill package.' };
        }

        try {
            const content = await fs.readFile(skillMdPath, 'utf-8');
            const skill = SkillParser.parse(content, skillMdPath);
            return { valid: true, skillName: skill.id || skill.name };
        } catch (error: any) {
            return { valid: false, error: `Invalid SKILL.md: ${error.message}` };
        }
    }

    /**
     * Copy skill directory to target, preserving structure.
     */
    private async copySkill(source: string, target: string): Promise<void> {
        await fs.cp(source, target, { recursive: true });
    }

    /**
     * Clean up temporary directory.
     */
    private async cleanup(dir: string): Promise<void> {
        try {
            await fs.rm(dir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }

    /**
     * Sanitize a skill name for use as a directory name.
     */
    private sanitizeName(name: string): string {
        return name
            .replace(/[<>:"/\\|?*]/g, '-')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            || 'unnamed-skill';
    }
}
```

---

### Task 4: Add IPC handlers to ToolController

**Files:**
- Modify: `src/main/controllers/ToolController.ts`

- [ ] **Step 1: Add SkillImportService import and constructor parameter**

At the top of `src/main/controllers/ToolController.ts`, add the import:

```typescript
import { SkillImportService } from '../services/skills/SkillImportService';
```

Update the constructor to accept the new parameter:

```typescript
constructor(
    private skillRegistry: SkillRegistry,
    private toolRegistry: ToolRegistry,
    private mcpManager: McpManager,
    private configManager: ConfigManager,
    private coreToolManager: CoreToolManager,
    private skillImportService: SkillImportService
) { }
```

- [ ] **Step 2: Add IPC handler registrations in registerHandlers()**

Add these two lines inside `registerHandlers()`, after the existing `CORE_TOOL_SET_TRUST_LEVEL` handler:

```typescript
ipcMain.handle(TOOL_CHANNELS.IMPORT_SKILL, (_, filePath: string) => this.skillImportService.importSkill(filePath));
ipcMain.handle(TOOL_CHANNELS.IMPORT_SKILL_CONFIRM, (_, originalPath: string, sourceTempDir: string | undefined, skillName: string, action: 'overwrite' | 'skip' | 'rename') => this.skillImportService.confirmImport(originalPath, sourceTempDir, skillName, action));
```

---

### Task 5: Wire up in router.ts

**Files:**
- Modify: `src/main/router.ts`

- [ ] **Step 1: Add import**

Add at the top of `src/main/router.ts`, near the other skill imports:

```typescript
import { SkillImportService } from './services/skills/SkillImportService';
```

- [ ] **Step 2: Instantiate and pass to ToolController**

In the constructor, after the `this.pathManager = pathManager;` line, add:

```typescript
const skillImportService = new SkillImportService(pathManager.getGlobalSkillsDir());
```

Then update the `ToolController` instantiation to pass the new service:

```typescript
this.toolController = new ToolController(this.skillRegistry, this.toolRegistry, this.mcpManager, this.configManager, this.coreToolManager, skillImportService);
```

---

### Task 6: Update preload.ts and type declarations

**Files:**
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/electron-api.d.ts`

- [ ] **Step 1: Add to preload.ts tools namespace**

In `src/main/preload.ts`, add these two methods inside the `tools: { ... }` block (after `coreToolSetTrustLevel`):

```typescript
importSkill: (filePath: string) => ipcRenderer.invoke('tool:import-skill', filePath),
importSkillConfirm: (originalPath: string, sourceTempDir: string | undefined, skillName: string, action: 'overwrite' | 'skip' | 'rename') => ipcRenderer.invoke('tool:import-skill-confirm', originalPath, sourceTempDir, skillName, action),
```

- [ ] **Step 2: Add to electron-api.d.ts tools interface**

In `src/renderer/electron-api.d.ts`, add these two methods to the `tools` interface (after `coreToolSetTrustLevel`):

```typescript
importSkill: (filePath: string) => Promise<{ status: 'success' | 'conflict' | 'error'; skillName?: string; targetPath?: string; sourceTempDir?: string; error?: string }>;
importSkillConfirm: (originalPath: string, sourceTempDir: string | undefined, skillName: string, action: 'overwrite' | 'skip' | 'rename') => Promise<{ status: 'success' | 'error'; skillName?: string; error?: string }>;
```

---

### Task 7: Add i18n translations

**Files:**
- Modify: `src/common/i18n/locales/zh.json`
- Modify: `src/common/i18n/locales/en.json`

- [ ] **Step 1: Add Chinese translations**

In `src/common/i18n/locales/zh.json`, add these keys inside the `"skillSettings"` object (after the `"actions"` block):

```json
"import": {
    "button": "导入技能",
    "dialogTitle": "选择技能文件夹或压缩包",
    "success": "技能 '{{name}}' 导入成功",
    "conflictTitle": "技能已存在",
    "conflictDesc": "技能 '{{name}}' 已存在，请选择操作：",
    "overwrite": "覆盖",
    "overwriteDesc": "替换已有的技能",
    "skip": "跳过",
    "skipDesc": "保留已有技能，不导入",
    "rename": "重命名",
    "renameDesc": "自动重命名新技能后导入",
    "error": "导入失败",
    "invalidSkill": "不是有效的技能包：未找到 SKILL.md 文件"
}
```

- [ ] **Step 2: Add English translations**

In `src/common/i18n/locales/en.json`, add these keys inside the `"skillSettings"` object (after the `"actions"` block):

```json
"import": {
    "button": "Import Skill",
    "dialogTitle": "Select skill folder or archive",
    "success": "Skill '{{name}}' imported successfully",
    "conflictTitle": "Skill Already Exists",
    "conflictDesc": "Skill '{{name}}' already exists. Choose an action:",
    "overwrite": "Overwrite",
    "overwriteDesc": "Replace the existing skill",
    "skip": "Skip",
    "skipDesc": "Keep existing skill, don't import",
    "rename": "Rename",
    "renameDesc": "Auto-rename the new skill and import",
    "error": "Import failed",
    "invalidSkill": "Not a valid skill package: SKILL.md not found"
}
```

---

### Task 8: Add import UI to SkillSettings

**Files:**
- Modify: `src/renderer/pages/settings/SkillSettings.tsx`

- [ ] **Step 1: Add import-related imports**

Add `Download` to the lucide-react import:

```typescript
import {
    Search, Loader2, Box, Sparkles, Download
} from 'lucide-react';
```

- [ ] **Step 2: Add conflict dialog component**

Add this component before the `SkillSettings` component:

```typescript
interface ConflictDialogProps {
    skillName: string;
    onAction: (action: 'overwrite' | 'skip' | 'rename') => void;
    onCancel: () => void;
}

const ConflictDialog: React.FC<ConflictDialogProps> = ({ skillName, onAction, onCancel }) => {
    const { t } = useTranslation();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-2">
                    {t('skillSettings.import.conflictTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-5">
                    {t('skillSettings.import.conflictDesc', { name: skillName })}
                </p>
                <div className="flex flex-col gap-2">
                    <button
                        onClick={() => onAction('overwrite')}
                        className="w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors text-left"
                    >
                        <span className="font-semibold">{t('skillSettings.import.overwrite')}</span>
                        <span className="block text-[10px] opacity-60 mt-0.5">{t('skillSettings.import.overwriteDesc')}</span>
                    </button>
                    <button
                        onClick={() => onAction('rename')}
                        className="w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-colors text-left"
                    >
                        <span className="font-semibold">{t('skillSettings.import.rename')}</span>
                        <span className="block text-[10px] opacity-60 mt-0.5">{t('skillSettings.import.renameDesc')}</span>
                    </button>
                    <button
                        onClick={() => onAction('skip')}
                        className="w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-left"
                    >
                        <span className="font-semibold">{t('skillSettings.import.skip')}</span>
                        <span className="block text-[10px] opacity-60 mt-0.5">{t('skillSettings.import.skipDesc')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
```

- [ ] **Step 3: Add import state and handler to SkillSettings component**

Add state variables inside the `SkillSettings` component, after the existing `useState` declarations:

```typescript
const [importing, setImporting] = useState(false);
const [conflict, setConflict] = useState<{ skillName: string; targetPath: string; sourceTempDir?: string; originalPath: string } | null>(null);
```

Add the import handler function after `handleToggle`:

```typescript
const handleImport = async () => {
    // Use Electron's open dialog to select file or folder
    const result = await window.electronAPI.system.selectFile();
    // Also support directory — we need a custom dialog for that
    // For now, use selectFile for .zip/.skill and selectDirectory for folders
    // We'll use a combined approach: first try file selection
    handleImportFromPath(result);
};

const handleImportFolder = async () => {
    const result = await window.electronAPI.system.selectDirectory();
    handleImportFromPath(result);
};

const handleImportFromPath = async (selectedPath: string | null) => {
    if (!selectedPath) return;
    setImporting(true);
    try {
        const result = await window.electronAPI.tools.importSkill(selectedPath);
        if (result.status === 'success') {
            setSkills(await window.electronAPI.tools.getSkills());
        } else if (result.status === 'conflict') {
            setConflict({
                skillName: result.skillName!,
                targetPath: result.targetPath!,
                sourceTempDir: result.sourceTempDir,
                originalPath: selectedPath,
            });
        } else {
            // Error handled silently — could add toast later
            console.error('Import error:', result.error);
        }
    } catch (error) {
        console.error('Import failed:', error);
    } finally {
        setImporting(false);
    }
};

const handleConflictAction = async (action: 'overwrite' | 'skip' | 'rename') => {
    if (!conflict) return;
    setImporting(true);
    try {
        const result = await window.electronAPI.tools.importSkillConfirm(
            conflict.originalPath,
            conflict.sourceTempDir,
            conflict.skillName,
            action
        );
        if (result.status === 'success' && action !== 'skip') {
            setSkills(await window.electronAPI.tools.getSkills());
        }
    } catch (error) {
        console.error('Confirm import failed:', error);
    } finally {
        setConflict(null);
        setImporting(false);
    }
};
```

- [ ] **Step 4: Add import button to the header**

In the header section of the JSX, replace the placeholder `<div className="w-20" />` with the import buttons. Find:

```tsx
{/* 占位符给窗口控制按钮 */}
<div className="w-20" />
```

Replace with:

```tsx
{/* 导入技能按钮 */}
<div className="flex items-center gap-1.5">
    <button
        onClick={handleImport}
        disabled={importing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
    >
        {importing ? (
            <Loader2 size={12} className="animate-spin" />
        ) : (
            <Download size={12} />
        )}
        {t('skillSettings.import.button')}
    </button>
    <button
        onClick={handleImportFolder}
        disabled={importing}
        title="Import from folder"
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 text-slate-500 dark:text-gray-500 hover:bg-slate-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
    >
        <Box size={12} />
    </button>
</div>
```

- [ ] **Step 5: Add conflict dialog to JSX**

At the end of the component's return JSX, just before the closing `</div>`, add:

```tsx
{conflict && (
    <ConflictDialog
        skillName={conflict.skillName}
        onAction={handleConflictAction}
        onCancel={() => setConflict(null)}
    />
)}
```

---

### Task 9: Build and verify

- [ ] **Step 1: Run TypeScript check**

Run:
```bash
cd D:/workspace/Geni && npx tsc --noEmit
```
Expected: No errors related to the new files.

- [ ] **Step 2: Build the app**

Run:
```bash
cd D:/workspace/Geni && npm run build
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add skill import with folder/ZIP/.skill support and conflict resolution"
```
