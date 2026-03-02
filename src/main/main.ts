
import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

// Services
import { PathManager } from './services/PathManager.js'
import { ConfigManager } from './services/ConfigManager.js'
import { ToolRegistry } from './services/tools/ToolRegistry.js'
import { SkillRegistry } from './services/skills/core/SkillRegistry.js'
import { McpManager } from './services/tools/mcp/McpManager.js'
import { AppRouter } from './router.js'

// Tools
import { CoreToolManager } from './services/tools/core/CoreToolManager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.js')
    console.log('[Main] Preload path:', preloadPath)

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // 禁用沙箱以避免权限问题，确保 preload 正确加载
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#ffffff',
            symbolColor: '#71717a',
            height: 44 // h-11 = 44px, synced with header height
        },
    })

    // 这里的 path 会根据 vite-plugin-electron 的输出自动调整
    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'))
    }
}

app.whenReady().then(async () => {
    // 0. PathManager (must be first, after app.whenReady())
    const pathManager = new PathManager();

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

    // Load skills from existing directories only
    await skillRegistry.loadFromDirectories(skillsToLoad);
    console.log(`[Main] Loaded ${skillRegistry.getAll().length} skills`);

    // 4. Register Built-in Tools
    const coreToolManager = new CoreToolManager(toolRegistry, configManager, skillRegistry, workspacePath, pathManager);
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
    const appRouter = new AppRouter(configManager, toolRegistry, skillRegistry, mcpManager, coreToolManager, pathManager);
    appRouter.initialize();

    createWindow();
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
