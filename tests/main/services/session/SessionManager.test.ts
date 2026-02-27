import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '@/main/services/session/SessionManager';
import { SessionStorage } from '@/main/services/session/SessionStorage';
import { PathManager } from '@/main/services/PathManager';
import { ChatMessage, ChatSession } from '@/common/types/chat';

// We mock SessionStorage so we don't do real FS tracking logic
vi.mock('@/main/services/session/SessionStorage');

describe('SessionManager', () => {
    let mockPathManager: PathManager;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPathManager = {} as PathManager;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should bootstrap createSession with variables and UUID', () => {
        const manager = new SessionManager(mockPathManager);
        const storageInstance = vi.mocked(SessionStorage).mock.instances[0];

        const session = manager.createSession('My Chat');

        expect(session.id).toBeDefined();
        expect(session.id.length).toBeGreaterThan(0);
        expect(session.title).toBe('My Chat');
        expect(session.variables).toEqual({});
        expect(session.messages).toEqual([]);

        expect(storageInstance.saveSession).toHaveBeenCalledWith(session);
    });

    it('should fallback cleanly between Ram map and storage load for getSession', async () => {
        const manager = new SessionManager(mockPathManager);
        const storageInstance = vi.mocked(SessionStorage).mock.instances[0];

        const mockDiskSession: ChatSession = {
            id: 'disk-id', title: 'From Disk', messages: [], variables: {}, activeSkillIds: [], createdAt: 0, updatedAt: 0
        };
        vi.mocked(storageInstance.loadSession).mockReturnValue(mockDiskSession);

        // First call: Should hit disk since not in RAM
        const s1 = await manager.getSession('disk-id');
        expect(s1).toBe(mockDiskSession);
        expect(storageInstance.loadSession).toHaveBeenCalledTimes(1);

        // Second call: Should read from memory, not disk
        const s2 = await manager.getSession('disk-id');
        expect(s2).toBe(mockDiskSession);
        expect(storageInstance.loadSession).toHaveBeenCalledTimes(1); // Storage counts shouldn't tick up
    });

    it('should enrich message appending timestamps and UUIDs', async () => {
        const manager = new SessionManager(mockPathManager);
        const storageInstance = vi.mocked(SessionStorage).mock.instances[0];

        const session = manager.createSession('Test Enriched');

        // Incoming message without ID and timestamp
        const incomingMsg: ChatMessage = {
            role: 'user',
            content: 'Hello World'
        };

        await manager.addMessage(session.id, incomingMsg);

        const savedSession = await manager.getSession(session.id);
        const lastMsg = savedSession!.messages[0];

        expect(lastMsg.id).toBeDefined();
        expect(lastMsg.timestamp).toBeDefined();
        expect(lastMsg.timestamp).toBeGreaterThan(0);
        expect(lastMsg.content).toBe('Hello World');

        expect(storageInstance.saveSession).toHaveBeenCalledWith(savedSession);
    });

    it('should set variables tracking inside session metadata mappings', async () => {
        const manager = new SessionManager(mockPathManager);
        const storageInstance = vi.mocked(SessionStorage).mock.instances[0];

        const session = manager.createSession('Vars Test');

        await manager.setVariable(session.id, 'userTargetDir', '/foo/bar');

        const savedSession = await manager.getSession(session.id);
        expect(savedSession!.variables['userTargetDir']).toBe('/foo/bar');
        expect(storageInstance.saveSession).toHaveBeenCalled();
    });
});
