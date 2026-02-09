
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

    private sessionManager: SessionManager;
    private toolRegistry: ToolRegistry;
    private skillRegistry: SkillRegistry;
    private mcpManager: McpManager;
    private configManager: ConfigManager;
    private coreToolManager: CoreToolManager;

    constructor(
        configManager: ConfigManager,
        toolRegistry: ToolRegistry,
        skillRegistry: SkillRegistry,
        mcpManager: McpManager,
        coreToolManager: CoreToolManager
    ) {
        // Services
        this.configManager = configManager;
        this.toolRegistry = toolRegistry;
        this.skillRegistry = skillRegistry;
        this.mcpManager = mcpManager;
        this.coreToolManager = coreToolManager;
        this.sessionManager = new SessionManager();

        const settings = this.configManager.load();

        // Controllers
        this.systemController = new SystemController(this.configManager);
        this.toolController = new ToolController(this.skillRegistry, this.toolRegistry, this.mcpManager, this.configManager, this.coreToolManager);

        this.agentController = new AgentController(
            settings,
            this.toolRegistry,
            this.sessionManager,
            this.toolController
        );
        this.sessionController = new SessionController(this.sessionManager);

        // Wiring
        this.systemController.setSettingsChangeCallback((newSettings) => {
            this.agentController.updateSettings(newSettings);
            this.toolRegistry.updateWorkspacePath(newSettings.workspacePath);
        });
    }

    /**
     * Initialize all IPC routes
     */
    public initialize(): void {
        this.agentController.registerHandlers();
        this.sessionController.registerHandlers();
        this.systemController.registerHandlers();
        this.toolController.registerHandlers();

        console.log('[AppRouter] IPC handlers registered.');
    }
}
