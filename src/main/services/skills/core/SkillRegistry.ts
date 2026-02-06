import fs from 'node:fs/promises';
import path from 'node:path';
import { SkillObject, SkillParser } from './SkillParser';

export class SkillRegistry {
    private skills: Map<string, SkillObject> = new Map();

    register(skill: SkillObject) {
        if (this.skills.has(skill.id)) {
            console.warn(`Skill with id ${skill.id} already registered. Overwriting.`);
        }
        this.skills.set(skill.id, skill);
    }

    get(id: string): SkillObject | undefined {
        return this.skills.get(id);
    }

    getAll(): SkillObject[] {
        return Array.from(this.skills.values());
    }

    /**
     * Scans a directory for SKILL.md files and registers them.
     * Assumes skills are located in subdirectories or the directory itself contains SKILL.md
     * Recursive search to find all SKILL.md files.
     */
    async loadFromDirectory(directoryPath: string) {
        try {
            const entries = await fs.readdir(directoryPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directoryPath, entry.name);

                if (entry.isDirectory()) {
                    // Recursively search
                    await this.loadFromDirectory(fullPath);
                } else if (entry.isFile() && entry.name === 'SKILL.md') {
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const skill = SkillParser.parse(content, fullPath);
                        this.register(skill);
                    } catch (e) {
                        console.error(`Failed to parse skill at ${fullPath}:`, e);
                    }
                }
            }
        } catch (error) {
            console.error(`Error loading skills from ${directoryPath}:`, error);
        }
    }
}
