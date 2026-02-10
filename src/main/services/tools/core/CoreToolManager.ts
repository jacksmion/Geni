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
import { CreatePlanTool, UpdateTaskStatusTool, ReadPlanTool } from './planning/PlanningTools';
import { SkillRegistry } from '../../skills/core/SkillRegistry';
import { defaultToolGuard, ToolTrustLevel } from '../../agent/ToolGuard';

export class CoreToolManager {
    private registry: ToolRegistry;
    private configManager: ConfigManager;
    private skillRegistry: SkillRegistry;
    private workspacePath: string;

    constructor(registry: ToolRegistry, configManager: ConfigManager, skillRegistry: SkillRegistry, workspacePath: string) {
        this.registry = registry;
        this.configManager = configManager;
        this.skillRegistry = skillRegistry;
        this.workspacePath = workspacePath;
    }

    /**
     * Initialize and register core tools based on settings
     */
    public initialize() {
        const settings = this.configManager.load();
        const coreToolSettings = settings.coreToolSettings || {};

        // Define all available core tools and their factory functions
        const toolFactories: Record<string, () => any> = {
            'list_directory': () => new ListDirTool(this.workspacePath),
            'read_file': () => new ReadFileTool(this.workspacePath),
            'write_file': () => new WriteFileTool(this.workspacePath),
            'bash': () => new BashTool(this.workspacePath),
            'file_edit': () => new FileEditTool(this.workspacePath),
            'glob_search': () => new GlobTool(this.workspacePath),
            'grep_search': () => new GrepTool(this.workspacePath),
            'create_plan': () => new CreatePlanTool(this.workspacePath),
            'update_task_status': () => new UpdateTaskStatusTool(this.workspacePath),
            'read_plan': () => new ReadPlanTool(this.workspacePath),
            'load_skill': () => new SkillLoaderTool(this.skillRegistry, this.configManager)
        };

        // Determine safe tools for default 'Auto' trust (read-only or non-destructive)
        const safeTools = [
            'list_directory',
            'read_file',
            'glob_search',
            'grep_search',
            'read_plan',
            'create_plan',
            'update_task_status',
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
            'list_directory',
            'read_file',
            'glob_search',
            'grep_search',
            'read_plan',
            'create_plan',
            'update_task_status',
            'load_skill'
        ];
        const hiddenTools = ['create_plan', 'update_task_status', 'read_plan', 'load_skill'];

        // This is a static list of all core tools we support, with their descriptions
        const allCoreTools = [
            { name: 'list_directory', description: 'List files and directories in a path' },
            { name: 'read_file', description: 'Read the content of a file' },
            { name: 'write_file', description: 'Write or overwrite a file' },
            { name: 'bash', description: 'Execute shell commands' },
            { name: 'file_edit', description: 'Edit existing files with advanced matching' },
            { name: 'glob_search', description: 'Search for files using glob patterns' },
            { name: 'grep_search', description: 'Search for text patterns within files' },
            { name: 'create_plan', description: 'Create a new project plan' },
            { name: 'update_task_status', description: 'Update a task in a plan' },
            { name: 'read_plan', description: 'Read an existing plan' },
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
            'list_directory', 'read_file', 'write_file', 'bash', 'file_edit',
            'glob_search', 'grep_search', 'create_plan', 'update_task_status',
            'read_plan', 'load_skill'
        ];
        allCoreTools.forEach(name => this.registry.unregister(name));

        // Re-initialize
        this.initialize();
    }
}
