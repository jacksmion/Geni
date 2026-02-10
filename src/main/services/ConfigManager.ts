import fs from 'fs';
import path from 'path';
import { AppSettings, DEFAULT_SETTINGS } from '../../common/types/settings';
import { PathManager } from './PathManager';

export class ConfigManager {
    private configPath: string;

    constructor(pathManager: PathManager) {
        const configDir = path.dirname(pathManager.getConfigFile());
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        this.configPath = pathManager.getConfigFile();
    }

    public load(): AppSettings {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
            }
        } catch (e) {
            console.error('Failed to load config:', e);
        }
        return DEFAULT_SETTINGS;
    }

    public save(settings: AppSettings): void {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(settings, null, 2));
        } catch (e) {
            console.error('Failed to save config:', e);
        }
    }
}
