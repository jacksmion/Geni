
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { SkillLoader } from './services/SkillLoader.js'

import { ConfigManager } from './services/ConfigManager.js'

import { Skill } from '../common/types/skill'
import { AppSettings } from '../common/types/settings'

import { ToolRegistry } from './services/tools/ToolRegistry.js'
import { OpenAIAgentService } from './services/agent/OpenAIAgentService.js'
import { PythonExecTool } from './services/tools/builtin/PythonExecTool.js'
import { FileSystemTool } from './services/tools/builtin/FileSystemTool.js'
import { BashTool } from './services/tools/builtin/BashTool.js'
import { FileEditTool } from './services/tools/builtin/FileEditTool.js'
import { FileSearchTool } from './services/tools/builtin/FileSearchTool.js'
import { McpManager } from './services/mcp/McpManager.js'

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
        titleBarOverlay: true,
    })

    // 这里的 path 会根据 vite-plugin-electron 的输出自动调整
    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'))
    }
}

app.whenReady().then(async () => {
    const skillsDir = path.join(__dirname, '../skills')
    const loader = new SkillLoader(skillsDir)
    let skills: Skill[] = await loader.loadSkills()

    ipcMain.handle('get-skills', () => skills)

    ipcMain.handle('toggle-skill', (_, id: string) => {
        skills = skills.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
        return skills
    })

    ipcMain.handle('set-trust-level', (_, id: string, level: 'Ask' | 'Auto') => {
        skills = skills.map(s => s.id === id ? { ...s, trustLevel: level } : s)
        return skills
    })

    // Services Init
    const configManager = new ConfigManager()
    let appSettings = configManager.load()

    // Tools & Agent
    const toolRegistry = new ToolRegistry()
    const mcpManager = new McpManager(toolRegistry) // Pass registry to MCP manager

    // 1. Register Built-in Tools
    toolRegistry.register(new PythonExecTool())
    toolRegistry.register(new FileSystemTool(process.cwd()))
    toolRegistry.register(new BashTool())
    toolRegistry.register(new FileEditTool(process.cwd()))
    toolRegistry.register(new FileSearchTool(process.cwd()))

    // 2. Initialize Agent with current settings
    const agentService = new OpenAIAgentService(appSettings, toolRegistry)

    // IPC: Settings
    ipcMain.handle('get-settings', () => appSettings)
    ipcMain.handle('save-settings', (_, settings: AppSettings) => {
        console.log('[Main] Receiving new settings:', JSON.stringify(settings, null, 2))
        appSettings = { ...appSettings, ...settings }
        configManager.save(appSettings)
        return true
    })

    // IPC: MCP
    ipcMain.handle('mcp-connect', async (_, config: { id: string, command: string, args: string[] }) => {
        try {
            await mcpManager.connectToServer({
                id: config.id,
                command: config.command,
                args: config.args
            })
            return { success: true }
        } catch (e: any) {
            return { success: false, error: e.message }
        }
    })

    ipcMain.handle('mcp-list-tools', () => {
        // Return simple list of tool names/descriptions from registry for UI
        return toolRegistry.getToolDefinitions().map(def => ({
            name: def.name,
            description: def.description
        }))
    })

    // Track active requests for aborting
    const activeControllers = new Map<number, AbortController>();

    ipcMain.handle('abort-request', (event) => {
        const webContentsId = event.sender.id;
        console.log(`[Main] Abort active request for sender ${webContentsId}`);
        const controller = activeControllers.get(webContentsId);
        if (controller) {
            controller.abort();
            activeControllers.delete(webContentsId);
            return true;
        }
        return false;
    });

    // IPC: Chat
    ipcMain.handle('send-message', async (event, text: string) => {
        console.log(`[Main] Agent Request: ${text}`)

        const onStream = (chunk: string) => {
            event.sender.send('reply-stream', chunk);
        }

        const onStepUpdate = (steps: any[]) => {
            event.sender.send('reply-trace', steps);
        }

        // Setup AbortController
        const controller = new AbortController();
        const webContentsId = event.sender.id;
        activeControllers.set(webContentsId, controller);

        try {
            // Get all available tools
            const tools = toolRegistry.getTools();

            // 获取启用的技能
            const enabledSkills = skills.filter(s => s.enabled);

            // Run Agent
            // TODO: In future, select service based on appSettings.llm.provider
            const result = await agentService.run(text, tools, {
                skills: enabledSkills,
                signal: controller.signal // Pass signal
            }, onStream, onStepUpdate);

            activeControllers.delete(webContentsId);
            return result;
        } catch (error: any) {
            activeControllers.delete(webContentsId);
            console.error('[Main] Agent execution failed:', error);

            // If aborted, return a specific message
            if (error.message.includes('aborted')) {
                return { finalAnswer: '[Execution Cancelled by User]', steps: [] };
            }

            return { finalAnswer: `System Error: ${error.message}`, steps: [] }
        }
    })

    createWindow()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// IPC 示例
ipcMain.handle('ping', () => 'pong')
