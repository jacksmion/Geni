import { ipcMain, dialog, shell, app, nativeTheme, BrowserWindow } from 'electron';
import { SYSTEM_CHANNELS } from '../../common/ipc/channels';
import { ConfigManager } from '../services/ConfigManager';
import { PathManager } from '../services/PathManager';
import { AppSettings } from '../../common/types/settings';
import { OpenAI } from 'openai';

export class SystemController {
    private onSettingsChanged?: (settings: AppSettings) => void;
    private pathManager: PathManager;

    constructor(private configManager: ConfigManager, pathManager: PathManager) {
        this.pathManager = pathManager;
    }

    public setSettingsChangeCallback(callback: (settings: AppSettings) => void) {
        this.onSettingsChanged = callback;
    }

    public registerHandlers() {
        ipcMain.handle(SYSTEM_CHANNELS.GET_SETTINGS, () => this.configManager.load());
        ipcMain.handle(SYSTEM_CHANNELS.SAVE_SETTINGS, (_, settings) => this.handleSaveSettings(settings));
        ipcMain.handle(SYSTEM_CHANNELS.SELECT_DIRECTORY, () => this.handleSelectDirectory());
        ipcMain.handle(SYSTEM_CHANNELS.SELECT_FILE, () => this.handleSelectFile());
        ipcMain.handle(SYSTEM_CHANNELS.OPEN_EXPLORER, (_, path) => this.handleOpenExplorer(path));
        ipcMain.handle(SYSTEM_CHANNELS.TEST_LLM, (_, config) => this.handleTestLLM(config));
        ipcMain.handle(SYSTEM_CHANNELS.GET_PATH_INFO, () => this.handleGetPathInfo());
        ipcMain.handle(SYSTEM_CHANNELS.OPEN_USER_SKILLS, () => this.handleOpenUserSkills());
    }

    private async handleSaveSettings(settings: AppSettings) {
        console.log('[SystemController] Saving settings:', JSON.stringify(settings, null, 2));

        // 1. Get old settings to compare if needed (e.g. for MCP reconnects, handled by onSettingsChanged listeners ideally)
        // For now, we just save and notify.
        const currentSettings = this.configManager.load();

        // Merge
        const newSettings = { ...currentSettings, ...settings };
        this.configManager.save(newSettings);

        // Update auto-start setting
        if (settings.autoStart !== undefined) {
            app.setLoginItemSettings({
                openAtLogin: settings.autoStart,
                path: app.getPath('exe'),
            });
        }

        // Sync native theme and titleBarOverlay colors
        if (settings.theme !== undefined) {
            nativeTheme.themeSource = settings.theme as 'system' | 'light' | 'dark';
            const wins = BrowserWindow.getAllWindows();
            if (wins.length > 0) {
                const isDark = settings.theme === 'dark';
                try {
                    wins[0].setTitleBarOverlay({
                        color: isDark ? '#0a0a0c' : '#ffffff',
                        symbolColor: isDark ? '#a1a1aa' : '#71717a'
                    });
                } catch (e) {
                    // Ignore on non-Windows/Mac platforms
                }
            }
        }

        // Notify listeners (e.g. AgentController to update runtime options, ToolController to reconnect MCP)
        if (this.onSettingsChanged) {
            this.onSettingsChanged(newSettings);
        }

        return true;
    }

    private async handleSelectDirectory() {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory']
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    }

    private async handleSelectFile() {
        const result = await dialog.showOpenDialog({
            properties: ['openFile']
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    }

    private async handleOpenExplorer(path: string) {
        if (path) {
            await shell.openPath(path);
        }
    }

    private async handleTestLLM(config: { apiKey: string, baseUrl: string, model: string }) {
        try {
            console.log('[SystemController] Testing LLM Connection:', { ...config, apiKey: '***' });

            const client = new OpenAI({
                apiKey: config.apiKey || 'sk-dummy',
                baseURL: config.baseUrl,
                dangerouslyAllowBrowser: true
            });

            try {
                await client.models.list();
                return { success: true, message: 'Connection successful! (Model list accessible)' };
            } catch (e: any) {
                console.warn('[SystemController] Model list failed, trying completion:', e.message);

                await client.chat.completions.create({
                    model: config.model || 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 1
                });
                return { success: true, message: 'Connection successful! (Chat completion works)' };
            }

        } catch (error: any) {
            console.error('[SystemController] LLM Test Failed:', error);
            return { success: false, message: error.message || 'Connection failed' };
        }
    }

    private handleGetPathInfo() {
        return {
            root: this.pathManager.getRootDir(),
            config: this.pathManager.getConfigFile(),
            sessions: this.pathManager.getSessionsDir(),
            globalSkills: this.pathManager.getGlobalSkillsDir(),
            builtinSkills: this.pathManager.getBuiltinSkillsDir()
        };
    }

    private async handleOpenUserSkills() {
        const globalSkillsDir = this.pathManager.getGlobalSkillsDir();
        await shell.openPath(globalSkillsDir);
    }
}
