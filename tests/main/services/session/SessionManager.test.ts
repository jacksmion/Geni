import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '@/main/services/session/SessionManager';
import { SessionStorage } from '@/main/services/session/SessionStorage';
import { ChatMessage, ChatSession } from '@/common/types/chat';

vi.mock('@/main/services/session/SessionStorage');

describe('SessionManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(SessionStorage).mockImplementation(function(this: any) {
            this.saveSession = vi.fn().mockResolvedValue(true);
            this.loadSession = vi.fn().mockResolvedValue(undefined);
            this.getIndex = vi.fn().mockResolvedValue([]);
            this.deleteSession = vi.fn().mockResolvedValue(true);
        } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should bootstrap createSession with variables and UUID', async () => {
        const manager = new SessionManager({} as any);
        const session = await manager.createSession('My Chat');

        expect(session.id).toBeDefined();
        expect(session.id.length).toBeGreaterThan(0);
        expect(session.title).toBe('My Chat');
        expect(session.variables).toEqual({});
        expect(session.messages).toEqual([]);
    });

    it('should fallback cleanly between Ram map and storage load for getSession', async () => {
        const mockDiskSession: ChatSession = {
            id: 'disk-id', title: 'From Disk', messages: [], variables: {}, activeSkillIds: [], createdAt: 0, updatedAt: 0
        };
        vi.mocked(SessionStorage).mockImplementation(function(this: any) {
            this.saveSession = vi.fn().mockResolvedValue(true);
            this.loadSession = vi.fn().mockResolvedValue(mockDiskSession);
            this.getIndex = vi.fn().mockResolvedValue([]);
            this.deleteSession = vi.fn().mockResolvedValue(true);
        } as any);

        const manager = new SessionManager({} as any);

        const s1 = await manager.getSession('disk-id');
        expect(s1?.title).toBe('From Disk');

        const s2 = await manager.getSession('disk-id');
        expect(s2?.title).toBe('From Disk');
    });

    it('should enrich message appending timestamps and UUIDs', async () => {
        const manager = new SessionManager({} as any);
        const session = await manager.createSession('Test Enriched');

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
    });

    it('should set variables tracking inside session metadata mappings', async () => {
        const manager = new SessionManager({} as any);
        const session = await manager.createSession('Vars Test');

        await manager.setVariable(session.id, 'userTargetDir', '/foo/bar');

        const savedSession = await manager.getSession(session.id);
        expect(savedSession!.variables['userTargetDir']).toBe('/foo/bar');
    });
});
