import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { StaffProfile, StaffMeta } from '../../../common/types/staff';
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
}
