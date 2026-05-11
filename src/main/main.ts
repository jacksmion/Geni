
import { app, BrowserWindow, nativeTheme, protocol } from 'electron';
import path from 'path'
import { fileURLToPath } from 'url'
import log from 'electron-log/main';

// Services
import { PathManager } from './services/PathManager.js'
import { ConfigManager } from './services/ConfigManager.js'
import { ToolRegistry } from './services/tools/ToolRegistry.js'
import { SkillRegistry } from './services/skills/core/SkillRegistry.js'
import { McpManager } from './services/tools/mcp/McpManager.js'
import { AppRouter } from './router.js'
import { SystemTrayManager } from './services/SystemTrayManager.js'

// Tools
import { CoreToolManager } from './services/tools/core/CoreToolManager.js'
import { MemoryStore } from './services/memory/MemoryStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PREVIEW_PROTOCOL_SCHEME = 'geni-preview';

protocol.registerSchemesAsPrivileged([{
    scheme: PREVIEW_PROTOCOL_SCHEME,
    privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
    }
}]);

// Fix: Packaged Electron exe auto-applies Windows system proxy via Chromium/WinHTTP,
// causing LLM API requests to fail with auth errors. Disable proxy in production only.
if (app.isPackaged) {
    app.commandLine.appendSwitch('no-proxy-server');
}

let isQuitting = false;

function createWindow(isDark: boolean) {
    const preloadPath = path.join(__dirname, 'preload.js')
    console.log('[Main] Preload path:', preloadPath)

    const win = new BrowserWindow({
        width: 950,
        height: 640,
        minWidth: 860,
        minHeight: 600,
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // 禁用沙箱以避免权限问题，确保 preload 正确加载
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: isDark ? '#141414' : '#ffffff',
            symbolColor: isDark ? '#a1a1aa' : '#71717a',
            height: 40 // h-10 = 40px, synced with current chat header height
        },
    })

    // 这里的 path 会根据 vite-plugin-electron 的输出自动调整
    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    win.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            win.hide();
        }
        return false;
    });

    return win;
}

app.whenReady().then(async () => {
    // 0. PathManager (must be first, after app.whenReady())
    const pathManager = new PathManager();

    // Initialize electron-log (after PathManager so we can use its paths)
    log.transports.file.resolvePathFn = () => path.join(pathManager.getLogsDir(), 'main.log');
    log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
    if (app.isPackaged) log.transports.console.level = false; // no terminal output in production
    log.initialize({ preload: false }); // only main process
    Object.assign(console, log.functions); // redirect console.* to electron-log

    // 1. Initialize Config (with PathManager)
    const configManager = new ConfigManager(pathManager);
    const appSettings = configManager.load();

    // Ensure workspace path
    if (!appSettings.workspacePath) {
        appSettings.workspacePath = process.cwd();
        // Optionally save back?
        // configManager.save(appSettings);
    }
    const workspacePath = appSettings.workspacePath;

    // Apply autoStart on initialization to ensure consistency with the OS register
    if (appSettings.autoStart !== undefined) {
        app.setLoginItemSettings({
            openAtLogin: appSettings.autoStart,
            path: app.getPath('exe'),
        });
    }

    // Apply init theme
    const isDark = appSettings.theme === 'dark';
    if (appSettings.theme) {
        nativeTheme.themeSource = appSettings.theme as 'system' | 'light' | 'dark';
    }

    // 2. Initialize Registries
    const toolRegistry = new ToolRegistry();
    const skillRegistry = new SkillRegistry();

    // 3. Load Skills (from multiple paths in priority order)
    // Load order: builtin → global → project (later sources override earlier ones)

    // Check which skills directories exist before loading
    const skillsInfo = pathManager.getSkillsLoadInfo(workspacePath);
    console.log('[Main] Skills directories status:', skillsInfo);
    const skillsToLoad: Array<{ path: string; source: 'builtin' | 'global' | 'project' | 'dotAgents' }> = [];

    // Built-in skills (should always exist)
    if (skillsInfo.builtin.exists) {
        skillsToLoad.push({ path: skillsInfo.builtin.path, source: 'builtin' });
        console.log('[Main] Will load built-in skills from:', skillsInfo.builtin.path);
    } else {
        console.warn('[Main] Built-in skills directory not found:', skillsInfo.builtin.path);
    }

    // Global skills (may not exist for new installations)
    if (skillsInfo.global.exists) {
        skillsToLoad.push({ path: skillsInfo.global.path, source: 'global' });
        console.log('[Main] Will load global skills from:', skillsInfo.global.path);
    } else {
        console.log('[Main] Global skills directory not found, skipping:', skillsInfo.global.path);
    }

    // dotAgents skills (~/.agents/skills)
    if (skillsInfo.dotAgents.exists) {
        skillsToLoad.push({ path: skillsInfo.dotAgents.path, source: 'dotAgents' });
        console.log('[Main] Will load dotAgents skills from:', skillsInfo.dotAgents.path);
    } else {
        console.log('[Main] dotAgents skills directory not found, skipping:', skillsInfo.dotAgents.path);
    }

    // Project skills (may not exist for projects without custom skills)
    if (skillsInfo.project.exists) {
        skillsToLoad.push({ path: skillsInfo.project.path, source: 'project' });
        console.log('[Main] Will load project skills from:', skillsInfo.project.path);
    } else {
        console.log('[Main] Project skills directory not found, skipping:', skillsInfo.project.path);
    }

    // Load skills from existing directories only (Non-blocking)
    skillRegistry.loadFromDirectories(skillsToLoad).then(() => {
        console.log(`[Main] Loaded ${skillRegistry.getAll().length} skills`);
    }).catch(e => {
        console.error('[Main] Error loading skills:', e);
    });

    // 4. Register Built-in Tools
    const memoryStore = new MemoryStore(pathManager.getMemoryFile());
    const coreToolManager = new CoreToolManager(toolRegistry, configManager, skillRegistry, workspacePath, pathManager, memoryStore);
    coreToolManager.initialize();

    // 5. Initialize Services
    const mcpManager = new McpManager(toolRegistry);

    // Auto-connect MCPs
    if (appSettings.mcpServers) {
        for (const server of appSettings.mcpServers) {
            if (server.enabled) {
                mcpManager.connectToServer(server).catch(e => {
                    console.error(`[Main] Failed to auto-connect MCP server ${server.id}:`, e);
                });
            }
        }
    }

    // 6. Initialize AppRouter (DI Container & IPC, with PathManager)
    const appRouter = new AppRouter(configManager, toolRegistry, skillRegistry, mcpManager, coreToolManager, pathManager, memoryStore);
    appRouter.initialize();

    protocol.handle(PREVIEW_PROTOCOL_SCHEME, async (request) => {
        const previewResource = await appRouter.getSystemController().resolvePreviewResource(request.url);
        const responseBody = previewResource.body ? new Uint8Array(previewResource.body) : undefined;
        return new Response(responseBody, {
            status: previewResource.status,
            headers: previewResource.mimeType ? { 'content-type': previewResource.mimeType } : undefined
        });
    });

    const win = createWindow(isDark);

    // 7. Initialize Tray
    const trayManager = new SystemTrayManager(win, appSettings.language || 'zh');
    trayManager.initialize();

    // Link tray to router for dynamic updates (like language change)
    appRouter.setTrayManager(trayManager);
})

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
