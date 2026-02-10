
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
        this.systemController.setSettingsChangeCallback(async (newSettings) => {
            // 1. Update Agent Engine settings
            this.agentController.updateSettings(newSettings);

            // 2. Update Tool settings & Workspace
            this.toolRegistry.updateWorkspacePath(newSettings.workspacePath);
            this.coreToolManager.updateWorkspacePath(newSettings.workspacePath);
            this.coreToolManager.refresh();

            // 3. Sync MCP Server states (connect new ones, disconnect disabled ones)
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
