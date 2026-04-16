import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { StaffProfile, StaffMeta } from '../../../common/types/staff';

// ---------------------------------------------------------------------------
// Import/Export types
// ---------------------------------------------------------------------------

export interface StaffExportPayload {
    version: 1;
    type: 'staff-profile';
    profile: {
        name: string;
        modelId?: string;
        systemPrompt?: string;
        temperature?: number;
        skillIds?: string[];
        allowedTools?: string[];
        avatar?: string;
        description?: string;
    };
}

export interface StaffImportResult {
    status: 'success' | 'conflict' | 'error';
    conflictName?: string;
    conflictId?: string;
    warnings?: string[];
    error?: string;
}

export interface StaffConfirmResult {
    status: 'success' | 'error';
    error?: string;
}
import { PathManager } from '../PathManager';

/**
 * StaffManager - 数字员工 CRUD + 持久化
 *
 * 存储结构: ~/.geni/staff/{id}.json
 * 员工数量少（通常 <20），无需索引文件，启动时全量加载。
 *
 * Phase 3: 支持新旧字段自动迁移
 */
export class StaffManager {
    private staffDir: string;
    private profiles: Map<string, StaffProfile> = new Map();
    private loaded = false;
    private pendingImports: Map<string, string> = new Map(); // conflictId → json

    constructor(private pathManager: PathManager) {
        this.staffDir = path.join(pathManager.getRootDir(), 'staff');
        if (!fs.existsSync(this.staffDir)) {
            fs.mkdirSync(this.staffDir, { recursive: true });
        }
    }

    /** 确保已加载 */
    private ensureLoaded(): void {
        if (this.loaded) return;
        this.loadAll();
        this.loaded = true;
    }

    /**
     * 字段迁移函数 - 将旧字段格式转换为新格式
     *
     * 迁移映射：
     * - `persona` → `systemPrompt`
     * - `provider` + `model` → `modelId` (格式: '${provider}/${model}')
     * - `memoryFile` → 移除（Runtime 按 agent.id 推导路径）
     * - `allowedMcpServerIds` → `allowedTools` (转换为通配符: ['github'] → ['github/*'])
     */
    private migrate(raw: any): StaffProfile {
        return {
            id: raw.id,
            name: raw.name,
            modelId: raw.modelId ?? (raw.provider && raw.model
                ? `${raw.provider}/${raw.model}`
                : undefined),
            systemPrompt: raw.systemPrompt ?? raw.persona,
            temperature: raw.temperature,
            skillIds: raw.skillIds,
            allowedTools: raw.allowedTools ?? raw.allowedMcpServerIds?.map(
                (id: string) => `${id}/*`
            ),
            avatar: raw.avatar,
            description: raw.description,
            status: raw.status ?? 'idle',
            createdAt: raw.createdAt ?? Date.now(),
            updatedAt: raw.updatedAt ?? Date.now(),
        };
    }

    /** 启动时全量加载 */
    private loadAll(): void {
        try {
            const files = fs.readdirSync(this.staffDir)
                .filter(f => f.endsWith('.json'));

            for (const file of files) {
                try {
                    const data = fs.readFileSync(path.join(this.staffDir, file), 'utf-8');
                    const raw = JSON.parse(data);
                    if (raw.id) {
                        const profile = this.migrate(raw);
                        this.profiles.set(profile.id, profile);
                    }
                } catch (e) {
                    console.warn(`[StaffManager] Skipping corrupted file: ${file}`, e);
                }
            }
            console.log(`[StaffManager] Loaded ${this.profiles.size} staff profiles.`);
        } catch (e) {
            console.error('[StaffManager] Failed to load staff directory:', e);
        }
    }

