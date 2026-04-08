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

    /** 启动时全量加载 */
    private loadAll(): void {
        try {
            const files = fs.readdirSync(this.staffDir)
                .filter(f => f.endsWith('.json'));

            for (const file of files) {
                try {
                    const data = fs.readFileSync(path.join(this.staffDir, file), 'utf-8');
                    const profile = JSON.parse(data) as StaffProfile;
                    if (profile.id) {
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
    public create(input: Partial<StaffProfile> & { name: string; persona: string }): StaffProfile {
        const id = randomUUID();
        const now = Date.now();
        const profile: StaffProfile = {
            id,
            name: input.name,
            modelId: input.provider && input.model
                ? `${input.provider}/${input.model}`
                : 'openai/gpt-4o',
            systemPrompt: input.persona,
            avatar: input.avatar,
            description: input.description,
            status: 'idle',
            persona: input.persona,
            provider: input.provider,
            model: input.model,
            temperature: input.temperature,
            skillIds: input.skillIds || [],
            allowedMcpServerIds: input.allowedMcpServerIds,
            memoryFile: path.join(this.pathManager.getRootDir(), 'memory', `staff_${id}.md`),
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

        // 禁止修改 id/createdAt
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
