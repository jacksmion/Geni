import fs from 'fs';
import path from 'path';
import os from 'os';
import { AppSettings, DEFAULT_SETTINGS } from '../../common/types/settings';

export class ConfigManager {
    private configPath: string;

    constructor() {
        const userDataDir = path.join(os.homedir(), '.assistant-core');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }
        this.configPath = path.join(userDataDir, 'config.json');
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
