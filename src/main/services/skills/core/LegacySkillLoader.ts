/**
 * LegacySkillLoader.ts - 旧版技能加载器
 * 
 * 重构说明:
 * - 原文件: services/SkillLoader.ts
 * - 此文件为旧版实现，保留用于兼容性
 * 
 * @deprecated 此类将在 Phase 3 (Skill System 2.0) 中被以下组件取代:
 *  - SkillParser.ts (解析 SKILL.md)
 *  - SkillRegistry.ts (技能注册中心)
 *  - SkillReader.ts (运行时技能读取工具)
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Skill, ToolDefinition } from '../../../../common/types/skill';

export class LegacySkillLoader {
    private skillsDir: string;

    constructor(skillsDir: string) {
        this.skillsDir = skillsDir;
    }

    /**
     * 扫描技能目录并加载所有 SKILL.md
     * 遵循 Claude Skills 规范，解析 YAML frontmatter
     */
    public async loadSkills(): Promise<Skill[]> {
        if (!fs.existsSync(this.skillsDir)) {
            return [];
        }

        const skillFolders = fs.readdirSync(this.skillsDir);
        const skills: Skill[] = [];

        for (const folder of skillFolders) {
            const folderPath = path.join(this.skillsDir, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;

            const skillMainFile = path.join(folderPath, 'SKILL.md');
            if (fs.existsSync(skillMainFile)) {
                const content = fs.readFileSync(skillMainFile, 'utf8');
                const parsed = matter(content);

                // 提取 YAML 元数据
                const { name, description } = parsed.data;

                if (name && description) {
                    skills.push({
                        id: folder,
                        name: name,
                        description: description,
                        content: parsed.content.trim(), // Markdown 内容（不含 frontmatter）
                        path: folderPath,
                        enabled: true,
                        trustLevel: 'Ask'
                    });
                }
            }
        }

        return skills;
    }

    /**
     * 将技能列表映射为 LLM 可理解的 Tool Definitions
     */
    public convertToTools(skills: Skill[]): ToolDefinition[] {
        return skills.map(skill => ({
            type: 'function',
            function: {
                name: skill.id, // 使用目录名作为函数名，确保唯一性
                description: skill.description,
                parameters: {
                    type: 'object',
                    properties: {
                        // 基础实现：由于是动态加载，参数定义可以根据 manifest 进一步细化
                        // 目前默认提供一个 args 字符串或脚本参数
                        arguments: {
                            type: 'string',
                            description: 'Skill 执行所需的参数，通常为 JSON 格式或命令字符串'
                        }
                    },
                    required: ['arguments']
                }
            }
        }));
    }
}

// 向后兼容: 保留旧类名导出别名
export { LegacySkillLoader as SkillLoader };
