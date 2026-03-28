import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';

/**
 * PathManager - Unified path management service
 *
 * Responsibilities:
 * - Singleton pattern managing all application paths
 * - Auto-create directory structure
 */
export class PathManager {
    private rootDir: string;
    private logsDir: string;
    private sessionsDir: string;
    private schedulerDir: string;
    private globalSkillsDir: string;
    private builtinSkillsDir: string;
    private dotAgentsDir: string;

    constructor() {
        // Initialize paths after app is ready
        const appPath = app.getAppPath();

        // New unified structure: ~/.geni/
        this.rootDir = path.join(os.homedir(), '.geni');
        this.logsDir = path.join(this.rootDir, 'logs');
        this.sessionsDir = path.join(this.rootDir, 'sessions');
        this.schedulerDir = path.join(this.rootDir, 'scheduler');
        this.globalSkillsDir = path.join(this.rootDir, 'skills');
        // Built-in skills: {appRoot}/skills/ in dev, or {resources}/skills/ in prod
        if (app.isPackaged) {
            this.builtinSkillsDir = path.join(process.resourcesPath, 'skills');
        } else {
            this.builtinSkillsDir = path.join(appPath, 'skills');
        }
        // Legacy external agents directory
        this.dotAgentsDir = path.join(os.homedir(), '.agents', 'skills');

        // Ensure directory structure exists
        this.ensureDirectories();
    }

    /**
     * Ensure all required directories exist
     */
    private ensureDirectories(): void {
        const dirs = [
            this.rootDir,
            this.logsDir,
            this.sessionsDir,
            this.schedulerDir,
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
     * Get logs directory
     * @returns ~/.geni/logs/
     */
    public getLogsDir(): string {
        return this.logsDir;
    }

    /**
     * Get config file path
     * @returns ~/.geni/config.json
     */
    public getConfigFile(): string {
        return path.join(this.rootDir, 'config.json');
    }

    /**
     * Get memory file path
     * @returns ~/.geni/memory.md
     */
    public getMemoryFile(): string {
        return path.join(this.rootDir, 'memory.md');
    }

    /**
     * Get usage statistics file path
     * @returns ~/.geni/usage.json
     */
    public getUsageFile(): string {
        return path.join(this.rootDir, 'usage.json');
    }

    /**
     * Get sessions directory
     * @returns ~/.geni/sessions/
     */
    public getSessionsDir(): string {
        return this.sessionsDir;
    }

    /**
     * Get scheduler data directory
     * @returns ~/.geni/scheduler/
     */
    public getSchedulerDir(): string {
        return this.schedulerDir;
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
     * @returns [builtin, dotAgents, global, project]
     */
    public getSkillsLoadPaths(workspacePath: string): string[] {
        return [this.builtinSkillsDir, this.dotAgentsDir, this.globalSkillsDir, this.getProjectSkillsDir(workspacePath)];
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
     * Check if .agents directory exists
     */
    public dotAgentsExists(): boolean {
        return fs.existsSync(this.dotAgentsDir);
    }

    /**
     * Get skills load info (which directories exist)
     */
    public getSkillsLoadInfo(workspacePath: string): {
        builtin: { path: string; exists: boolean };
        global: { path: string; exists: boolean };
        dotAgents: { path: string; exists: boolean };
        project: { path: string; exists: boolean };
    } {
        return {
            builtin: { path: this.builtinSkillsDir, exists: this.builtinSkillsExists() },
            global: { path: this.globalSkillsDir, exists: this.globalSkillsExists() },
            dotAgents: { path: this.dotAgentsDir, exists: this.dotAgentsExists() },
            project: { path: this.getProjectSkillsDir(workspacePath), exists: this.projectSkillsExists(workspacePath) }
        };
    }
}
