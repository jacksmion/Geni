import { ChatMessage, ChatSession, SessionMeta } from '../../../common/types/chat';
import { randomUUID } from 'crypto';
import { SessionStorage } from './SessionStorage';

/**
 * SessionManager - 会话业务逻辑管理器 (运行时经理)
 * 
 * 职责:
 * - 管理内存中的活跃会话
 * - 协调 SessionStorage 进行持久化
 * - 处理会话创建、消息追加、变量管理等业务逻辑
 */
export class SessionManager {
    private sessions: Map<string, ChatSession> = new Map();
    private storage: SessionStorage;

    constructor() {
        this.storage = new SessionStorage();
    }

    /**
     * 创建新会话
     */
    public createSession(title: string = 'New Chat'): ChatSession {
        const id = randomUUID();
        const session: ChatSession = {
            id,
            title,
            messages: [],
            variables: {},
            activeSkillIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.sessions.set(id, session);
        this.storage.saveSession(session);
        return session;
    }

    /**
     * 获取会话 (如果内存没找到，尝试从磁盘加载)
     */
    public async getSession(id: string): Promise<ChatSession | undefined> {
        // 1. 检查内存
        if (this.sessions.has(id)) {
            return this.sessions.get(id);
        }

        // 2. 尝试从磁盘加载
        console.log(`[SessionManager] Loading session ${id} from disk...`);
        const session = this.storage.loadSession(id);
        if (session) {
            this.sessions.set(id, session);
            return session;
        }

        return undefined;
    }

    /**
     * 删除会话
     */
    public deleteSession(id: string): boolean {
        this.sessions.delete(id);
        return this.storage.deleteSession(id);
    }

    /**
     * 更新会话属性 (如标题)
     */
    public async updateSession(id: string, updates: Partial<ChatSession>): Promise<ChatSession | undefined> {
        const session = await this.getSession(id);
        if (!session) return undefined;

        Object.assign(session, updates);
        session.updatedAt = Date.now();

        this.storage.saveSession(session);
        return session;
    }

    /**
     * 添加消息并同步保存
     */
    public async addMessage(id: string, message: ChatMessage): Promise<void> {
        const session = await this.getSession(id);
        if (session) {
            // 补全缺失的 ID 和时间戳（特别是从 LLM 原始返回的消息）
            const enrichedMessage: ChatMessage = {
                ...message,
                id: message.id || randomUUID(),
                timestamp: message.timestamp || Date.now(),
            };

            session.messages.push(enrichedMessage);
            session.updatedAt = Date.now();

            console.log(`[SessionManager] Message added to ${id}. Total messages: ${session.messages.length}`);
            this.storage.saveSession(session);
        } else {
            console.warn(`[SessionManager] Session NOT FOUND: ${id}. Cannot add message.`);
        }
    }

    /**
     * 获取会话历史记录
     */
    public async getHistory(id: string): Promise<ChatMessage[]> {
        const session = await this.getSession(id);
        return session?.messages || [];
    }

    /**
     * 获取所有会话元数据列表
     */
    public listSessions(): SessionMeta[] {
        return this.storage.getIndex();
    }

    /**
     * 保存会话 (用于强制保存)
     */
    public saveSession(session: ChatSession): boolean {
        this.sessions.set(session.id, session);
        return this.storage.saveSession(session);
    }

    // --- 变量管理 ---

    public async setVariable(sessionId: string, key: string, value: any): Promise<void> {
        const session = await this.getSession(sessionId);
        if (session) {
            if (!session.variables) session.variables = {};
            session.variables[key] = value;
            session.updatedAt = Date.now();
            this.storage.saveSession(session);
        }
    }

    public async getVariable(sessionId: string, key: string): Promise<any> {
        const session = await this.getSession(sessionId);
        return session?.variables?.[key];
    }
}
