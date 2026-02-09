import fs from 'node:fs/promises';
import path from 'node:path';
import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import { SkillRegistry } from '../../skills/core/SkillRegistry';
import { ConfigManager } from '../../ConfigManager';

/**
 * Skill Loader Tool
 * Allows the Agent to lazily load full skill content and discover associated resources.
 */
export class SkillLoaderTool implements ITool {
    requireConfirmation = false;

    constructor(
        private skillRegistry: SkillRegistry,
        private configManager: ConfigManager
    ) { }

    getDefinition(): ToolDefinition {
        // Get enabled skills for the description
        const allSkills = this.skillRegistry.getAll();
        const settings = this.configManager.load();
        const skillSettings = settings.skillSettings || {};

        const enabledSkills = allSkills.filter(s => {
            const saved = skillSettings[s.id];
            return saved ? saved.enabled : true; // Default true
        });

        const skillListLines = enabledSkills.map(s => `  - **${s.id}**: ${s.description}`);

        const description = [
            "Load a specialized skill that provides domain-specific instructions and workflows.",
            "",
            "When you recognize that a task matches one of the available skills listed below, use this tool to load the full skill instructions.",
            "",
            "The skill will inject detailed instructions, workflows, and access to bundled resources (scripts, references, templates) into the conversation context.",
            "",
            "TOOL OUTPUT includes a `<skill_content name=\"...\">` block with the loaded content.",
            "",
            "### Available Skills:",
            ...skillListLines,
            "",
            "**Usage**: Call this tool with the skill ID to access its full potential."
        ].join('\n');

        return {
            name: 'load_skill',
            description,
            input_schema: {
                type: 'object',
                properties: {
                    skill_id: {
                        type: 'string',
                        description: 'The ID of the skill to load (e.g., "brainstorming", "systematic-debugging")'
                    }
                },
                required: ['skill_id']
            }
        };
    }

    async execute(input: { skill_id: string }): Promise<ToolExecutionResult> {
        const skillId = input.skill_id;
        const skill = this.skillRegistry.get(skillId);

        if (!skill) {
            const allSkills = this.skillRegistry.getAll();
            const ids = allSkills.map(s => s.id).join(', ');
            return {
                toolName: 'load_skill',
                isError: true,
                result: `Skill "${skillId}" not found. Registered skills: ${ids || 'none'}`
            };
        }

        const settings = this.configManager.load();
        const saved = (settings.skillSettings || {})[skillId];
        const isEnabled = saved ? saved.enabled : true;

        if (!isEnabled) {
            return {
                toolName: 'load_skill',
                isError: true,
                result: `Skill "${skillId}" is disabled. Please enable it in settings first.`
            };
        }

        // Discover associated files if skill path is known
        let filesList = '';
        let baseDir = '';
        if (skill.path) {
            try {
                const dir = path.dirname(skill.path);
                baseDir = dir;
                const entries = await fs.readdir(dir, { withFileTypes: true });
                const files = entries
                    .filter(e => e.name !== 'SKILL.md')
                    .map(e => `  - ${e.isDirectory() ? e.name + '/' : e.name}`)
                    .slice(0, 15); // Sample top 15 entries

                if (files.length > 0) {
                    filesList = [
                        "\n### Associated Resources (sampled):",
                        ...files,
                        files.length >= 15 ? "  - ... (more files available)" : ""
                    ].join('\n');
                }
            } catch (error) {
                console.warn(`Failed to list files for skill ${skillId}:`, error);
            }
        }

        // Return structured skill content
        const output = [
            `<skill_content name="${skillId}">`,
            `# Skill: ${skill.name}`,
            "",
            skill.instruction.trim(),
            "",
            baseDir ? `Base directory for this skill: ${baseDir}` : "",
            baseDir ? "Relative paths in this skill instructions (e.g., scripts/, resources/) are relative to this base directory." : "",
            filesList,
            "</skill_content>"
        ].join('\n');

        return {
            toolName: 'load_skill',
            isError: false,
            result: output
        };
    }
}
