import { ipcMain, dialog, shell, app, nativeTheme, BrowserWindow, WebContents } from 'electron';
import fs from 'fs';
import path from 'path';
import { SYSTEM_CHANNELS, SYSTEM_EVENTS } from '../../common/ipc/channels';
import { ConfigManager } from '../services/ConfigManager';
import { PathManager } from '../services/PathManager';
import { UsageManager } from '../services/usage/UsageManager';
import { AppSettings } from '../../common/types/settings';
import { OpenAI } from 'openai';

const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const PDF_EXTENSIONS = new Set(['.pdf']);
const PREVIEW_PROTOCOL_SCHEME = 'geni-preview';

interface ArtifactPreviewResult {
    kind: 'html' | 'pdf';
    path: string;
    previewUrl: string;
    content?: string;
}

export class SystemController {
    private pathManager: PathManager;
    private imServiceManager?: any; // To avoid circular/early load issues in some environments
    private onSettingsChanged?: (settings: AppSettings) => Promise<void> | void;
    private activeWebContents: WebContents | null = null;
    private coreToolManager?: any;
    private previewAllowedDirectories = new Set<string>();

    constructor(
        private configManager: ConfigManager,
        pathManager: PathManager,
        private usageManager: UsageManager
    ) {
        this.pathManager = pathManager;
    }

    public setIMServiceManager(mgr: any) {
        this.imServiceManager = mgr;
    }

    public setCoreToolManager(mgr: any) {
        this.coreToolManager = mgr;
    }

    public setSettingsChangeCallback(callback: (settings: AppSettings) => void) {
        this.onSettingsChanged = callback;
    }

    public registerHandlers() {
        ipcMain.handle(SYSTEM_CHANNELS.GET_SETTINGS, (event) => {
            this.activeWebContents = event.sender;
            return this.configManager.load();
        });
        ipcMain.handle(SYSTEM_CHANNELS.SAVE_SETTINGS, (event, settings) => {
            this.activeWebContents = event.sender;
            return this.handleSaveSettings(settings);
        });
        ipcMain.handle(SYSTEM_CHANNELS.SELECT_DIRECTORY, () => this.handleSelectDirectory());
        ipcMain.handle(SYSTEM_CHANNELS.SELECT_FILE, (_, forAttachment?: boolean) => this.handleSelectFile(forAttachment));
        ipcMain.handle(SYSTEM_CHANNELS.OPEN_EXPLORER, (_, path) => this.handleOpenExplorer(path));
        ipcMain.handle(SYSTEM_CHANNELS.CREATE_ARTIFACT_PREVIEW, (_, filePath: string) => this.handleCreateArtifactPreview(filePath));
        ipcMain.handle(SYSTEM_CHANNELS.TEST_LLM, (_, config) => this.handleTestLLM(config));
        ipcMain.handle(SYSTEM_CHANNELS.FETCH_PROVIDER_MODELS, (_, payload) => this.handleFetchProviderModels(payload));
        ipcMain.handle(SYSTEM_CHANNELS.GET_PATH_INFO, () => this.handleGetPathInfo());
        ipcMain.handle(SYSTEM_CHANNELS.OPEN_USER_SKILLS, () => this.handleOpenUserSkills());
        ipcMain.handle(SYSTEM_CHANNELS.TEST_TELEGRAM, (_, config) => this.handleTestTelegram(config));
        ipcMain.handle(SYSTEM_CHANNELS.TEST_WECOM, (_, config) => this.handleTestWeCom(config));
        ipcMain.handle(SYSTEM_CHANNELS.TEST_LARK, (_, config) => this.handleTestLark(config));
        ipcMain.handle(SYSTEM_CHANNELS.TEST_WECHAT, () => this.handleTestWechat());
        ipcMain.handle(SYSTEM_CHANNELS.READ_FILE_BASE64, (_, path) => this.handleReadFileBase64(path));
        ipcMain.handle(SYSTEM_CHANNELS.READ_TEXT_FILE, (_, path: string) => this.handleReadTextFile(path));
        ipcMain.handle(SYSTEM_CHANNELS.ADD_ALLOWED_PATH, (_, filePath: string) => this.handleAddAllowedPath(filePath));
        ipcMain.handle(SYSTEM_CHANNELS.GET_USAGE_STATS, () => this.usageManager.getStats());
        ipcMain.handle(SYSTEM_CHANNELS.READ_PROFILE_FILE, (_, name: string) => this.handleReadProfileFile(name));
        ipcMain.handle(SYSTEM_CHANNELS.WRITE_PROFILE_FILE, (_, name: string, content: string) => this.handleWriteProfileFile(name, content));
    }

