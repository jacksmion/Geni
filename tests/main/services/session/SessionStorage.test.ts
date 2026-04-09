import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { SessionStorage } from '@/main/services/session/SessionStorage';
import { PathManager } from '@/main/services/PathManager';
import { ChatSession, SessionMeta } from '@/common/types/chat';

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        default: {
            ...actual,
            existsSync: vi.fn().mockReturnValue(true),
            mkdirSync: vi.fn()
        },
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        promises: {
            ...actual.promises,
            writeFile: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockResolvedValue('[]'),
            rename: vi.fn().mockResolvedValue(undefined),
            readdir: vi.fn().mockResolvedValue([]),
            unlink: vi.fn().mockResolvedValue(undefined)
        }
    };
});

import * as fs from 'fs';

describe('SessionStorage', () => {
    let mockPathManager: PathManager;
    const MOCK_STORAGE_DIR = '/mock/sessions';
    const MOCK_INDEX_FILE = '/mock/sessions/index.json';

    beforeEach(() => {
        vi.clearAllMocks();
        mockPathManager = {
            getSessionsDir: vi.fn().mockReturnValue(MOCK_STORAGE_DIR),
            getSessionsIndexFile: vi.fn().mockReturnValue(MOCK_INDEX_FILE)
        } as unknown as PathManager;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should initialize without error', () => {
        expect(() => new SessionStorage(mockPathManager)).not.toThrow();
    });

    describe('getIndex', () => {
        it('should return empty array by default', async () => {
            const sessionStorage = new SessionStorage(mockPathManager);
            const index = await sessionStorage.getIndex();
            expect(index).toEqual([]);
        });
    });

    describe('saveSession', () => {
        it('should save session without error', async () => {
            const sessionStorage = new SessionStorage(mockPathManager);
            const mockSession: ChatSession = {
                id: 'test-session',
                title: 'Test',
                createdAt: 100,
                updatedAt: 200,
                messages: [],
                variables: {},
                activeSkillIds: []
            };

            const result = await sessionStorage.saveSession(mockSession);
            expect(result).toBe(true);
        });
    });
});