    /** 获取全部列表 (精简) */
    public list(): StaffMeta[] {
        this.ensureLoaded();
        return Array.from(this.profiles.values()).map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            description: p.description,
            status: p.status,
        }));
    }

    /** 获取完整 Profile */
    public get(id: string): StaffProfile | undefined {
        this.ensureLoaded();
        return this.profiles.get(id);
    }

    /** 创建 */
    public create(input: Partial<StaffProfile> & { name: string }): StaffProfile {
        const id = randomUUID();
        const now = Date.now();
        const profile: StaffProfile = {
            id,
            name: input.name,
            modelId: input.modelId || '',
            systemPrompt: input.systemPrompt,
            temperature: input.temperature,
            skillIds: input.skillIds || [],
            allowedTools: input.allowedTools,
            avatar: input.avatar,
            description: input.description,
            status: 'idle',
            createdAt: now,
            updatedAt: now,
        };

        this.profiles.set(id, profile);
        this.saveToDisk(profile);
        return profile;
    }

    /** 更新 */
    public update(id: string, updates: Partial<StaffProfile>): StaffProfile | undefined {
        this.ensureLoaded();
        const existing = this.profiles.get(id);
        if (!existing) return undefined;

        const { id: _id, createdAt: _ca, ...safeUpdates } = updates;
        Object.assign(existing, safeUpdates, { updatedAt: Date.now() });

        this.saveToDisk(existing);
        return existing;
    }

    /** 删除 */
    public delete(id: string): boolean {
        this.ensureLoaded();
        if (!this.profiles.has(id)) return false;

        this.profiles.delete(id);
        const filePath = path.join(this.staffDir, `${id}.json`);
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
            console.error(`[StaffManager] Failed to delete file for ${id}:`, e);
        }
        return true;
    }

    private saveToDisk(profile: StaffProfile): void {
        const filePath = path.join(this.staffDir, `${profile.id}.json`);
        try {
            fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8');
        } catch (e) {
            console.error(`[StaffManager] Failed to save profile ${profile.id}:`, e);
        }
    }

    // -----------------------------------------------------------------------
    // Import / Export
    // -----------------------------------------------------------------------

    /** 导出为 JSON（不含 id、status、createdAt、updatedAt） */
    public exportToJSON(id: string): { fileName: string; json: string } | null {
        this.ensureLoaded();
        const profile = this.profiles.get(id);
        if (!profile) return null;

        const payload: StaffExportPayload = {
            version: 1,
            type: 'staff-profile',
            profile: {
                name: profile.name,
                modelId: profile.modelId || undefined,
                systemPrompt: profile.systemPrompt,
                temperature: profile.temperature,
                skillIds: profile.skillIds,
                allowedTools: profile.allowedTools,
                avatar: profile.avatar,
                description: profile.description,
            },
        };

        const sanitized = profile.name.replace(/[<>:"/\\|?*\s]/g, '-').replace(/-+/g, '-');
        return {
            fileName: `${sanitized}.geni-staff.json`,
            json: JSON.stringify(payload, null, 2),
        };
    }

    /** 导入校验（不直接写入，返回冲突信息等前端确认） */
    public importFromJSON(jsonStr: string, defaultModelId?: string): StaffImportResult {
        this.ensureLoaded();

        let parsed: any;
        try {
            parsed = JSON.parse(jsonStr);
        } catch {
            return { status: 'error', error: '无效的 JSON 格式' };
        }

        if (parsed.version !== 1 || parsed.type !== 'staff-profile') {
            return { status: 'error', error: '不支持的文件格式，需要 version:1, type:staff-profile' };
        }

        const p = parsed.profile;
        if (!p?.name || typeof p.name !== 'string') {
            return { status: 'error', error: '缺少必填字段 profile.name' };
        }

        // modelId 兜底
        if (!p.modelId && defaultModelId) {
            p.modelId = defaultModelId;
        }

        // 按名称匹配检查冲突
        const existing = Array.from(this.profiles.values())
            .find(prof => prof.name === p.name);

        if (existing) {
            // 缓存 JSON 供后续 confirmImport 使用
            this.pendingImports.set(existing.id, jsonStr);
            return {
                status: 'conflict',
                conflictName: existing.name,
                conflictId: existing.id,
            };
        }

        // 无冲突，直接创建
        this.create({
            name: p.name,
            modelId: p.modelId,
            systemPrompt: p.systemPrompt,
            temperature: p.temperature,
            skillIds: p.skillIds,
            allowedTools: p.allowedTools,
            avatar: p.avatar,
            description: p.description,
        });

        return { status: 'success' };
    }

    /** 确认导入（冲突时调用） */
    public confirmImport(
        action: 'overwrite' | 'rename' | 'skip',
        conflictId?: string,
    ): StaffConfirmResult {
        this.ensureLoaded();

        const jsonStr = conflictId ? this.pendingImports.get(conflictId) : undefined;
        if (conflictId) this.pendingImports.delete(conflictId);

        switch (action) {
            case 'skip':
                return { status: 'success' };
        }

        if (!jsonStr) {
            return { status: 'error', error: '导入数据已过期，请重新导入' };
        }

        let parsed: any;
        try {
            parsed = JSON.parse(jsonStr);
        } catch {
            return { status: 'error', error: '无效的 JSON 格式' };
        }

        const p = parsed.profile;
        if (!p?.name || typeof p.name !== 'string') {
            return { status: 'error', error: '无效的导入数据：缺少 profile.name' };
        }

        switch (action) {

            case 'overwrite': {
                if (!conflictId) return { status: 'error', error: '缺少 conflictId' };
                this.update(conflictId, {
                    name: p.name,
                    modelId: p.modelId,
                    systemPrompt: p.systemPrompt,
                    temperature: p.temperature,
                    skillIds: p.skillIds,
                    allowedTools: p.allowedTools,
                    avatar: p.avatar,
                    description: p.description,
                });
                return { status: 'success' };
            }

            case 'rename': {
                const newName = this.findAvailableName(p.name);
                this.create({
                    name: newName,
                    modelId: p.modelId,
                    systemPrompt: p.systemPrompt,
                    temperature: p.temperature,
                    skillIds: p.skillIds,
                    allowedTools: p.allowedTools,
                    avatar: p.avatar,
                    description: p.description,
                });
                return { status: 'success' };
            }

            default:
                return { status: 'error', error: `未知的操作类型: ${action}` };
        }
    }

    private findAvailableName(baseName: string): string {
        const names = new Set(Array.from(this.profiles.values()).map(p => p.name));
        if (!names.has(baseName)) return baseName;
        let i = 1;
        while (names.has(`${baseName} (${i})`)) i++;
        return `${baseName} (${i})`;
    }
}
