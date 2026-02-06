
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
// Skill System (Legacy - to be refactored in Phase 3)
import { LegacySkillLoader as SkillLoader } from './services/skills/core/LegacySkillLoader.js'

// Core Services
import { ConfigManager } from './services/ConfigManager.js'

// Types
import { Skill } from '../common/types/skill'
import { AppSettings } from '../common/types/settings'

// Tool System
import { ToolRegistry } from './services/tools/ToolRegistry.js'
import { FileSystemTool } from './services/tools/core/FileSystemTool.js'
import { BashTool } from './services/tools/core/BashTool.js'
import { FileEditTool } from './services/tools/core/FileEditTool.js'
import { FileSearchTool } from './services/tools/core/FileSearchTool.js'
import { SkillReaderTool } from './services/tools/core/SkillReaderTool.js'
import { EnvironmentInfoTool } from './services/tools/core/EnvironmentInfoTool.js'

// Agent Runtime
import { AgentRuntime } from './services/agent/AgentRuntime.js'

// MCP Integration
import { McpManager } from './services/tools/mcp/McpManager.js'

// Storage
import { ChatHistoryManager } from './services/storage/ChatHistoryManager.js'
import { AppRouter } from './router.js'

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
            color: '#ffffff', // HEADER_BG (Light) - 适配浅色模式，深色模式下可能需要通过 IPC 更新 (Electron 29+ 支持 setOverlayIconColor 已有改善，这里先设默认)
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
    const skillsDir = path.join(__dirname, '../skills')
    const loader = new SkillLoader(skillsDir)
    let skills: Skill[] = await loader.loadSkills()

    // Services Init
    const configManager = new ConfigManager()
    let appSettings = configManager.load()

    // 初始化工作目录
    if (!appSettings.workspacePath) {
        appSettings.workspacePath = process.cwd()
    }

    // 从配置中恢复技能状态
    const savedSkillSettings = appSettings.skillSettings || {}
    skills = skills.map(s => {
        const saved = savedSkillSettings[s.id]
        if (saved) {
            return { ...s, enabled: saved.enabled, trustLevel: saved.trustLevel }
        }
        return s
    })

    ipcMain.handle('get-skills', () => skills)

    // Tools & Agent
    const toolRegistry = new ToolRegistry()
    const mcpManager = new McpManager(toolRegistry)

    // 1. Register Built-in Tools
    const fsTool = new FileSystemTool(appSettings.workspacePath);
    const editTool = new FileEditTool(appSettings.workspacePath);
    const searchTool = new FileSearchTool(appSettings.workspacePath);
    const bashTool = new BashTool(appSettings.workspacePath);
    const envTool = new EnvironmentInfoTool(appSettings.workspacePath);
    const fileTools = [fsTool, editTool, searchTool, bashTool];

    toolRegistry.register(fsTool)
    toolRegistry.register(bashTool)
    toolRegistry.register(editTool)
    toolRegistry.register(searchTool)
    toolRegistry.register(envTool)

    // 2. Register SkillReaderTool (渐进式技能加载)
    const skillReaderTool = new SkillReaderTool()
    skillReaderTool.setSkills(skills)
    toolRegistry.register(skillReaderTool)

    // 3. Initialize Agent
    const agentService = new AgentRuntime(appSettings, toolRegistry) // Legacy instance (keep for now if needed by old IPC)

    // Phase 5: Initialize AppRouter
    const appRouter = new AppRouter(appSettings, toolRegistry);
    appRouter.initialize();


    // 4. Initialize MCP from Settings
    const initMcpServers = async () => {
        if (appSettings.mcpServers) {
            for (const server of appSettings.mcpServers) {
                if (server.enabled) {
                    try {
                        await mcpManager.connectToServer({
                            id: server.id,
                            type: server.type,
                            command: server.command,
                            args: server.args,
                            url: server.url,
                            apiKey: server.apiKey,
                            env: server.env
                        });
                    } catch (e) {
                        console.error(`[Main] Failed to auto-connect MCP server ${server.id}:`, e);
                    }
                }
            }
        }
    };
    initMcpServers(); // Initial Load

    // 辅助函数：保存技能状态到配置
    const saveSkillSettings = () => {
        const skillSettings: Record<string, { enabled: boolean; trustLevel: 'Ask' | 'Auto' }> = {}
        skills.forEach(s => {
            skillSettings[s.id] = { enabled: s.enabled, trustLevel: s.trustLevel }
        })
        appSettings = { ...appSettings, skillSettings }
        configManager.save(appSettings)
    }

    // IPC: Skills
    ipcMain.handle('toggle-skill', (_, id: string) => {
        skills = skills.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
        skillReaderTool.setSkills(skills)
        saveSkillSettings()
        return skills
    })

    ipcMain.handle('set-trust-level', (_, id: string, level: 'Ask' | 'Auto') => {
        skills = skills.map(s => s.id === id ? { ...s, trustLevel: level } : s)
        skillReaderTool.setSkills(skills)
        saveSkillSettings()
        return skills
    })

    // IPC: Settings
    ipcMain.handle('get-settings', () => appSettings)
    ipcMain.handle('save-settings', async (_, settings: AppSettings) => {
        console.log('[Main] Receiving new settings:', JSON.stringify(settings, null, 2))

        // Check if workspacePath changed
        if (settings.workspacePath && settings.workspacePath !== appSettings.workspacePath) {
            console.log(`[Main] Workspace path changed to: ${settings.workspacePath}`);
            fileTools.forEach(tool => tool.setRoot(settings.workspacePath));
        }

        // Handle MCP Server Changes (Simple Approach: Disconnect All -> Reconnect Enabled)
        // Optimization: In a real app, diff changes. For now, full safety reset is easier implies cleanliness.
        if (settings.mcpServers && JSON.stringify(settings.mcpServers) !== JSON.stringify(appSettings.mcpServers)) {
            console.log('[Main] MCP Config changed, reloading connections...');
            await mcpManager.disconnectAll();

            for (const server of settings.mcpServers) {
                if (server.enabled) {
                    try {
                        await mcpManager.connectToServer({
                            id: server.id,
                            type: server.type,
                            command: server.command,
                            args: server.args,
                            url: server.url,
                            apiKey: server.apiKey,
                            env: server.env
                        });
                    } catch (e) {
                        console.error(`[Main] Failed to reconnect MCP server ${server.id}:`, e);
                    }
                }
            }
        }

        appSettings = { ...appSettings, ...settings }
        agentService.updateSettings(appSettings)
        configManager.save(appSettings)
        return true
    })

    // IPC: MCP
    ipcMain.handle('mcp-connect', async (_, config: any) => {
        try {
            await mcpManager.connectToServer(config)
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

    ipcMain.handle('select-directory', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory']
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    ipcMain.handle('select-file', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile']
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    ipcMain.handle('open-explorer', async (_, path: string) => {
        if (path) {
            shell.openPath(path);
        }
    });

    // IPC: Chat
    ipcMain.handle('send-message', async (event, text: string, history?: any[]) => {
        // ... (existing implementation)
        console.log(`[Main] Agent Request: ${text}, History Rounds: ${history?.length || 0}`)

        const onStream = (chunk: string, reset?: boolean) => {
            event.sender.send('reply-stream', chunk, reset);
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
            const result = await agentService.run(text, tools, {
                skills: enabledSkills,
                history: history, // Pass history here!
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

    // IPC: LLM Test Connection
    ipcMain.handle('llm-test-connection', async (_, config: { apiKey: string, baseUrl: string, model: string }) => {
        try {
            console.log('[Main] Testing LLM Connection:', { ...config, apiKey: '***' });

            // Dynamic import to avoid top-level dependency issues if not needed elsewhere, 
            // though OpenAI is likely already imported. 
            // Since we need to instantiate it:
            const { OpenAI } = await import('openai');

            const client = new OpenAI({
                apiKey: config.apiKey || 'sk-dummy', // Some local providers require non-empty key
                baseURL: config.baseUrl,
                dangerouslyAllowBrowser: true
            });

            // Attempt to list models as a lightweight connectivity check
            try {
                await client.models.list();
                return { success: true, message: 'Connection successful! (Model list accessible)' };
            } catch (e: any) {
                // If list models fails (some providers might not support it), try a minimal completion
                console.warn('[Main] Model list failed, trying completion:', e.message);

                await client.chat.completions.create({
                    model: config.model || 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 1
                });
                return { success: true, message: 'Connection successful! (Chat completion works)' };
            }

        } catch (error: any) {
            console.error('[Main] LLM Test Failed:', error);
            return { success: false, message: error.message || 'Connection failed' };
        }
    })

    // IPC: Chat History
    const chatHistoryManager = new ChatHistoryManager();

    ipcMain.handle('get-session-list', () => chatHistoryManager.getSessionList());

    ipcMain.handle('get-session-messages', (_, id: string) => chatHistoryManager.getSessionMessages(id));

    ipcMain.handle('save-session', (_, session: any) => chatHistoryManager.saveSession(session));

    ipcMain.handle('delete-session', (_, id: string) => chatHistoryManager.deleteSession(id));

    createWindow()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// IPC 示例
ipcMain.handle('ping', () => 'pong')
