import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import { SkillParser } from './core/SkillParser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ImportAction = 'overwrite' | 'skip' | 'rename';

export interface ImportResult {
    status: 'success' | 'conflict' | 'error';
    skillName?: string;
    targetPath?: string;
    sourceTempDir?: string;
    error?: string;
}

export interface ConfirmResult {
    status: 'success' | 'error';
    skillName?: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// SkillImportService
// ---------------------------------------------------------------------------

export class SkillImportService {
    private globalSkillsDir: string;

    constructor(globalSkillsDir: string) {
        this.globalSkillsDir = globalSkillsDir;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Main import entry point.
     *
     * Accepts a folder path, .zip file, or .skill file.  Validates the
     * contained SKILL.md and checks for conflicts with existing skills.
     *
     * - No conflict  → status "success", skill already copied.
     * - Conflict     → status "conflict"; caller should prompt the user and
     *                   then call `confirmImport`.
     * - Error        → status "error" with descriptive message.
     */
    async importSkill(sourcePath: string): Promise<ImportResult> {
        try {
            if (!existsSync(sourcePath)) {
                return { status: 'error', error: `Source path does not exist: ${sourcePath}` };
            }

            const stat = await fs.stat(sourcePath);
            let skillDir: string;
            let tempDir: string | undefined;

            if (stat.isDirectory()) {
                skillDir = sourcePath;
            } else if (stat.isFile()) {
                const ext = path.extname(sourcePath).toLowerCase();
                if (ext === '.zip' || ext === '.skill') {
                    const extractResult = this.extractZip(sourcePath);
                    tempDir = extractResult.tempDir;
                    skillDir = extractResult.skillDir;
                } else {
                    return { status: 'error', error: `Unsupported file type: ${ext}. Only .zip and .skill files are supported.` };
                }
            } else {
                return { status: 'error', error: 'Source path is neither a file nor a directory.' };
            }

            // Validate SKILL.md exists and is parseable
            const skillMdPath = path.join(skillDir, 'SKILL.md');
            if (!existsSync(skillMdPath)) {
                await this.cleanup(tempDir);
                return { status: 'error', error: 'No SKILL.md found. The source does not appear to be a valid skill.' };
            }

            let skillName: string;
            try {
                const content = await fs.readFile(skillMdPath, 'utf-8');
                const skill = SkillParser.parse(content, skillMdPath);
                skillName = this.sanitizeName(skill.name);
            } catch (err: any) {
                await this.cleanup(tempDir);
                return { status: 'error', error: `Invalid SKILL.md: ${err.message}` };
            }

            if (!skillName) {
                await this.cleanup(tempDir);
                return { status: 'error', error: 'Skill name is empty after sanitization.' };
            }

            // Check for conflicts
            const targetPath = path.join(this.globalSkillsDir, skillName);
            if (existsSync(targetPath)) {
                return {
                    status: 'conflict',
                    skillName,
                    targetPath,
                    sourceTempDir: tempDir ?? sourcePath,
                };
            }

            // No conflict — copy and clean up
            await this.copySkillDir(skillDir, targetPath);
            await this.cleanup(tempDir);

            return { status: 'success', skillName };
        } catch (err: any) {
            return { status: 'error', error: err.message || String(err) };
        }
    }

    /**
     * Resolve a conflict reported by `importSkill`.
     */
    async confirmImport(
        originalSourcePath: string,
        sourceTempDir: string | undefined,
        skillName: string,
        action: ImportAction,
    ): Promise<ConfirmResult> {
        try {
            const targetPath = path.join(this.globalSkillsDir, skillName);

            switch (action) {
                case 'skip':
                    if (sourceTempDir && sourceTempDir !== originalSourcePath) {
                        await this.cleanup(sourceTempDir);
                    }
                    return { status: 'success', skillName };

                case 'overwrite':
                    if (existsSync(targetPath)) {
                        await fs.rm(targetPath, { recursive: true, force: true });
                    }
                    break;

                case 'rename': {
                    skillName = this.findAvailableName(skillName, this.globalSkillsDir);
                    break;
                }
            }

            // Determine the actual skill directory
            let skillDir: string;
            const searchDir = sourceTempDir || originalSourcePath;

            if (existsSync(path.join(searchDir, 'SKILL.md'))) {
                skillDir = searchDir;
            } else {
                // The ZIP may have produced a single top-level directory
                const entries = await fs.readdir(searchDir, { withFileTypes: true });
                const subDir = entries.find(e => e.isDirectory() && existsSync(path.join(searchDir, e.name, 'SKILL.md')));
                if (subDir) {
                    skillDir = path.join(searchDir, subDir.name);
                } else if (existsSync(path.join(originalSourcePath, 'SKILL.md'))) {
                    skillDir = originalSourcePath;
                } else {
                    return { status: 'error', error: 'Cannot locate SKILL.md in source directory.' };
                }
            }

            const finalTargetPath = path.join(this.globalSkillsDir, skillName);
            await this.copySkillDir(skillDir, finalTargetPath);

            // Clean up temp dir
            if (sourceTempDir && sourceTempDir !== originalSourcePath) {
                await this.cleanup(sourceTempDir);
            }

            return { status: 'success', skillName };
        } catch (err: any) {
            return { status: 'error', error: err.message || String(err) };
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private extractZip(zipPath: string): { tempDir: string; skillDir: string } {
        const tempDir = path.join(os.tmpdir(), `geni-skill-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tempDir, true);

        // Check the actual filesystem: if SKILL.md is directly in tempDir, use it
        if (existsSync(path.join(tempDir, 'SKILL.md'))) {
            return { tempDir, skillDir: tempDir };
        }

        // Otherwise look for a single subdirectory containing SKILL.md
        const entries = readdirSync(tempDir, { withFileTypes: true });
        const subDirs = entries.filter((e: import('node:fs').Dirent) => e.isDirectory());
        if (subDirs.length === 1 && existsSync(path.join(tempDir, subDirs[0].name, 'SKILL.md'))) {
            return { tempDir, skillDir: path.join(tempDir, subDirs[0].name) };
        }

        // Fallback: return tempDir and let validation catch missing SKILL.md
        return { tempDir, skillDir: tempDir };
    }

    private async copySkillDir(source: string, target: string): Promise<void> {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.cp(source, target, { recursive: true });
    }

    private async cleanup(tempDir: string | undefined): Promise<void> {
        if (!tempDir) return;
        try {
            if (existsSync(tempDir)) {
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        } catch {
            // Best-effort cleanup
        }
    }

    private sanitizeName(name: string): string {
        return name
            .replace(/[<>:"/\\|?*\s]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase();
    }

    private findAvailableName(baseName: string, parentDir: string): string {
        if (!existsSync(path.join(parentDir, baseName))) {
            return baseName;
        }

        let index = 1;
        while (existsSync(path.join(parentDir, `${baseName}-${index}`))) {
            index++;
        }
        return `${baseName}-${index}`;
    }
}
