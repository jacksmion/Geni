
import { AppSettings, DEFAULT_PROVIDER_CONFIGS } from '../common/types/settings';
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
import { UsageManager } from './services/usage/UsageManager';
import { UpdateService } from './services/update/UpdateService';
import { UpdateController } from './controllers/UpdateController';
import { StaffManager } from './services/staff/StaffManager';
import { StaffController } from './controllers/StaffController';
import { DefaultAgentRuntime } from './services/agent/runtime/DefaultAgentRuntime';
import { DefaultAgenticExecutor } from './services/agent/executor/DefaultAgenticExecutor';
import { LLMClientFactory } from './services/llm/IChatModel';
import { createChatModel } from './services/llm/ChatModelFactory';
import { Agent } from '../common/types/agent';
import { app } from 'electron';

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
    private updateService: UpdateService;
    private updateController: UpdateController;
    private staffManager: StaffManager;
    private staffController: StaffController;

    private sessionManager: SessionManager;
    private toolRegistry: ToolRegistry;
    private skillRegistry: SkillRegistry;
    private mcpManager: McpManager;
    private configManager: ConfigManager;
    private coreToolManager: CoreToolManager;
    private pathManager: PathManager;
    private currentWorkspacePath: string;
    private usageManager: UsageManager;
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
        this.usageManager = new UsageManager(pathManager);
        this.sessionManager = new SessionManager(pathManager);
        this.staffManager = new StaffManager(pathManager);

        const settings = this.configManager.load();
        this.currentWorkspacePath = settings.workspacePath || process.cwd();

        // Controllers
        this.systemController = new SystemController(this.configManager, pathManager, this.usageManager);
        this.toolController = new ToolController(this.skillRegistry, this.toolRegistry, this.mcpManager, this.configManager, this.coreToolManager);

        // Three-layer architecture wiring
        const llmFactory: LLMClientFactory = (agent: Agent) => {
            const [provider, ...rest] = agent.modelId.split('/');
            const model = rest.join('/') || 'gpt-4o';
            const providers = settings.llm.providers || {};
            const config = providers[provider] || DEFAULT_PROVIDER_CONFIGS[provider] || { apiKey: '', model };
            const temperature = agent.temperature ?? config.temperature ?? 0.7;
            return createChatModel(provider, {
                apiKey: config.apiKey || '',
                baseUrl: config.baseUrl,
                model,
                temperature
            });
        };
        const executor = new DefaultAgenticExecutor(llmFactory, settings);
        const runtime = new DefaultAgentRuntime(
            settings,
            this.toolRegistry,
            this.sessionManager,
            this.skillRegistry,
            memoryStore,
            this.usageManager,
            executor
        );

        this.imServiceManager = new IMServiceManager(settings, this.toolRegistry, this.sessionManager, this.toolController, runtime);
        this.systemController.setIMServiceManager(this.imServiceManager);

        // Scheduler
        const schedulerStorage = new SchedulerStorage(pathManager);
        this.schedulerService = new SchedulerService(
            settings,
            this.toolRegistry,
            this.sessionManager,
            this.toolController,
            schedulerStorage,
            runtime,
            this.imServiceManager,
            this.configManager
        );
        this.schedulerController = new SchedulerController(this.schedulerService);
        this.coreToolManager.setSchedulerService(this.schedulerService);

        this.agentController = new AgentController(
            runtime,
            settings,
            this.staffManager,
            this.sessionManager
        );
        this.sessionController = new SessionController(this.sessionManager);

        this.updateService = new UpdateService();
        this.updateController = new UpdateController(this.updateService);
        this.staffController = new StaffController(this.staffManager);


        // Wiring
        const settingsChangeHandler = async (newSettings: AppSettings) => {
            // 1. Update Agent Engine settings
            this.agentController.updateSettings(newSettings);

            // 2. Sync Scheduled Tasks (Priority)
            this.schedulerService.syncWithSettings(newSettings);

            // 3. Update Tray Language
            if (this.trayManager && newSettings.language) {
                this.trayManager.setLanguage(newSettings.language);
            }

            // 4. Update Tool settings & Workspace
            this.toolRegistry.updateWorkspacePath(newSettings.workspacePath);
            this.coreToolManager.updateWorkspacePath(newSettings.workspacePath);
            this.coreToolManager.refresh();

            // 5. Reload project skills if workspace changed
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

            // 7. Update IM Services & MCP (Heavy tasks - run asynchronously)
            (async () => {
                // Sync MCP Server states
                if (newSettings.mcpServers) {
                    for (const server of newSettings.mcpServers) {
                        const isConnected = this.mcpManager.isConnected(server.id);
                        if (server.enabled && !isConnected) {
                            console.log(`[AppRouter] Auto-connecting MCP server ${server.id}`);
                            this.mcpManager.connectToServer(server).catch(console.error);
                        } else if (!server.enabled && isConnected) {
                            await this.mcpManager.disconnectServer(server.id).catch(console.error);
                        }
                    }
                }
                await this.imServiceManager.updateSettings(newSettings).catch((e: any) => console.error('[AppRouter] IM update error:', e));
            })();

            // 8. Broadcast to UI
            this.systemController.broadcastSettingsChanged(newSettings);
        };

        this.systemController.setSettingsChangeCallback(settingsChangeHandler);
        this.coreToolManager.setSettingsChangeCallback(settingsChangeHandler);
        this.schedulerService.setSettingsChangeCallback(settingsChangeHandler);
        
        // 由于 CoreToolManager 在 AppRouter 之前已 initialize，此处需要 refresh 一次以注入回调
        this.coreToolManager.refresh();
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
        this.updateController.registerHandlers();
        this.staffController.registerHandlers();

        this.imServiceManager.start().catch((err: any) => console.error('[AppRouter] Error starting IM Service Manager:', err));

        // Start scheduled tasks from current settings
        const currentSettings = this.configManager.load();
        this.schedulerService.syncWithSettings(currentSettings);

        // Auto check for updates if enabled and packaged
        if (currentSettings.autoUpdate && app.isPackaged) {
            setTimeout(() => {
                this.updateService.checkForUpdates().catch(() => {
                    // Ignore background check errors
                });
            }, 5000); // Wait 5s after startup
        }

        console.log('[AppRouter] IPC handlers registered.');
    }
}
