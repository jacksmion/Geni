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
                this.cachedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
                return this.cachedSettings as AppSettings;
            }
        } catch (e) {
            console.error('Failed to load config:', e);
        }

        this.cachedSettings = DEFAULT_SETTINGS;
        return this.cachedSettings as AppSettings;
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
