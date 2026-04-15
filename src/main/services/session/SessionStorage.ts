import fs from 'fs';
import path from 'path';
import { ChatSession, SessionMeta } from '../../../common/types/chat';
import { PathManager } from '../PathManager';

/**
 * 原子写入：先写临时文件，再 rename 到目标路径。
 * rename 在同一文件系统上是原子操作，确保不会出现半写文件。
 */
async function atomicWriteFile(filePath: string, data: string): Promise<void> {
    const tmpPath = filePath + '.tmp';
    await fs.promises.writeFile(tmpPath, data, 'utf8');
    await fs.promises.rename(tmpPath, filePath);
}

/**
 * SessionStorage - 负责会话的物理存储 (磁盘 IO)
 *
 * 职责:
 * - 对单个会话 JSON 的物理读写
 * - 维护 session/index.json 索引文件
 *
 * 安全机制:
 * - 原子写入 (write-tmp-then-rename)，防止写入中途崩溃导致文件损坏
 * - 写入队列 (串行化)，防止并发写入同一文件产生竞争
 * - 索引损坏自动重建，从 session 文件恢复索引
 */
export class SessionStorage {
    private storageDir: string;
    private indexFile: string;
    private cachedIndex: SessionMeta[] | null = null;

    // 写入队列：确保对索引文件的写入是串行的
    private indexWriteQueue: Promise<void> = Promise.resolve();
    // 会话文件写入队列：每个 session ID 一个队列
    private sessionWriteQueues: Map<string, Promise<void>> = new Map();

    constructor(pathManager: PathManager) {
        this.storageDir = pathManager.getSessionsDir();
        this.indexFile = pathManager.getSessionsIndexFile();

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
            console.error('[SessionStorage] Failed to load index, attempting rebuild:', error);
            // 索引文件损坏，尝试从 session 文件重建
            const rebuilt = await this.rebuildIndex();
            this.cachedIndex = rebuilt;
            return this.cachedIndex;
        }

        this.cachedIndex = [];
        return this.cachedIndex;
    }

    /**
     * 从磁盘上的 session 文件重建索引。
     * 当 index.json 损坏时作为恢复手段。
     */
    private async rebuildIndex(): Promise<SessionMeta[]> {
        console.log('[SessionStorage] Rebuilding index from session files...');
        const metas: SessionMeta[] = [];

        try {
            const files = await fs.promises.readdir(this.storageDir);
            const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');

            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(this.storageDir, file);
                    const data = await fs.promises.readFile(filePath, 'utf8');
                    const session = JSON.parse(data) as ChatSession;

                    if (session.id && session.createdAt) {
                        metas.push({
                            id: session.id,
                            title: session.title,
                            createdAt: session.createdAt,
                            updatedAt: session.updatedAt,
                            preview: this.extractTextFromContent(session.messages?.[session.messages.length - 1]?.content).slice(0, 100) || undefined,
                            staffId: session.staffId,
                            modelId: session.modelId,
                            workspacePath: session.workspacePath
                        });
                    }
                } catch (fileError) {
                    console.warn(`[SessionStorage] Skipping corrupted session file: ${file}`, fileError);
                }
            }

            // 按更新时间排序
            metas.sort((a, b) => b.updatedAt - a.updatedAt);

            // 将重建的索引写入磁盘
            await atomicWriteFile(this.indexFile, JSON.stringify(metas, null, 2));
            console.log(`[SessionStorage] Index rebuilt successfully. ${metas.length} sessions recovered.`);
        } catch (error) {
            console.error('[SessionStorage] Failed to rebuild index:', error);
        }

        return metas;
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
                return session;
            }
        } catch (error) {
            console.error(`[SessionStorage] Failed to load session ${id}:`, error);
        }
        return undefined;
    }

    /**
     * 保存完整会话数据并更新索引
     * 使用写入队列确保串行化，使用原子写入确保文件完整性
     */
    public async saveSession(session: ChatSession): Promise<boolean> {
        try {
            // 1. 更新索引（串行化队列）
            await this.enqueueIndexWrite(async () => {
                await this.updateIndex(session);
            });

            // 2. 保存会话文件（按 session ID 串行化）
            this.enqueueSessionWrite(session.id, async () => {
                const filePath = path.join(this.storageDir, `${session.id}.json`);
                await atomicWriteFile(filePath, JSON.stringify(session, null, 2));
            });

            return true;
        } catch (error) {
            console.error('[SessionStorage] Failed to save session:', error);
            return false;
        }
    }

    /**
     * 物理删除会话
     */
    public async deleteSession(id: string): Promise<boolean> {
        try {
            const filePath = path.join(this.storageDir, `${id}.json`);

            // 等待该 session 的所有写入完成后再删除
            await this.enqueueSessionWrite(id, async () => {
                if (fs.existsSync(filePath)) {
                    await fs.promises.unlink(filePath);
                }
            });

            // 串行化更新索引
            await this.enqueueIndexWrite(async () => {
                const list = await this.getIndex();
                const newList = list.filter(s => s.id !== id);
                this.cachedIndex = newList;
                await atomicWriteFile(this.indexFile, JSON.stringify(newList, null, 2));
            });

            // 清理写入队列
            this.sessionWriteQueues.delete(id);

            return true;
        } catch (error) {
            console.error('[SessionStorage] Failed to delete session:', error);
            return false;
        }
    }

    /**
     * 更新内存索引并原子写入磁盘
     */
    private async updateIndex(session: ChatSession) {
        const list = await this.getIndex();
        const index = list.findIndex(s => s.id === session.id);

        const meta: SessionMeta = {
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            preview: this.extractTextFromContent(session.messages[session.messages.length - 1]?.content).slice(0, 100) || undefined,
            staffId: session.staffId,
            modelId: session.modelId,
            workspacePath: session.workspacePath,
            activeSkillIds: session.activeSkillIds
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

        // 原子写入磁盘
        await atomicWriteFile(this.indexFile, JSON.stringify(list, null, 2));
    }

    private extractTextFromContent(content: any): string {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
        }
        return '';
    }

    /**
     * 将索引文件写操作加入队列，确保串行执行
     */
    private enqueueIndexWrite(fn: () => Promise<void>): Promise<void> {
        this.indexWriteQueue = this.indexWriteQueue
            .then(fn)
            .catch(err => {
                console.error('[SessionStorage] Index write queue error:', err);
            });
        return this.indexWriteQueue;
    }

    /**
     * 将会话文件写操作加入队列，确保同一 session 的写入串行执行
     */
    private enqueueSessionWrite(sessionId: string, fn: () => Promise<void>): Promise<void> {
        const current = this.sessionWriteQueues.get(sessionId) || Promise.resolve();
        const next = current
            .then(fn)
            .catch(err => {
                console.error(`[SessionStorage] Session write queue error for ${sessionId}:`, err);
            });
        this.sessionWriteQueues.set(sessionId, next);
        return next;
    }
}
