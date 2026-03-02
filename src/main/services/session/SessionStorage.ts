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
    private cachedIndex: SessionMeta[] | null = null;

    constructor(pathManager: PathManager) {
        this.storageDir = pathManager.getSessionsDir();
        this.indexFile = pathManager.getSessionsIndexFile();

        console.log('[SessionStorage] Storage Dir:', this.storageDir);

        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    /**
     * 获取所有会话列表 (从索引文件或内存缓存)
     */
    public async getIndex(): Promise<SessionMeta[]> {
        if (this.cachedIndex) {
            return this.cachedIndex;
        }

        try {
            if (fs.existsSync(this.indexFile)) {
                const data = await fs.promises.readFile(this.indexFile, 'utf8');
                this.cachedIndex = JSON.parse(data) as SessionMeta[];
                return this.cachedIndex;
            }
        } catch (error) {
            console.error('[SessionStorage] Failed to load index:', error);
        }

        this.cachedIndex = [];
        return this.cachedIndex;
    }

    /**
     * 加载完整会话数据
     */
    public async loadSession(id: string): Promise<ChatSession | undefined> {
        const filePath = path.join(this.storageDir, `${id}.json`);
        try {
            if (fs.existsSync(filePath)) {
                const data = await fs.promises.readFile(filePath, 'utf8');
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
     * 保存完整会话数据并更新索引（异步防阻塞）
     */
    public async saveSession(session: ChatSession): Promise<boolean> {
        try {
            // 1. 同步更新索引到内存，并发起异步落盘
            await this.updateIndex(session);

            // 2. 异步保存物理文件
            const filePath = path.join(this.storageDir, `${session.id}.json`);
            fs.promises.writeFile(filePath, JSON.stringify(session, null, 2), 'utf8')
                .then(() => {
                    console.log(`[SessionStorage] Saved ${session.id} to disk async. Messages: ${session.messages?.length || 0}`);
                })
                .catch(error => {
                    console.error('[SessionStorage] Failed to save session async:', error);
                });

            return true;
        } catch (error) {
            console.error('[SessionStorage] Failed to initiate save session:', error);
            return false;
        }
    }

    /**
     * 物理删除会话
     */
    public async deleteSession(id: string): Promise<boolean> {
        try {
            const filePath = path.join(this.storageDir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                // 异步删除
                fs.promises.unlink(filePath).catch(error => {
                    console.error('[SessionStorage] Failed to unlink session file:', error);
                });
            }

            const list = await this.getIndex();
            const newList = list.filter(s => s.id !== id);

            // 更新内存缓存并发起异步写
            this.cachedIndex = newList;
            fs.promises.writeFile(this.indexFile, JSON.stringify(newList, null, 2), 'utf8')
                .catch(error => {
                    console.error('[SessionStorage] Failed to asynchronously update index after delete:', error);
                });

            return true;
        } catch (error) {
            console.error('[SessionStorage] Failed to initiate delete session:', error);
            return false;
        }
    }

    private async updateIndex(session: ChatSession) {
        const list = await this.getIndex();
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

        // 更新内存缓存
        this.cachedIndex = list;

        // 异步写入磁盘
        fs.promises.writeFile(this.indexFile, JSON.stringify(list, null, 2), 'utf8')
            .catch(err => console.error('[SessionStorage] Failed to explicitly update index:', err));
    }
}
