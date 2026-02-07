
import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

// Services
import { ConfigManager } from './services/ConfigManager.js'
import { ToolRegistry } from './services/tools/ToolRegistry.js'
import { SkillRegistry } from './services/skills/core/SkillRegistry.js'
import { McpManager } from './services/tools/mcp/McpManager.js'
import { AppRouter } from './router.js'

// Tools
import { FileSystemTool } from './services/tools/core/FileSystemTool.js'
import { BashTool } from './services/tools/core/BashTool.js'
import { FileEditTool } from './services/tools/core/FileEditTool.js'
import { FileSearchTool } from './services/tools/core/FileSearchTool.js'
import { EnvironmentInfoTool } from './services/tools/core/EnvironmentInfoTool.js'
import { SkillReaderTool } from './services/tools/core/SkillReaderTool.js'
import { CreatePlanTool, UpdateTaskStatusTool, ReadPlanTool } from './services/tools/core/planning/PlanningTools.js'

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
            color: '#ffffff', // HEADER_BG (Light) - 适配浅色模式，深色模式下可能需要通过 IPC 更新
            symbolColor: '#71717a', // Slate-500
            height: 56 // h-14
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
    // 1. Initialize Config
    const configManager = new ConfigManager();
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

    // 3. Load Skills
    const skillsDir = path.join(__dirname, '../skills');
    // Ensure skills dir exists or handle error? SkillRegistry.loadFromDirectory handles errors gracefully.
    await skillRegistry.loadFromDirectory(skillsDir);
    console.log(`[Main] Loaded ${skillRegistry.getAll().length} skills from ${skillsDir}`);

    // 4. Register Built-in Tools
    // File Tools
    const fsTool = new FileSystemTool(workspacePath); // Use const to allow cleanup if needed
    toolRegistry.register(fsTool);
    toolRegistry.register(new BashTool(workspacePath));
    toolRegistry.register(new FileEditTool(workspacePath));
    toolRegistry.register(new FileSearchTool(workspacePath));
    toolRegistry.register(new EnvironmentInfoTool(workspacePath));

    // Planning Tools (New)
    toolRegistry.register(new CreatePlanTool(workspacePath));
    toolRegistry.register(new UpdateTaskStatusTool(workspacePath));
    toolRegistry.register(new ReadPlanTool(workspacePath));

    // Register SkillReaderTool (with dependencies)
    toolRegistry.register(new SkillReaderTool(skillRegistry, configManager));

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

    // 6. Initialize AppRouter (DI Container & IPC)
    const appRouter = new AppRouter(configManager, toolRegistry, skillRegistry, mcpManager);
    appRouter.initialize();

    createWindow();
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