    public broadcastSettingsChanged(settings: AppSettings) {
        if (this.activeWebContents && !this.activeWebContents.isDestroyed()) {
            this.activeWebContents.send(SYSTEM_EVENTS.SETTINGS_CHANGED, settings);
        } else {
            // Fallback: broadcast to all windows if no active one recorded
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send(SYSTEM_EVENTS.SETTINGS_CHANGED, settings);
                }
            });
        }
    }

    private async handleFetchProviderModels(payload: { providerId: string, config: { apiKey: string, baseUrl: string } }) {
        const { providerId, config } = payload;
        try {
            console.log(`[SystemController] Fetching models for ${providerId}...`);
            // Dynamic import to avoid circular dependency or early loading issues if factory is complex
            const { createChatModel } = await import('../services/llm');

            const model = createChatModel(providerId, {
                apiKey: config.apiKey,
                baseUrl: config.baseUrl,
                model: 'detect' // Special flag or just dummy since we only call fetchModels
            });

            if (model.fetchModels) {
                return await model.fetchModels();
            }
            return [];
        } catch (error: any) {
            console.error(`[SystemController] Failed to fetch models:`, error);
            throw error;
        }
    }

    private async handleSaveSettings(settings: AppSettings) {
        console.log('[SystemController] Saving settings... (Sensitive fields redacted)');

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
                        color: isDark ? '#141414' : '#ffffff',
                        symbolColor: isDark ? '#a1a1aa' : '#71717a'
                    });
                } catch (e) {
                    // Ignore on non-Windows/Mac platforms
                }
            }
        }

        // Notify listeners (e.g. AgentController to update runtime options, ToolController to reconnect MCP)
        if (this.onSettingsChanged) {
            await this.onSettingsChanged(newSettings);
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

    private async handleSelectFile(forAttachment?: boolean) {
        const filters = forAttachment
            ? [{ name: 'All Files', extensions: ['*'] }]
            : [
                { name: 'Skill Packages', extensions: ['skill', 'zip'] },
                { name: 'All Files', extensions: ['*'] }
            ];
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters
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

    public getPreviewProtocolScheme(): string {
        return PREVIEW_PROTOCOL_SCHEME;
    }

    public async resolvePreviewResource(urlString: string): Promise<{ status: number; body?: Buffer; mimeType?: string }> {
        try {
            const url = new URL(urlString);
            const filePath = this.decodePreviewUrlPath(url);
            if (!filePath || !this.isPathPreviewAllowed(filePath)) {
                return { status: 403 };
            }

            const stat = await fs.promises.stat(filePath);
            if (!stat.isFile()) {
                return { status: 404 };
            }

            const body = await fs.promises.readFile(filePath);
            return {
                status: 200,
                body,
                mimeType: this.getMimeType(filePath)
            };
        } catch (error) {
            console.error('[SystemController] Failed to resolve preview resource:', error);
            return { status: 404 };
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
                return { success: true, message: 'modelSettings.testSuccessList' };
            } catch (e: any) {
                console.warn('[SystemController] Model list failed, trying completion:', e.message);

                await client.chat.completions.create({
                    model: config.model || 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 1
                });
                return { success: true, message: 'modelSettings.testSuccessChat' };
            }

        } catch (error: any) {
            console.error('[SystemController] LLM Test Failed:', error);
            return { success: false, message: error.message || 'modelSettings.testFailed' };
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

    private async handleTestTelegram(config: any) {
        if (!this.imServiceManager) {
            return { success: false, message: 'IM Service not initialized' };
        }
        return await this.imServiceManager.testConnection('telegram', config);
    }

    private async handleTestWeCom(config: any) {
        if (!this.imServiceManager) {
            return { success: false, message: 'IM Service not initialized' };
        }
        return await this.imServiceManager.testConnection('wecom', config);
    }

    private async handleTestLark(config: any) {
        if (!this.imServiceManager) {
            return { success: false, message: 'IM Service not initialized' };
        }
        return await this.imServiceManager.testConnection('lark', config);
    }

    private async handleTestWechat() {
        if (!this.imServiceManager) {
            return { success: false, message: 'IM Service not initialized' };
        }
        // Config is empty since it just needs to start the login process without saving
        return await this.imServiceManager.testConnection('wechat', {});
    }

    private async handleReadFileBase64(filePath: string) {
        try {
            const buffer = await fs.promises.readFile(filePath);
            return buffer.toString('base64');
        } catch (error: any) {
            console.error(`[SystemController] Failed to read file ${filePath}:`, error);
            throw error;
        }
    }

    private async handleReadTextFile(filePath: string): Promise<{ content: string; path: string } | null> {
        try {
            const stat = await fs.promises.stat(filePath);
            if (stat.size > 5 * 1024 * 1024) return null; // skip files > 5MB
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return { content, path: filePath };
        } catch {
            return null;
        }
    }

    private async handleCreateArtifactPreview(filePath: string): Promise<ArtifactPreviewResult | null> {
        const normalizedPath = path.resolve(filePath);
        const ext = path.extname(normalizedPath).toLowerCase();
        const isHtml = HTML_EXTENSIONS.has(ext);
        const isPdf = PDF_EXTENSIONS.has(ext);

        if (!isHtml && !isPdf) {
            return null;
        }
        if (!this.isPathPreviewAllowed(normalizedPath)) {
            return null;
        }

        if (isPdf) {
            try {
                const stat = await fs.promises.stat(normalizedPath);
                if (!stat.isFile()) return null;
            } catch {
                return null;
            }

            return {
                kind: 'pdf',
                path: normalizedPath,
                previewUrl: this.buildPreviewUrl(normalizedPath)
            };
        }

        return {
            kind: 'html',
            path: normalizedPath,
            content: (await this.handleReadTextFile(normalizedPath))?.content,
            previewUrl: this.buildPreviewUrl(normalizedPath)
        };
    }

    private handleAddAllowedPath(filePath: string): void {
        this.previewAllowedDirectories.add(path.dirname(path.resolve(filePath)));
        if (this.coreToolManager) {
            this.coreToolManager.addAllowedPath(filePath);
        }
    }

    private buildPreviewUrl(filePath: string): string {
        const normalizedPath = path.resolve(filePath).replace(/\\/g, '/');
        const encodedPath = normalizedPath
            .split('/')
            .filter(Boolean)
            .map(segment => encodeURIComponent(segment))
            .join('/');
        return `${PREVIEW_PROTOCOL_SCHEME}://file/${encodedPath}`;
    }

    private decodePreviewUrlPath(url: URL): string | null {
        if (url.protocol !== `${PREVIEW_PROTOCOL_SCHEME}:`) {
            return null;
        }
        const decodedPath = decodeURIComponent(url.pathname);
        if (!decodedPath) {
            return null;
        }
        const normalized = /^\/[A-Za-z]:/.test(decodedPath)
            ? decodedPath.slice(1)
            : decodedPath;
        return path.normalize(normalized);
    }

    private isPathPreviewAllowed(targetPath: string): boolean {
        const resolvedTarget = path.resolve(targetPath);
        const settings = this.configManager.load();
        const workspacePath = path.resolve(settings.workspacePath || process.cwd());
        const allowedRoots = [
            workspacePath,
            ...this.pathManager.getSkillsLoadPaths(workspacePath).map(p => path.resolve(p)),
            ...Array.from(this.previewAllowedDirectories),
        ];

        return allowedRoots.some(root => this.isWithinRoot(resolvedTarget, root));
    }

    private isWithinRoot(targetPath: string, rootPath: string): boolean {
        const resolvedRoot = path.resolve(rootPath);
        const relative = path.relative(resolvedRoot, targetPath);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }

    private getMimeType(filePath: string): string {
        switch (path.extname(filePath).toLowerCase()) {
            case '.html':
            case '.htm':
                return 'text/html; charset=utf-8';
            case '.css':
                return 'text/css; charset=utf-8';
            case '.js':
            case '.mjs':
                return 'text/javascript; charset=utf-8';
            case '.json':
                return 'application/json; charset=utf-8';
            case '.svg':
                return 'image/svg+xml';
            case '.pdf':
                return 'application/pdf';
            case '.png':
                return 'image/png';
            case '.jpg':
            case '.jpeg':
                return 'image/jpeg';
            case '.gif':
                return 'image/gif';
            case '.webp':
                return 'image/webp';
            default:
                return 'application/octet-stream';
        }
    }

    /**
     * Read a profile file (IDENTITY.md, SOUL.md, USER.md)
     * Returns empty string if file doesn't exist
     */
    private async handleReadProfileFile(name: string): Promise<string> {
        const allowedNames = ['IDENTITY', 'SOUL', 'USER'];
        const normalizedName = name.toUpperCase();
        if (!allowedNames.includes(normalizedName)) {
            throw new Error(`Invalid profile file name: ${name}`);
        }

        const filePath = this.pathManager.getProfileFile(normalizedName);
        try {
            if (!fs.existsSync(filePath)) {
                return '';
            }
            return await fs.promises.readFile(filePath, 'utf-8');
        } catch (error: any) {
            console.error(`[SystemController] Failed to read profile file ${name}:`, error);
            throw error;
        }
    }

    /**
     * Write a profile file (IDENTITY.md, SOUL.md, USER.md)
     */
    private async handleWriteProfileFile(name: string, content: string): Promise<void> {
        const allowedNames = ['IDENTITY', 'SOUL', 'USER'];
        const normalizedName = name.toUpperCase();
        if (!allowedNames.includes(normalizedName)) {
            throw new Error(`Invalid profile file name: ${name}`);
        }

        const filePath = this.pathManager.getProfileFile(normalizedName);
        try {
            await fs.promises.writeFile(filePath, content, 'utf-8');
        } catch (error: any) {
            console.error(`[SystemController] Failed to write profile file ${name}:`, error);
            throw error;
        }
    }
}
