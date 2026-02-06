import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import { SkillRegistry } from '../../skills/core/SkillRegistry';
import { ConfigManager } from '../../ConfigManager';

/**
 * Skill Reader Tool
 * Allows the Agent to lazily load full skill content.
 */
export class SkillReaderTool implements ITool {
    requireConfirmation = false;

    constructor(
        private skillRegistry: SkillRegistry,
        private configManager: ConfigManager
    ) { }

    getDefinition(): ToolDefinition {
        // Get enabled skills for the hint
        const allSkills = this.skillRegistry.getAll();
        const settings = this.configManager.load();
        const skillSettings = settings.skillSettings || {};

        const enabledIds = allSkills.filter(s => {
            const saved = skillSettings[s.id];
            return saved ? saved.enabled : true; // Default true
        }).map(s => s.id);

        return {
            name: 'read_skill',
            description: `Read the full content of a skill to understand its detailed instructions.
Use this when you need to apply a specific skill's methodology or follow its guidelines.
Available skills: ${enabledIds.join(', ') || 'none'}`,
            input_schema: {
                type: 'object',
                properties: {
                    skill_id: {
                        type: 'string',
                        description: 'The ID of the skill to read (e.g., "brainstorming", "python-exec")'
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
                toolName: 'read_skill',
                isError: true,
                result: `Skill "${skillId}" not found. Registered skills: ${ids || 'none'}`
            };
        }

        const settings = this.configManager.load();
        const saved = (settings.skillSettings || {})[skillId];
        const isEnabled = saved ? saved.enabled : true;

        if (!isEnabled) {
            return {
                toolName: 'read_skill',
                isError: true,
                result: `Skill "${skillId}" is disabled. Please enable it in settings first.`
            };
        }

        // Return skill content (instruction)
        return {
            toolName: 'read_skill',
            isError: false,
            result: `# Skill: ${skill.name}\n\n${skill.instruction}`
        };
    }
}
