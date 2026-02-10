import fs from 'fs';
import path from 'path';
import { ChatSession, SessionMeta } from '../../../common/types/chat';
import { PathManager } from '../PathManager';

/**
 * SessionStorage - 负责会话的物理存储 (磁盘 IO)
 *
 * 职责:
 * - 对单个会话 JSON 的物理读写
 * - 维护 session/index.json 索引文件
 */
export class SessionStorage {
    private storageDir: string;
    private indexFile: string;

    constructor(pathManager: PathManager) {
        this.storageDir = pathManager.getSessionsDir();
        this.indexFile = pathManager.getSessionsIndexFile();

        console.log('[SessionStorage] Storage Dir:', this.storageDir);

        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    /**
     * 获取所有会话列表 (从索引文件)
     */
    public getIndex(): SessionMeta[] {
        try {
            if (fs.existsSync(this.indexFile)) {
                const data = fs.readFileSync(this.indexFile, 'utf8');
                return JSON.parse(data) as SessionMeta[];
            }
        } catch (error) {
            console.error('[SessionStorage] Failed to load index:', error);
        }
        return [];
    }

    /**
     * 加载完整会话数据
     */
    public loadSession(id: string): ChatSession | undefined {
        const filePath = path.join(this.storageDir, `${id}.json`);
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                const session = JSON.parse(data) as ChatSession;
                console.log(`[SessionStorage] Loaded ${id} from disk. Messages: ${session.messages?.length || 0}`);
                return session;
            }
        } catch (error) {
            console.error(`[SessionStorage] Failed to load session ${id}:`, error);
        }
        return undefined;
    }

    /**
     * 保存完整会话数据并更新索引
     */
    public saveSession(session: ChatSession): boolean {
        try {
            // 1. 保存物理文件
            const filePath = path.join(this.storageDir, `${session.id}.json`);
            fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
            console.log(`[SessionStorage] Saved ${session.id} to disk. Messages: ${session.messages?.length || 0}`);

            // 2. 同步更新索引
            this.updateIndex(session);
            return true;
        } catch (error) {
            console.error('[SessionStorage] Failed to save session:', error);
            return false;
        }
    }

    /**
     *物理删除会话
     */
    public deleteSession(id: string): boolean {
        try {
            const filePath = path.join(this.storageDir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            const list = this.getIndex();
            const newList = list.filter(s => s.id !== id);
            fs.writeFileSync(this.indexFile, JSON.stringify(newList, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('[SessionStorage] Failed to delete session:', error);
            return false;
        }
    }

    private updateIndex(session: ChatSession) {
        const list = this.getIndex();
        const index = list.findIndex(s => s.id === session.id);

        const meta: SessionMeta = {
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            preview: session.messages[session.messages.length - 1]?.content?.slice(0, 100) || undefined
        };

        if (index > -1) {
            list[index] = meta;
        } else {
            list.unshift(meta);
        }

        // 保持按更新时间排序
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        fs.writeFileSync(this.indexFile, JSON.stringify(list, null, 2), 'utf8');
    }
}
