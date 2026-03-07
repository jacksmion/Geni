import fs from 'fs';
import path from 'path';
import { AppSettings, DEFAULT_SETTINGS } from '../../common/types/settings';
import { PathManager } from './PathManager';

export class ConfigManager {
    private configPath: string;
    private cachedSettings: AppSettings | null = null;

    constructor(pathManager: PathManager) {
        const configDir = path.dirname(pathManager.getConfigFile());
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        this.configPath = pathManager.getConfigFile();
    }

    public load(): AppSettings {
        if (this.cachedSettings) {
            return this.cachedSettings;
        }

        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const parsed = JSON.parse(data);
                const merged = { ...DEFAULT_SETTINGS, ...parsed };
                
                // 确保嵌套对象也被正确合并（特别是 llm.providers）
                if (parsed.llm && parsed.llm.providers) {
                    merged.llm.providers = { ...DEFAULT_SETTINGS.llm.providers, ...parsed.llm.providers };
                }

                this.cachedSettings = this.migrateConfig(merged as AppSettings);
                return this.cachedSettings;
            }
        } catch (e) {
            console.error('Failed to load config:', e);
        }

        this.cachedSettings = this.migrateConfig(DEFAULT_SETTINGS);
        return this.cachedSettings;
    }

    /**
     * 将旧版的单模型配置迁移到新版的多模型数组格式
     */
    private migrateConfig(settings: AppSettings): AppSettings {
        if (!settings.llm || !settings.llm.providers) return settings;

        let migrated = false;
        for (const [providerId, config] of Object.entries(settings.llm.providers)) {
            // 如果存在旧字段且 models 为空，执行迁移
            if ((config as any).model && (!config.models || config.models.length === 0)) {
                const oldModel = (config as any).model;
                const oldTemp = (config as any).temperature ?? 0.7;
                
                config.models = [
                    {
                        id: oldModel,
                        label: oldModel,
                        model: oldModel,
                        temperature: oldTemp,
                        enabled: true
                    }
                ];
                config.activeModelId = oldModel;
                migrated = true;
                console.log(`[ConfigManager] Migrated provider ${providerId} to multi-model format.`);
            }
        }

        if (migrated) {
            // 异步保存迁移后的结果
            setTimeout(() => this.save(settings), 500);
        }
        return settings;
    }

    public save(settings: AppSettings): void {
        this.cachedSettings = settings;
        try {
            // 异步落盘，消除 UI 点击发送后的主线程阻塞
            fs.promises.writeFile(this.configPath, JSON.stringify(settings, null, 2))
                .catch(e => console.error('Failed to save config async:', e));
        } catch (e) {
            console.error('Failed to trigger save config:', e);
        }
    }
}
