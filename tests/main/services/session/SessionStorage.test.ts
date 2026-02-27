import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SessionStorage } from '@/main/services/session/SessionStorage';
import { PathManager } from '@/main/services/PathManager';
import { ChatSession, SessionMeta } from '@/common/types/chat';

vi.mock('fs');

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

        vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should initialize and create storage dir if not exists', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false); // Simulate dir not existing
        const mkdirSyncSpy = vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

        new SessionStorage(mockPathManager);

        expect(mkdirSyncSpy).toHaveBeenCalledWith(MOCK_STORAGE_DIR, { recursive: true });
    });

    describe('saveSession & updateIndex', () => {
        it('should write stringified JSON cleanly to session file', () => {
            const writeFileSyncSpy = vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
            const sessionStorage = new SessionStorage(mockPathManager);

            // Mock empty index to simplify index update logic for this test
            vi.mocked(fs.readFileSync).mockReturnValue('[]');

            const mockSession: ChatSession = {
                id: 'sess-123',
                title: 'Test',
                createdAt: 100,
                updatedAt: 200,
                messages: [{ id: 'msg1', role: 'user', content: 'hello', timestamp: 150 }],
                variables: {},
                activeSkillIds: []
            };

            const result = sessionStorage.saveSession(mockSession);

            expect(result).toBe(true);

            // Verify session file write
            expect(writeFileSyncSpy).toHaveBeenCalledWith(
                path.join(MOCK_STORAGE_DIR, 'sess-123.json'),
                JSON.stringify(mockSession, null, 2),
                'utf8'
            );

            // Verify index update
            const writeIndexCall = writeFileSyncSpy.mock.calls.find(call => call[0] === MOCK_INDEX_FILE);
            expect(writeIndexCall).toBeDefined();
            const indexDataStr = writeIndexCall![1] as string;
            const indexData = JSON.parse(indexDataStr) as SessionMeta[];
            expect(indexData.length).toBe(1);
            expect(indexData[0].id).toBe('sess-123');
            expect(indexData[0].preview).toBe('hello');
        });
    });

    describe('deleteSession', () => {
        it('should erase backing JSON and remove from index', () => {
            const unlinkSyncSpy = vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);
            const writeFileSyncSpy = vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

            const sessionStorage = new SessionStorage(mockPathManager);

            // Mock an existing index with 2 items
            const mockIndex: SessionMeta[] = [
                { id: 'sess-target', title: 'Target', createdAt: 0, updatedAt: 0 },
                { id: 'sess-other', title: 'Other', createdAt: 0, updatedAt: 0 }
            ];
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndex));

            const result = sessionStorage.deleteSession('sess-target');

            expect(result).toBe(true);
            expect(unlinkSyncSpy).toHaveBeenCalledWith(path.join(MOCK_STORAGE_DIR, 'sess-target.json'));

            // Check index has rewritten without target
            const writeIndexCall = writeFileSyncSpy.mock.calls.find(call => call[0] === MOCK_INDEX_FILE);
            const writtenIndexData = JSON.parse(writeIndexCall![1] as string) as SessionMeta[];
            expect(writtenIndexData.length).toBe(1);
            expect(writtenIndexData[0].id).toBe('sess-other');
        });
    });
});
