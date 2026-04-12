
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
        ipcMain.handle(SESSION_CHANNELS.SAVE, this.handleSave.bind(this));
        ipcMain.handle(SESSION_CHANNELS.GET, this.handleGetSession.bind(this));
        ipcMain.handle(SESSION_CHANNELS.ADD_MESSAGE, this.handleAddMessage.bind(this));
    }

    private async handleGetSession(event: IpcMainInvokeEvent, sessionId: string) {
        return this.sessionManager.getSession(sessionId);
    }

    private async handleCreate(event: IpcMainInvokeEvent): Promise<SessionCreateResponse> {
        const session = await this.sessionManager.createSession();
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

    private async handleSave(event: IpcMainInvokeEvent, updates: { id: string; title?: string; staffId?: string; modelId?: string; workspacePath?: string }) {
        // 使用 updateSession 进行部分更新，而不是 saveSession 完全覆盖
        // 这样可以保留现有的 messages、createdAt 等字段
        if (!updates.id) {
            console.error('[SessionController] handleSave called without session id');
            return false;
        }

        const patch: { title?: string; staffId?: string; modelId?: string; workspacePath?: string } = {};
        if (updates.title !== undefined) patch.title = updates.title;
        if (updates.staffId !== undefined) patch.staffId = updates.staffId;
        if (updates.modelId !== undefined) patch.modelId = updates.modelId;
        if (updates.workspacePath !== undefined) patch.workspacePath = updates.workspacePath;

        const result = await this.sessionManager.updateSession(updates.id, patch);
        return result !== undefined;
    }

    /**
     * 处理前端添加消息请求
     * 用于用户发送消息时立即持久化，以及保存初始欢迎消息
     */
    private async handleAddMessage(event: IpcMainInvokeEvent, payload: { sessionId: string; message: any }) {
        if (!payload.sessionId || !payload.message) {
            console.error('[SessionController] handleAddMessage called with invalid payload');
            return false;
        }

        try {
            await this.sessionManager.addMessage(payload.sessionId, payload.message);
            return true;
        } catch (error) {
            console.error('[SessionController] Failed to add message:', error);
            return false;
        }
    }
}
