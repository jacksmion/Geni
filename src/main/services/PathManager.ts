import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { copyFile, mkdir, readdir, copyFile as fsCopyFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * PathManager - Unified path management service
 *
 * Responsibilities:
 * - Singleton pattern managing all application paths
 * - Auto-create directory structure
 * - Data migration from old paths
 */
export class PathManager {
    private static instance: PathManager;
    private rootDir: string;
    private sessionsDir: string;
    private globalSkillsDir: string;
    private builtinSkillsDir: string;
    private migrationMarkerFile: string;

    // Legacy paths (for migration)
    private legacyConfigDir: string;
    private legacySessionsDir: string;

    private constructor() {
        // Initialize paths after app is ready
        const userDataPath = app.getPath('userData');
        const appPath = app.getAppPath();

        // New unified structure: ~/.geni/
        this.rootDir = path.join(os.homedir(), '.geni');
        this.sessionsDir = path.join(this.rootDir, 'sessions');
        this.globalSkillsDir = path.join(this.rootDir, 'skills');
        // Built-in skills: {appRoot}/skills/ (app root in dev, or packaged app root in prod)
        this.builtinSkillsDir = path.join(appPath, 'skills');
        this.migrationMarkerFile = path.join(this.rootDir, '.migrated');

        // Legacy paths (for migration)
        this.legacyConfigDir = path.join(os.homedir(), '.assistant-core');
        this.legacySessionsDir = path.join(userDataPath, 'sessions');

        // Ensure directory structure exists
        this.ensureDirectories();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): PathManager {
        if (!PathManager.instance) {
            PathManager.instance = new PathManager();
        }
        return PathManager.instance;
    }

    /**
     * Ensure all required directories exist
     */
    private ensureDirectories(): void {
        const dirs = [
            this.rootDir,
            this.sessionsDir,
            this.globalSkillsDir
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    // ==================== Path Getters ====================

    /**
     * Get application root directory
     * @returns ~/.geni/
     */
    public getRootDir(): string {
        return this.rootDir;
    }

    /**
     * Get config file path
     * @returns ~/.geni/config.json
     */
    public getConfigFile(): string {
        return path.join(this.rootDir, 'config.json');
    }

    /**
     * Get sessions directory
     * @returns ~/.geni/sessions/
     */
    public getSessionsDir(): string {
        return this.sessionsDir;
    }

    /**
     * Get sessions index file path
     * @returns ~/.geni/sessions/index.json
     */
    public getSessionsIndexFile(): string {
        return path.join(this.sessionsDir, 'index.json');
    }

    /**
     * Get user skills directory
     * @returns ~/.geni/skills/
     */
    public getUserSkillsDir(): string {
        return this.globalSkillsDir;
    }

    /**
     * Get global skills directory
     * @returns ~/.geni/skills/
     */
    public getGlobalSkillsDir(): string {
        return this.globalSkillsDir;
    }

    /**
     * Get project skills directory
     * @param workspacePath - The workspace path
     * @returns {workspace}/.agent/skills/
     */
    public getProjectSkillsDir(workspacePath: string): string {
        return path.join(workspacePath, '.agent', 'skills');
    }

    /**
     * Get built-in skills directory
     * @returns {project}/skills/
     */
    public getBuiltinSkillsDir(): string {
        return this.builtinSkillsDir;
    }

    /**
     * Get all skills load paths (in priority order)
     * @param workspacePath - The workspace path for project skills
     * @returns [builtin, global, project] - project skills override global, global override builtin
     */
    public getSkillsLoadPaths(workspacePath: string): string[] {
        return [this.builtinSkillsDir, this.globalSkillsDir, this.getProjectSkillsDir(workspacePath)];
    }

    // ==================== Directory Existence Checks ====================

    /**
     * Check if built-in skills directory exists
     */
    public builtinSkillsExists(): boolean {
        return fs.existsSync(this.builtinSkillsDir);
    }

    /**
     * Check if global skills directory exists
     */
    public globalSkillsExists(): boolean {
        return fs.existsSync(this.globalSkillsDir);
    }

    /**
     * Check if project skills directory exists
     */
    public projectSkillsExists(workspacePath: string): boolean {
        return fs.existsSync(this.getProjectSkillsDir(workspacePath));
    }

    /**
     * Get skills load info (which directories exist)
     */
    public getSkillsLoadInfo(workspacePath: string): {
        builtin: { path: string; exists: boolean };
        global: { path: string; exists: boolean };
        project: { path: string; exists: boolean };
    } {
        return {
            builtin: { path: this.builtinSkillsDir, exists: this.builtinSkillsExists() },
            global: { path: this.globalSkillsDir, exists: this.globalSkillsExists() },
            project: { path: this.getProjectSkillsDir(workspacePath), exists: this.projectSkillsExists(workspacePath) }
        };
    }

    // ==================== Migration ====================

    /**
     * Check if migration is needed
     */
    public needsMigration(): boolean {
        // If migration marker exists, already migrated
        if (fs.existsSync(this.migrationMarkerFile)) {
            return false;
        }

        // Check if legacy data exists
        return this.legacyConfigExists() || this.legacySessionsExist();
    }

    /**
     * Get migration information
     */
    public getMigrationInfo(): {
        needsMigration: boolean;
        legacyConfigExists: boolean;
        legacySessionsExist: boolean;
        alreadyMigrated: boolean;
    } {
        return {
            needsMigration: this.needsMigration(),
            legacyConfigExists: this.legacyConfigExists(),
            legacySessionsExist: this.legacySessionsExist(),
            alreadyMigrated: fs.existsSync(this.migrationMarkerFile)
        };
    }

    /**
     * Perform data migration
     */
    public async migrate(): Promise<{
        success: boolean;
        details: {
            configMigrated: boolean;
            sessionsMigrated: boolean;
            sessionsCount: number;
            error?: string;
        };
    }> {
        try {
            let configMigrated = false;
            let sessionsMigrated = false;
            let sessionsCount = 0;

            // Migrate config file
            if (this.legacyConfigExists()) {
                const legacyConfigPath = path.join(this.legacyConfigDir, 'config.json');
                if (fs.existsSync(legacyConfigPath)) {
                    // Only migrate if new config doesn't exist
                    if (!fs.existsSync(this.getConfigFile())) {
                        fs.copyFileSync(legacyConfigPath, this.getConfigFile());
                        configMigrated = true;
                        console.log('[PathManager] Migrated config file:', legacyConfigPath, '->', this.getConfigFile());
                    } else {
                        console.log('[PathManager] Config already exists, skipping migration');
                    }
                }
            }

            // Migrate sessions
            if (this.legacySessionsExist()) {
                sessionsMigrated = true;
                const sessionFiles = await this.migrateSessions();
                sessionsCount = sessionFiles;
            }

            // Create migration marker
            fs.writeFileSync(this.migrationMarkerFile, JSON.stringify({
                migratedAt: new Date().toISOString(),
                configMigrated,
                sessionsMigrated,
                sessionsCount
            }, null, 2));

            return {
                success: true,
                details: {
                    configMigrated,
                    sessionsMigrated,
                    sessionsCount
                }
            };
        } catch (error: any) {
            console.error('[PathManager] Migration failed:', error);
            return {
                success: false,
                details: {
                    configMigrated: false,
                    sessionsMigrated: false,
                    sessionsCount: 0,
                    error: error.message
                }
            };
        }
    }

    /**
     * Check if legacy config exists
     */
    private legacyConfigExists(): boolean {
        const legacyConfigPath = path.join(this.legacyConfigDir, 'config.json');
        return fs.existsSync(legacyConfigPath);
    }

    /**
     * Check if legacy sessions exist
     */
    private legacySessionsExist(): boolean {
        return fs.existsSync(this.legacySessionsDir);
    }

    /**
     * Migrate sessions from legacy directory
     */
    private async migrateSessions(): Promise<number> {
        let migratedCount = 0;

        try {
            // Check if legacy sessions directory exists
            if (!fs.existsSync(this.legacySessionsDir)) {
                return 0;
            }

            const entries = await readdir(this.legacySessionsDir, { withFileTypes: true });

            for (const entry of entries) {
                const sourcePath = path.join(this.legacySessionsDir, entry.name);

                if (entry.isFile()) {
                    const destPath = path.join(this.sessionsDir, entry.name);

                    // Skip if already exists
                    if (fs.existsSync(destPath)) {
                        console.log('[PathManager] Session already exists, skipping:', entry.name);
                        continue;
                    }

                    // Copy file
                    await fsCopyFile(sourcePath, destPath);
                    migratedCount++;
                    console.log('[PathManager] Migrated session:', entry.name);
                }
            }

            // Migrate index file last
            const legacyIndexPath = path.join(this.legacySessionsDir, 'index.json');
            const newIndexpath = this.getSessionsIndexFile();

            if (fs.existsSync(legacyIndexPath) && !fs.existsSync(newIndexpath)) {
                fs.copyFileSync(legacyIndexPath, newIndexpath);
                console.log('[PathManager] Migrated sessions index');
            }

        } catch (error) {
            console.error('[PathManager] Failed to migrate sessions:', error);
        }

        return migratedCount;
    }
}
