
import { AppSettings } from '../common/types/settings';
import { ToolRegistry } from './services/tools/ToolRegistry';
import { SessionManager } from './services/session';
import { AgentController } from './controllers/AgentController';
import { SessionController } from './controllers/SessionController';
import { SystemController } from './controllers/SystemController';
import { ToolController } from './controllers/ToolController';
import { ConfigManager } from './services/ConfigManager';
import { SkillRegistry } from './services/skills/core/SkillRegistry';
import { McpManager } from './services/tools/mcp/McpManager';
import { CoreToolManager } from './services/tools/core/CoreToolManager';
import { PathManager } from './services/PathManager';
import { IMServiceManager } from './services/im/IMServiceManager';
import { SchedulerService } from './services/scheduler/SchedulerService';
import { SchedulerStorage } from './services/scheduler/SchedulerStorage';
import { SchedulerController } from './controllers/SchedulerController';
import { SystemTrayManager } from './services/SystemTrayManager';
import { MemoryStore } from './services/memory/MemoryStore';

/**
 * App Router
 *
 * Main entry point for registering all IPC Core services.
 * Acts as the Dependency Injection Container.
 */
export class AppRouter {
    private agentController: AgentController;
    private sessionController: SessionController;
    private systemController: SystemController;
    private toolController: ToolController;
    private imServiceManager: IMServiceManager;
    private schedulerService: SchedulerService;
    private schedulerController: SchedulerController;

    private sessionManager: SessionManager;
    private toolRegistry: ToolRegistry;
    private skillRegistry: SkillRegistry;
    private mcpManager: McpManager;
    private configManager: ConfigManager;
    private coreToolManager: CoreToolManager;
    private pathManager: PathManager;
    private currentWorkspacePath: string;
    private trayManager: SystemTrayManager | null = null;

    constructor(
        configManager: ConfigManager,
        toolRegistry: ToolRegistry,
        skillRegistry: SkillRegistry,
        mcpManager: McpManager,
        coreToolManager: CoreToolManager,
        pathManager: PathManager,
        memoryStore: MemoryStore
    ) {
        // Services
        this.configManager = configManager;
        this.toolRegistry = toolRegistry;
        this.skillRegistry = skillRegistry;
        this.mcpManager = mcpManager;
        this.coreToolManager = coreToolManager;
        this.pathManager = pathManager;
        this.sessionManager = new SessionManager(pathManager);

        const settings = this.configManager.load();
        this.currentWorkspacePath = settings.workspacePath || process.cwd();

        // Controllers
        this.systemController = new SystemController(this.configManager, pathManager);
        this.toolController = new ToolController(this.skillRegistry, this.toolRegistry, this.mcpManager, this.configManager, this.coreToolManager);

        this.imServiceManager = new IMServiceManager(settings, this.toolRegistry, this.sessionManager, this.toolController, memoryStore);
        this.systemController.setIMServiceManager(this.imServiceManager);

        this.agentController = new AgentController(
            settings,
            this.toolRegistry,
            this.sessionManager,
            this.toolController,
            memoryStore
        );
        this.sessionController = new SessionController(this.sessionManager);

        // Scheduler
        const schedulerStorage = new SchedulerStorage(pathManager);
        this.schedulerService = new SchedulerService(
            settings,
            this.toolRegistry,
            this.sessionManager,
            this.toolController,
            schedulerStorage,
            memoryStore
        );
        this.schedulerController = new SchedulerController(this.schedulerService);

        // Wiring
        this.systemController.setSettingsChangeCallback(async (newSettings) => {
            // 1. Update Agent Engine settings
            this.agentController.updateSettings(newSettings);

            // 2. Update Tool settings & Workspace
            this.toolRegistry.updateWorkspacePath(newSettings.workspacePath);
            this.coreToolManager.updateWorkspacePath(newSettings.workspacePath);
            this.coreToolManager.refresh();

            // 3. Reload project skills if workspace changed
            const newWorkspacePath = newSettings.workspacePath || process.cwd();
            if (newWorkspacePath !== this.currentWorkspacePath) {
                console.log(`[AppRouter] Workspace changed from ${this.currentWorkspacePath} to ${newWorkspacePath}`);
                // Remove old project skills
                this.skillRegistry.removeBySource('project');
                // Load new project skills
                const projectSkillsDir = this.pathManager.getProjectSkillsDir(newWorkspacePath);
                await this.skillRegistry.loadFromDirectory(projectSkillsDir, 'project');
                console.log(`[AppRouter] Reloaded project skills from ${projectSkillsDir}`);
                this.currentWorkspacePath = newWorkspacePath;
            }

            // 4. Sync MCP Server states (connect new ones, disconnect disabled ones)
            if (newSettings.mcpServers) {
                for (const server of newSettings.mcpServers) {
                    const isConnected = this.mcpManager.isConnected(server.id);
                    if (server.enabled && !isConnected) {
                        console.log(`[AppRouter] Auto-connecting MCP server ${server.id} after settings change`);
                        this.mcpManager.connectToServer(server).catch(e => {
                            console.error(`[AppRouter] Failed to connect MCP server ${server.id}:`, e);
                        });
                    } else if (!server.enabled && isConnected) {
                        console.log(`[AppRouter] Disconnecting MCP server ${server.id} after settings change`);
                        await this.mcpManager.disconnectServer(server.id).catch(console.error);
                    }
                }
            }
            // 5. Update IM Services
            await this.imServiceManager.updateSettings(newSettings);

            // 6. Sync Scheduled Tasks
            this.schedulerService.syncWithSettings(newSettings);

            // 7. Update Tray Language
            if (this.trayManager && newSettings.language) {
                this.trayManager.setLanguage(newSettings.language);
            }
        });
    }

    /**
     * Link Tray Manager
     */
    public setTrayManager(trayManager: SystemTrayManager): void {
        this.trayManager = trayManager;
    }

    /**
     * Initialize all IPC routes
     */
    public initialize(): void {
        this.agentController.registerHandlers();
        this.sessionController.registerHandlers();
        this.systemController.registerHandlers();
        this.toolController.registerHandlers();
        this.schedulerController.registerHandlers();

        this.imServiceManager.start().catch((err: any) => console.error('[AppRouter] Error starting IM Service Manager:', err));

        // Start scheduled tasks from current settings
        const currentSettings = this.configManager.load();
        this.schedulerService.syncWithSettings(currentSettings);

        console.log('[AppRouter] IPC handlers registered.');
    }
}
