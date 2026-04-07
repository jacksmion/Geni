import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '@/main/services/ConfigManager';
import { PathManager } from '@/main/services/PathManager';
import { DEFAULT_SETTINGS } from '@/common/types/settings';

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        default: {
            ...actual,
            existsSync: vi.fn().mockReturnValue(true),
            mkdirSync: vi.fn(),
            readFileSync: vi.fn()
        },
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        readFileSync: vi.fn()
    };
});

describe('ConfigManager', () => {
    let mockPathManager: PathManager;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPathManager = {
            getConfigFile: vi.fn().mockReturnValue('/mock/config.json')
        } as unknown as PathManager;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('load', () => {
        it('should return default settings when config file does not exist', () => {
            const configManager = new ConfigManager(mockPathManager);
            const settings = configManager.load();
            expect(settings).toBeDefined();
            expect(settings.language).toBe(DEFAULT_SETTINGS.language);
        });
    });

    describe('save', () => {
        it('should not throw when saving', () => {
            const configManager = new ConfigManager(mockPathManager);
            expect(() => configManager.save(DEFAULT_SETTINGS)).not.toThrow();
        });
    });
});
