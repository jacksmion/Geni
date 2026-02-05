import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ChatSession, ChatMessage } from '../../../common/types/chat';

// 元数据类型，不包含 messages
export type SessionMeta = Omit<ChatSession, 'messages'> & {
    preview?: string; // 可选：最后一条消息预览
};

export class ChatHistoryManager {
    private storageDir: string;
    private indexFile: string;

    constructor() {
        const userDataPath = app.getPath('userData');
        this.storageDir = path.join(userDataPath, 'sessions');
        this.indexFile = path.join(this.storageDir, 'index.json');

        console.log('[ChatHistory] Storage Dir:', this.storageDir);

        // Ensure storage directory exists
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    // 1. 获取会话列表 (元数据 only)
    getSessionList(): SessionMeta[] {
        try {
            if (fs.existsSync(this.indexFile)) {
                const data = fs.readFileSync(this.indexFile, 'utf8');
                const list = JSON.parse(data) as SessionMeta[];
                // 按 updatedAt 倒序
                return list.sort((a, b) => b.updatedAt - a.updatedAt);
            }
        } catch (error) {
            console.error('[ChatHistory] Failed to load session index:', error);
        }
        return [];
    }

    // 2. 获取单个会话的详细消息
    getSessionMessages(id: string): ChatMessage[] {
        const filePath = path.join(this.storageDir, `${id}.json`);
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                const session = JSON.parse(data) as ChatSession;
                return session.messages || [];
            }
        } catch (error) {
            console.error(`[ChatHistory] Failed to load messages for ${id}:`, error);
        }
        return [];
    }

    // 3. 创建或更新会话 (同时更新索引和详情文件)
    saveSession(session: ChatSession): boolean {
        try {
            // A. 保存详情文件
            const filePath = path.join(this.storageDir, `${session.id}.json`);
            fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');

            // B. 更新索引
            this.updateIndex(session);

            return true;
        } catch (error) {
            console.error('[ChatHistory] Failed to save session:', error);
            return false;
        }
    }

    // 4. 删除会话
    deleteSession(id: string): boolean {
        try {
            // A. 删除详情文件
            const filePath = path.join(this.storageDir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // B. 从索引中移除
            const list = this.getSessionList();
            const newList = list.filter(s => s.id !== id);
            fs.writeFileSync(this.indexFile, JSON.stringify(newList, null, 2), 'utf8');

            return true;
        } catch (error) {
            console.error('[ChatHistory] Failed to delete session:', error);
            return false;
        }
    }

    // 辅助：更新索引文件
    private updateIndex(session: ChatSession) {
        const list = this.getSessionList();
        const index = list.findIndex(s => s.id === session.id);

        // 构造元数据 (去除 heavy messages)
        const meta: SessionMeta = {
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            // preview: session.messages[session.messages.length - 1]?.content.slice(0, 50) 
        };

        if (index > -1) {
            list[index] = meta;
        } else {
            list.unshift(meta);
        }

        fs.writeFileSync(this.indexFile, JSON.stringify(list, null, 2), 'utf8');
    }
}
