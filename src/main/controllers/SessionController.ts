
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { SessionManager } from '../services/session';
import { SESSION_CHANNELS } from '../../common/ipc/channels';
import { SessionCreateResponse } from '../../common/types/agentEvents';

/**
 * Session Controller
 * 
 * Handles IPC requests for Session operations.
 */
export class SessionController {
    private sessionManager: SessionManager;

    constructor(sessionManager: SessionManager) {
        this.sessionManager = sessionManager;
    }

    /**
     * Bind IPC handlers
     */
    public registerHandlers(): void {
        ipcMain.handle(SESSION_CHANNELS.CREATE, this.handleCreate.bind(this));
        ipcMain.handle(SESSION_CHANNELS.LIST, this.handleList.bind(this));
        ipcMain.handle(SESSION_CHANNELS.GET_HISTORY, this.handleGetHistory.bind(this));
        ipcMain.handle(SESSION_CHANNELS.DELETE, this.handleDelete.bind(this));
    }

    private async handleCreate(event: IpcMainInvokeEvent): Promise<SessionCreateResponse> {
        const session = this.sessionManager.createSession();
        return {
            id: session.id,
            createdAt: session.createdAt
        };
    }

    private async handleList(event: IpcMainInvokeEvent) {
        return this.sessionManager.listSessions();
    }

    private async handleGetHistory(event: IpcMainInvokeEvent, sessionId: string) {
        // Return full history including stats if possible
        // For now just return raw ChatMessages
        return this.sessionManager.getHistory(sessionId);
    }

    private async handleDelete(event: IpcMainInvokeEvent, sessionId: string) {
        return this.sessionManager.deleteSession(sessionId);
    }
}
