
import { ipcMain } from 'electron';
import { TOOL_CHANNELS } from '../../common/ipc/channels';
import { SkillRegistry } from '../services/skills/core/SkillRegistry';
import { McpManager } from '../services/tools/mcp/McpManager';
import { ConfigManager } from '../services/ConfigManager';
import { ToolRegistry } from '../services/tools/ToolRegistry';
import { Skill } from '../../common/types/skill';
import { SkillObject } from '../services/skills/core/SkillParser';

export class ToolController {
    constructor(
        private skillRegistry: SkillRegistry,
        private toolRegistry: ToolRegistry,
        private mcpManager: McpManager,
        private configManager: ConfigManager
    ) { }

    public registerHandlers() {
        ipcMain.handle(TOOL_CHANNELS.GET_SKILLS, () => this.handleGetSkills());
        ipcMain.handle(TOOL_CHANNELS.TOGGLE_SKILL, (_, id) => this.handleToggleSkill(id));
        ipcMain.handle(TOOL_CHANNELS.SET_TRUST_LEVEL, (_, id, level) => this.handleSetTrustLevel(id, level));
        ipcMain.handle(TOOL_CHANNELS.MCP_CONNECT, (_, config) => this.mcpManager.connectToServer(config));
        ipcMain.handle(TOOL_CHANNELS.MCP_LIST_TOOLS, () => this.handleListMcpTools());
    }

    public getEnabledSkillObjects(): SkillObject[] {
        const allSkills = this.skillRegistry.getAll();
        const settings = this.configManager.load();
        const skillSettings = settings.skillSettings || {};

        return allSkills.filter(s => {
            const saved = skillSettings[s.id];
            // Default to enabled if not explicitly set to false? 
            // Or default to disabled?
            // Let's assume default is ENABLED to reduce friction for new skills.
            if (saved) return saved.enabled;
            return true;
        });
    }

    private handleGetSkills(): Skill[] {
        const skillObjects = this.skillRegistry.getAll();
        const settings = this.configManager.load();
        const skillSettings = settings.skillSettings || {};

        return skillObjects.map(obj => {
            const saved = skillSettings[obj.id];
            return {
                id: obj.id,
                name: obj.name,
                description: obj.description,
                content: obj.instruction,
                path: obj.path || '',
                enabled: saved ? saved.enabled : true, // Default true
                trustLevel: saved ? saved.trustLevel : 'Ask'
            };
        });
    }

    private handleToggleSkill(id: string): Skill[] {
        const settings = this.configManager.load();
        const skillSettings = settings.skillSettings || {};

        const currentList = this.handleGetSkills();
        const target = currentList.find(s => s.id === id);

        if (target) {
            skillSettings[id] = {
                enabled: !target.enabled,
                trustLevel: target.trustLevel
            };

            this.configManager.save({
                ...settings,
                skillSettings
            });
        }

        return this.handleGetSkills();
    }

    private handleSetTrustLevel(id: string, level: 'Ask' | 'Auto'): Skill[] {
        const settings = this.configManager.load();
        const skillSettings = settings.skillSettings || {};

        const currentList = this.handleGetSkills();
        const target = currentList.find(s => s.id === id);

        if (target) {
            skillSettings[id] = {
                enabled: target.enabled,
                trustLevel: level
            };

            this.configManager.save({
                ...settings,
                skillSettings
            });
        }

        return this.handleGetSkills();
    }

    private handleListMcpTools() {
        return this.toolRegistry.getToolDefinitions().map(def => ({
            name: def.name,
            description: def.description
        }));
    }
}
