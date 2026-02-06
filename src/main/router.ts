
import { AppSettings } from '../common/types/settings';
import { ToolRegistry } from './services/tools/ToolRegistry';
import { SessionManager } from './services/session';
import { AgentController } from './controllers/AgentController';
import { SessionController } from './controllers/SessionController';

/**
 * App Router
 * 
 * Main entry point for registering all IPC Core services.
 * Acts as the Dependency Injection Container.
 */
export class AppRouter {
    private agentController: AgentController;
    private sessionController: SessionController;
    private sessionManager: SessionManager;
    private toolRegistry: ToolRegistry;

    constructor(
        settings: AppSettings,
        toolRegistry: ToolRegistry
    ) {
        // Initialize Core Services
        this.sessionManager = new SessionManager();
        this.toolRegistry = toolRegistry;

        // Initialize Controllers
        this.agentController = new AgentController(settings, this.toolRegistry, this.sessionManager);
        this.sessionController = new SessionController(this.sessionManager);
    }

    /**
     * Initialize all IPC routes
     */
    public initialize(): void {
        this.agentController.registerHandlers();
        this.sessionController.registerHandlers();
        console.log('[AppRouter] IPC handlers registered.');
    }
}
