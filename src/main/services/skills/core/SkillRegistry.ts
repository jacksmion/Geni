import fs from 'node:fs/promises';
import path from 'node:path';
import { SkillObject, SkillParser } from './SkillParser';
import { existsSync } from 'fs';
export type SkillSource = 'builtin' | 'global' | 'project' | 'dotAgents';

export class SkillRegistry {
    private skills: Map<string, SkillObject> = new Map();
    private skillSources: Map<string, SkillSource> = new Map();

    register(skill: SkillObject, source: SkillSource = 'global') {
        const existingSource = this.skillSources.get(skill.id);
        if (existingSource && existingSource !== source) {
            console.debug(`[SkillRegistry] Overriding skill ${skill.id} from ${existingSource} with ${source}`);
        }
        this.skills.set(skill.id, skill);
        this.skillSources.set(skill.id, source);
    }

    get(id: string): SkillObject | undefined {
        return this.skills.get(id);
    }

    /**
     * Get the source of a skill (builtin, global, or project)
     */
    getSource(id: string): SkillSource | undefined {
        return this.skillSources.get(id);
    }

    getAll(): SkillObject[] {
        return Array.from(this.skills.values());
    }

    /**
     * Get all skills by source
     */
    getBySource(source: SkillSource): SkillObject[] {
        return Array.from(this.skills.entries())
            .filter(([id]) => this.skillSources.get(id) === source)
            .map(([, skill]) => skill);
    }

    /**
     * Scans a directory for SKILL.md files and registers them.
     * Assumes skills are located in subdirectories or the directory itself contains SKILL.md
     * Recursive search to find all SKILL.md files.
     */
    async loadFromDirectory(directoryPath: string, source: SkillSource = 'global') {
        // Check if directory exists first to avoid ENOENT errors
        if (!existsSync(directoryPath)) {
            console.debug(`[SkillRegistry] Directory does not exist, skipping: ${directoryPath}`);
            return;
        }

        try {
            const entries = await fs.readdir(directoryPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directoryPath, entry.name);

                if (entry.isDirectory()) {
                    // Recursively search
                    await this.loadFromDirectory(fullPath, source);
                } else if (entry.isFile() && entry.name === 'SKILL.md') {
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const skill = SkillParser.parse(content, fullPath);
                        this.register(skill, source);
                    } catch (e) {
                        console.error(`Failed to parse skill at ${fullPath}:`, e);
                    }
                }
            }
        } catch (error: any) {
            // Handle ENOENT gracefully (directory may have been deleted between check and read)
            if (error.code === 'ENOENT') {
                console.debug(`[SkillRegistry] Directory no longer exists, skipping: ${directoryPath}`);
            } else {
                console.error(`Error loading skills from ${directoryPath}:`, error);
            }
        }
    }

    /**
     * Load skills from multiple directories
     * @param directories Array of [directoryPath, source] tuples
     */
    async loadFromDirectories(directories: Array<{ path: string; source: SkillSource }>) {
        for (const { path: directoryPath, source } of directories) {
            await this.loadFromDirectory(directoryPath, source);
        }
    }

    /**
     * Remove a specific skill by id
     */
    unregister(id: string): boolean {
        const deleted = this.skills.delete(id);
        this.skillSources.delete(id);
        return deleted;
    }

    /**
     * Remove all skills from a specific source
     * @param source - The source to remove skills from
     */
    removeBySource(source: SkillSource): void {
        const skillsToRemove: string[] = [];
        for (const [id, src] of this.skillSources.entries()) {
            if (src === source) {
                skillsToRemove.push(id);
            }
        }
        for (const id of skillsToRemove) {
            this.skills.delete(id);
            this.skillSources.delete(id);
        }
        console.debug(`[SkillRegistry] Removed ${skillsToRemove.length} skills from source: ${source}`);
    }
}
