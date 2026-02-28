import { ToolRegistry } from '../ToolRegistry';
import { ConfigManager } from '../../ConfigManager';
import { ListDirTool } from './ListDirTool';
import { ReadFileTool } from './ReadFileTool';
import { WriteFileTool } from './WriteFileTool';
import { BashTool } from './BashTool';
import { FileEditTool } from './FileEditTool';
import { GlobTool } from './GlobTool';
import { GrepTool } from './GrepTool';
import { SkillLoaderTool } from './SkillLoaderTool';
import { TodoWriteTool, TodoReadTool } from './TodoTool';
import { SkillRegistry } from '../../skills/core/SkillRegistry';
import { defaultToolGuard, ToolTrustLevel } from '../../agent/ToolGuard';
import { PathManager } from '../../PathManager';

export class CoreToolManager {
    private registry: ToolRegistry;
    private configManager: ConfigManager;
    private skillRegistry: SkillRegistry;
    private workspacePath: string;
    private pathManager: PathManager;

    constructor(registry: ToolRegistry, configManager: ConfigManager, skillRegistry: SkillRegistry, workspacePath: string, pathManager: PathManager) {
        this.registry = registry;
        this.configManager = configManager;
        this.skillRegistry = skillRegistry;
        this.workspacePath = workspacePath;
        this.pathManager = pathManager;
    }

    /**
     * Initialize and register core tools based on settings
     */
    public initialize() {
        const settings = this.configManager.load();
        const coreToolSettings = settings.coreToolSettings || {};

        // Determine allowed paths
        const allowedPaths = this.pathManager.getSkillsLoadPaths(this.workspacePath);

        // Define all available core tools and their factory functions
        const toolFactories: Record<string, () => any> = {
            'list': () => new ListDirTool(this.workspacePath, allowedPaths),
            'read': () => new ReadFileTool(this.workspacePath, allowedPaths),
            'write': () => new WriteFileTool(this.workspacePath),
            'bash': () => new BashTool(this.workspacePath, allowedPaths),
            'edit': () => new FileEditTool(this.workspacePath),
            'glob': () => new GlobTool(this.workspacePath, allowedPaths),
            'grep': () => new GrepTool(this.workspacePath, allowedPaths),
            'todowrite': () => new TodoWriteTool(),
            'todoread': () => new TodoReadTool(),
            'load_skill': () => new SkillLoaderTool(this.skillRegistry, this.configManager)
        };

        // Determine safe tools for default 'Auto' trust (read-only or non-destructive)
        const safeTools = [
            'list',
            'read',
            'glob',
            'grep',
            'todowrite',
            'todoread',
            'load_skill'
        ];

        // Register each tool if not explicitly disabled
        for (const [name, factory] of Object.entries(toolFactories)) {
            const setting = coreToolSettings[name];
            if (setting && setting.enabled === false) {
                console.log(`[CoreToolManager] Tool ${name} is disabled by user settings`);
                continue;
            }

            const tool = factory();

            // Apply trust level override if specified, otherwise use default
            const trustLevel = setting?.trustLevel || (safeTools.includes(name) ? 'Auto' : 'Ask');
            tool.requireConfirmation = (trustLevel === 'Ask');

            // Sync with ToolGuard mapping
            defaultToolGuard.registerToolTrustLevel(
                name,
                trustLevel === 'Auto' ? ToolTrustLevel.Safe : ToolTrustLevel.Dangerous
            );

            this.registry.register(tool);
        }
    }

    /**
     * Get list of all available core tools (registered or not)
     */
    public getCoreToolMetadata() {
        const settings = this.configManager.load();
        const coreToolSettings = settings.coreToolSettings || {};

        const safeTools = [
            'list',
            'read',
            'glob',
            'grep',
            'todowrite',
            'todoread',
            'load_skill'
        ];
        const hiddenTools = ['todowrite', 'todoread', 'load_skill'];

        // This is a static list of all core tools we support, with their descriptions
        const allCoreTools = [
            { name: 'list', description: 'List files and directories in a path' },
            { name: 'read', description: 'Read the content of a file' },
            { name: 'write', description: 'Write or overwrite a file' },
            { name: 'bash', description: 'Execute shell commands' },
            { name: 'edit', description: 'Edit existing files with advanced matching' },
            { name: 'glob', description: 'Search for files using glob patterns' },
            { name: 'grep', description: 'Search for text patterns within files' },
            { name: 'todowrite', description: 'Create or update the todo list' },
            { name: 'todoread', description: 'Read the current todo list' },
            { name: 'load_skill', description: 'Load detailed instructions and resources for a skill' }
        ];

        return allCoreTools
            .filter(t => !hiddenTools.includes(t.name))
            .map(t => {
                const setting = coreToolSettings[t.name];
                return {
                    ...t,
                    enabled: setting ? setting.enabled : true,
                    trustLevel: setting ? setting.trustLevel : (safeTools.includes(t.name) ? 'Auto' : 'Ask')
                };
            });
    }

    /**
     * Refresh core tools registration (call after settings update)
     */
    public refresh() {
        // First unregister all core tools
        // We use the full list to ensure even currently disabled or hidden tools are cleaned up from registry
        const allCoreTools = [
            'list', 'read', 'write', 'bash', 'edit',
            'glob', 'grep', 'todowrite', 'todoread',
            'load_skill'
        ];
        allCoreTools.forEach(name => this.registry.unregister(name));

        // Re-initialize
        this.initialize();
    }

    /**
     * Updates the local workspace path reference.
     * This should be called before refresh() when the path changes.
     */
    public updateWorkspacePath(newPath: string) {
        this.workspacePath = newPath;
    }
}
