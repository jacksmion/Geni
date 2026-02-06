import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import { Skill } from '../../../../common/types/skill';

/**
 * 技能读取工具 - 允许 Agent 按需加载技能的完整内容
 * 避免一次性将所有技能注入上下文导致 token 爆炸
 */
export class SkillReaderTool implements ITool {
    requireConfirmation = false; // 读取技能不需要用户确认

    private skills: Skill[] = [];

    constructor() { }

    /**
     * 动态更新可用技能列表
     */
    setSkills(skills: Skill[]) {
        this.skills = skills;
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'read_skill',
            description: `Read the full content of a skill to understand its detailed instructions.
Use this when you need to apply a specific skill's methodology or follow its guidelines.
Available skills: ${this.skills.filter(s => s.enabled).map(s => s.id).join(', ') || 'none'}`,
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

        // 查找技能
        const skill = this.skills.find(s => s.id === skillId);

        if (!skill) {
            const availableSkills = this.skills.map(s => s.id).join(', ');
            return {
                toolName: 'read_skill',
                isError: true,
                result: `Skill "${skillId}" not found. Available skills: ${availableSkills || 'none'}`
            };
        }

        if (!skill.enabled) {
            return {
                toolName: 'read_skill',
                isError: true,
                result: `Skill "${skillId}" is disabled. Please enable it in settings first.`
            };
        }

        // 返回技能完整内容
        return {
            toolName: 'read_skill',
            isError: false,
            result: `# Skill: ${skill.name}\n\n${skill.content}`
        };
    }
}
