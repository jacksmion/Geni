import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { ConfigManager } from '@/main/services/ConfigManager';
import { PathManager } from '@/main/services/PathManager';
import { AppSettings, DEFAULT_SETTINGS } from '@/common/types/settings';

// Mock fs and PathManager
vi.mock('fs');

describe('ConfigManager', () => {
    let mockPathManager: PathManager;
    const MOCK_CONFIG_FILE = '/mock/root/.geni/config.json';
    const MOCK_CONFIG_DIR = '/mock/root/.geni';

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup PathManager Mock
        mockPathManager = {
            getConfigFile: vi.fn().mockReturnValue(MOCK_CONFIG_FILE)
        } as unknown as PathManager;

        // Common existsSync mock for constructor testing
        vi.mocked(fs.existsSync).mockImplementation((path) => {
            if (path === MOCK_CONFIG_DIR) return true;
            return false;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should create directory if it does not exist', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false); // Make dir check fail
            const mkdirSyncSpy = vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

            new ConfigManager(mockPathManager);

            expect(fs.existsSync).toHaveBeenCalledWith(MOCK_CONFIG_DIR);
            expect(mkdirSyncSpy).toHaveBeenCalledWith(MOCK_CONFIG_DIR, { recursive: true });
        });

        it('should not create directory if it exists', () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => p === MOCK_CONFIG_DIR);
            const mkdirSyncSpy = vi.mocked(fs.mkdirSync);

            new ConfigManager(mockPathManager);

            expect(mkdirSyncSpy).not.toHaveBeenCalled();
        });
    });

    describe('load', () => {
        it('should return DEFAULT_SETTINGS if file does not exist', () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => p === MOCK_CONFIG_DIR); // file exists is false

            const configManager = new ConfigManager(mockPathManager);
            const settings = configManager.load();

            expect(settings).toEqual(DEFAULT_SETTINGS);
        });

        it('should merge DEFAULT_SETTINGS with parsed JSON if file exists', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
                theme: 'light',
                newCustomProp: 'hello' // testing merging properties
            }));

            const configManager = new ConfigManager(mockPathManager);
            const settings = configManager.load();

            expect(settings.theme).toBe('light');
            // Ensure other default settings are preserved
            expect(settings.language).toBe(DEFAULT_SETTINGS.language);
            expect((settings as any).newCustomProp).toBe('hello');
        });

        it('should return DEFAULT_SETTINGS and catch error if JSON parsing fails', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue('invalid-json-string');
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            const configManager = new ConfigManager(mockPathManager);
            const settings = configManager.load();

            expect(settings).toEqual(DEFAULT_SETTINGS);
            expect(consoleErrorSpy).toHaveBeenCalled();
        });
    });

    describe('save', () => {
        it('should write JSON payload properly', () => {
            const writeFileSyncSpy = vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

            const configManager = new ConfigManager(mockPathManager);
            const newSettings: AppSettings = { ...DEFAULT_SETTINGS, theme: 'dark' };

            configManager.save(newSettings);

            expect(writeFileSyncSpy).toHaveBeenCalledWith(
                MOCK_CONFIG_FILE,
                JSON.stringify(newSettings, null, 2)
            );
        });

        it('should catch errors when saving fails', () => {
            vi.mocked(fs.writeFileSync).mockImplementation(() => {
                throw new Error('EACCES: permission denied');
            });
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            const configManager = new ConfigManager(mockPathManager);
            configManager.save(DEFAULT_SETTINGS);

            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save config:', expect.any(Error));
        });
    });
});
