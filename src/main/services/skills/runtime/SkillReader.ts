import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import { SkillRegistry } from '../core/SkillRegistry';

export class SkillReader implements ITool {
    requireConfirmation = false;

    constructor(private registry: SkillRegistry) { }

    getDefinition(): ToolDefinition {
        const skills = this.registry.getAll();
        const skillList = skills.length > 0
            ? skills.map(s => `${s.name} (${s.id})`).join(', ')
            : 'No skills loaded yet';

        return {
            name: 'read_skill',
            description: `Read the detailed instruction/content of a specific skill. 
Use this tool when you know a skill exists (from system prompt) but need its full specialized instruction to proceed.
Available skills: ${skillList}`,
            input_schema: {
                type: 'object',
                properties: {
                    skill_name: {
                        type: 'string',
                        description: 'The id of the skill to read'
                    }
                },
                required: ['skill_name']
            }
        };
    }

    async execute(input: { skill_name: string }): Promise<ToolExecutionResult> {
        const skillId = input.skill_name;
        const skill = this.registry.get(skillId);

        if (!skill) {
            return {
                toolName: 'read_skill',
                isError: true,
                result: `Skill "${skillId}" not found.`
            };
        }

        return {
            toolName: 'read_skill',
            isError: false,
            result: skill.instruction
        };
    }
}
