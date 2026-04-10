
import { ipcMain } from 'electron';
import { TOOL_CHANNELS } from '../../common/ipc/channels';
import { SkillRegistry } from '../services/skills/core/SkillRegistry';
import { McpManager } from '../services/tools/mcp/McpManager';
import { ConfigManager } from '../services/ConfigManager';
import { ToolRegistry } from '../services/tools/ToolRegistry';
import { Skill } from '../../common/types/skill';
import { SkillObject } from '../services/skills/core/SkillParser';
import { CoreToolManager } from '../services/tools/core/CoreToolManager';
import { SkillImportService } from '../services/skills/SkillImportService';
import path from 'node:path';

export class ToolController {
    private globalSkillsDir: string;

    constructor(
        private skillRegistry: SkillRegistry,
        private toolRegistry: ToolRegistry,
        private mcpManager: McpManager,
        private configManager: ConfigManager,
        private coreToolManager: CoreToolManager,
        private skillImportService: SkillImportService,
        globalSkillsDir: string
    ) {
        this.globalSkillsDir = globalSkillsDir;
    }

    public registerHandlers() {
        ipcMain.handle(TOOL_CHANNELS.GET_SKILLS, () => this.handleGetSkills());
        ipcMain.handle(TOOL_CHANNELS.TOGGLE_SKILL, (_, id) => this.handleToggleSkill(id));
        ipcMain.handle(TOOL_CHANNELS.SET_TRUST_LEVEL, (_, id, level) => this.handleSetTrustLevel(id, level));
        ipcMain.handle(TOOL_CHANNELS.MCP_CONNECT, async (_, config) => {
            try {
                await this.mcpManager.connectToServer(config);
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });
        ipcMain.handle(TOOL_CHANNELS.MCP_LIST_TOOLS, () => this.handleListMcpTools());
        ipcMain.handle(TOOL_CHANNELS.MCP_TOGGLE_TOOL, (_, serverId, toolName) => this.handleToggleMcpTool(serverId, toolName));
        ipcMain.handle(TOOL_CHANNELS.MCP_SET_TOOL_TRUST_LEVEL, (_, serverId, toolName, level) => this.handleSetMcpToolTrustLevel(serverId, toolName, level));
        ipcMain.handle(TOOL_CHANNELS.MCP_TOGGLE_SERVER, (_, serverId, enabled) => this.handleToggleMcpServer(serverId, enabled));
        ipcMain.handle(TOOL_CHANNELS.MCP_GET_STATUSES, () => this.mcpManager.getConnectionStatuses());

        ipcMain.handle(TOOL_CHANNELS.CORE_TOOL_LIST, () => this.handleCoreToolList());
        ipcMain.handle(TOOL_CHANNELS.CORE_TOOL_TOGGLE, (_, toolName) => this.handleCoreToolToggle(toolName));
        ipcMain.handle(TOOL_CHANNELS.CORE_TOOL_SET_TRUST_LEVEL, (_, toolName, level) => this.handleCoreToolSetTrustLevel(toolName, level));

        ipcMain.handle(TOOL_CHANNELS.IMPORT_SKILL, (_, filePath: string) => this.handleImportSkill(filePath));
        ipcMain.handle(TOOL_CHANNELS.IMPORT_SKILL_CONFIRM, (_, originalPath: string, sourceTempDir: string | undefined, skillName: string, action: 'overwrite' | 'skip' | 'rename') => this.handleImportSkillConfirm(originalPath, sourceTempDir, skillName, action));
    }

    private handleCoreToolList() {
        return this.coreToolManager.getCoreToolMetadata();
    }

    private async handleCoreToolToggle(toolName: string) {
        const settings = this.configManager.load();
        const coreToolSettings = { ... (settings.coreToolSettings || {}) };
        const current = coreToolSettings[toolName] || { enabled: true, trustLevel: 'Ask' };

        coreToolSettings[toolName] = {
            ...current,
            enabled: !current.enabled
        };

        this.configManager.save({ ...settings, coreToolSettings });
        this.coreToolManager.refresh();
        return { success: true };
    }

    private async handleCoreToolSetTrustLevel(toolName: string, level: 'Ask' | 'Auto') {
        const settings = this.configManager.load();
        const coreToolSettings = { ... (settings.coreToolSettings || {}) };
        const current = coreToolSettings[toolName] || { enabled: true, trustLevel: 'Ask' };

        coreToolSettings[toolName] = {
            ...current,
            trustLevel: level
        };

        this.configManager.save({ ...settings, coreToolSettings });
        this.coreToolManager.refresh();
        return { success: true };
    }

    private async handleToggleMcpServer(serverId: string, enabled: boolean) {
        if (!enabled) {
            // Immediately disconnect if disabled
            await this.mcpManager.disconnectServer(serverId);
        } else {
            // Connect if enabled
            const settings = this.configManager.load();
            const config = settings.mcpServers?.find(s => s.id === serverId);
            if (config) {
                try {
                    await this.mcpManager.connectToServer(config);
                } catch (e) {
                    console.error(`[ToolController] Failed to auto-connect ${serverId} on toggle:`, e);
                }
            }
        }
        return { success: true };
    }

    private async handleToggleMcpTool(serverId: string, toolName: string) {
        const settings = this.configManager.load();
        const mcpServers = [...(settings.mcpServers || [])];
        const serverIdx = mcpServers.findIndex(s => s.id === serverId);

        if (serverIdx !== -1) {
            const server = mcpServers[serverIdx];
            const toolSettings = { ...(server.toolSettings || {}) };
            const current = toolSettings[toolName] || { enabled: true, trustLevel: 'Ask' };

            toolSettings[toolName] = {
                ...current,
                enabled: !current.enabled
            };

            mcpServers[serverIdx] = { ...server, toolSettings };
            this.configManager.save({ ...settings, mcpServers });

            // Refresh tools to apply changes if connected
            if (this.mcpManager.isConnected(serverId)) {
                await this.mcpManager.refreshTools(serverId, mcpServers[serverIdx]).catch(console.error);
            }
        }
        return { success: true };
    }

    private async handleSetMcpToolTrustLevel(serverId: string, toolName: string, level: 'Ask' | 'Auto') {
        const settings = this.configManager.load();
        const mcpServers = [...(settings.mcpServers || [])];
        const serverIdx = mcpServers.findIndex(s => s.id === serverId);

        if (serverIdx !== -1) {
            const server = mcpServers[serverIdx];
            const toolSettings = { ...(server.toolSettings || {}) };
            const current = toolSettings[toolName] || { enabled: true, trustLevel: 'Ask' };

            toolSettings[toolName] = {
                ...current,
                trustLevel: level
            };

            mcpServers[serverIdx] = { ...server, toolSettings };
            this.configManager.save({ ...settings, mcpServers });

            // Refresh tools to apply changes if connected
            if (this.mcpManager.isConnected(serverId)) {
                await this.mcpManager.refreshTools(serverId, mcpServers[serverIdx]).catch(console.error);
            }
        }
        return { success: true };
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

    public getSkillObjectsByIds(ids: string[]): SkillObject[] {
        const allSkills = this.skillRegistry.getAll();
        return allSkills.filter(s => ids.includes(s.id));
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
        return this.mcpManager.getAllDiscoveredTools();
    }

    private async handleImportSkill(filePath: string) {
        const result = await this.skillImportService.importSkill(filePath);
        if (result.status === 'success' && result.skillName) {
            await this.skillRegistry.loadFromDirectory(
                path.join(this.globalSkillsDir, result.skillName), 'global'
            );
        }
        return result;
    }

    private async handleImportSkillConfirm(originalPath: string, sourceTempDir: string | undefined, skillName: string, action: 'overwrite' | 'skip' | 'rename') {
        const result = await this.skillImportService.confirmImport(originalPath, sourceTempDir, skillName, action);
        if (result.status === 'success' && result.skillName && action !== 'skip') {
            await this.skillRegistry.loadFromDirectory(
                path.join(this.globalSkillsDir, result.skillName), 'global'
            );
        }
        return result;
    }
}
