
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
import fs from 'node:fs/promises';

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
        ipcMain.handle(TOOL_CHANNELS.RELOAD_SKILLS, () => this.handleReloadSkills());
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
        ipcMain.handle(TOOL_CHANNELS.DELETE_SKILL, (_, id: string) => this.handleDeleteSkill(id));
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

    /** 从当前内存 registry 构建技能列表（不触发磁盘 reload） */
    private buildSkillList(): Skill[] {
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
                rawContent: obj.rawContent,
                path: obj.path || '',
                enabled: saved ? saved.enabled : true,
                trustLevel: saved ? saved.trustLevel : 'Ask',
                source: this.skillRegistry.getSource(obj.id) || 'global'
            };
        });
    }

    private handleGetSkills(): Skill[] {
        return this.buildSkillList();
    }

    private async handleReloadSkills(): Promise<Skill[]> {
        this.skillRegistry.removeBySource('global');
        await this.skillRegistry.loadFromDirectory(this.globalSkillsDir, 'global');
        return this.buildSkillList();
    }

    private async handleToggleSkill(id: string): Promise<Skill[]> {
        const settings = this.configManager.load();
        const skillSettings = settings.skillSettings || {};
        const target = this.skillRegistry.get(id);

        if (target) {
            const saved = skillSettings[id];
            skillSettings[id] = {
                enabled: saved ? !saved.enabled : false, // default enabled=true, toggle → false
                trustLevel: saved?.trustLevel ?? 'Ask'
            };
            this.configManager.save({ ...settings, skillSettings });
        }

        return this.buildSkillList();
    }

    private async handleSetTrustLevel(id: string, level: 'Ask' | 'Auto'): Promise<Skill[]> {
        const settings = this.configManager.load();
        const skillSettings = settings.skillSettings || {};
        const saved = skillSettings[id];

        skillSettings[id] = {
            enabled: saved ? saved.enabled : true,
            trustLevel: level
        };
        this.configManager.save({ ...settings, skillSettings });

        return this.buildSkillList();
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

    private async handleDeleteSkill(id: string): Promise<{ success: boolean; error?: string }> {
        const source = this.skillRegistry.getSource(id);
        if (source !== 'global') {
            return { success: false, error: 'Only skills from ~/.geni/skills/ can be deleted.' };
        }

        const skill = this.skillRegistry.get(id);
        if (!skill?.path) {
            return { success: false, error: 'Skill path not found.' };
        }

        // The skill path points to SKILL.md — delete the parent directory
        const skillDir = path.dirname(skill.path);
        try {
            await fs.rm(skillDir, { recursive: true, force: true });
            this.skillRegistry.unregister(id);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || String(err) };
        }
    }
}
