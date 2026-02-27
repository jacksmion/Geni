import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { PathManager } from '@/main/services/PathManager';

vi.mock('fs');
vi.mock('os');
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(),
        getAppPath: vi.fn()
    }
}));

describe('PathManager', () => {
    const MOCK_HOMEDIR = '/mock/home/user';
    const MOCK_USER_DATA = '/mock/app/userData';
    const MOCK_APP_PATH = '/mock/app/root';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(os.homedir).mockReturnValue(MOCK_HOMEDIR);
        vi.mocked(app.getPath).mockReturnValue(MOCK_USER_DATA);
        vi.mocked(app.getAppPath).mockReturnValue(MOCK_APP_PATH);

        // By default assume no directories exist to test creation
        vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should initialize and create core directories if missing', () => {
        const mkdirSyncSpy = vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
        const pathManager = new PathManager();

        const rootDir = path.join(MOCK_HOMEDIR, '.geni');
        const sessionsDir = path.join(rootDir, 'sessions');
        const skillsDir = path.join(rootDir, 'skills');

        expect(pathManager.getRootDir()).toBe(rootDir);
        expect(pathManager.getSessionsDir()).toBe(sessionsDir);
        expect(pathManager.getGlobalSkillsDir()).toBe(skillsDir);

        expect(mkdirSyncSpy).toHaveBeenCalledWith(rootDir, { recursive: true });
        expect(mkdirSyncSpy).toHaveBeenCalledWith(sessionsDir, { recursive: true });
        expect(mkdirSyncSpy).toHaveBeenCalledWith(skillsDir, { recursive: true });
    });

    it('should correctly prioritize skill load paths', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true); // Mock dirs existing
        const pathManager = new PathManager();
        const workspace = '/mock/workspace';

        const loadPaths = pathManager.getSkillsLoadPaths(workspace);

        expect(loadPaths.length).toBe(3);
        expect(loadPaths[0]).toBe(path.join(MOCK_APP_PATH, 'skills')); // Builtin
        expect(loadPaths[1]).toBe(path.join(MOCK_HOMEDIR, '.geni', 'skills')); // Global
        expect(loadPaths[2]).toBe(path.join(workspace, '.agent', 'skills')); // Project
    });

    describe('Migration Tracking', () => {
        it('needsMigration should return false if migration marker exists', () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => {
                // Return true only for the .migrated marker
                return String(p).endsWith('.migrated');
            });

            const pathManager = new PathManager();
            expect(pathManager.needsMigration()).toBe(false);
        });

        it('needsMigration should return true if legacy config exists', () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => {
                // Return true only for the legacy config
                return String(p).includes('.assistant-core') && String(p).endsWith('config.json');
            });

            const pathManager = new PathManager();
            expect(pathManager.needsMigration()).toBe(true);
        });
    });
});
