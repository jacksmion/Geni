import fs from 'fs';

/**
 * MemoryStore - 长期记忆持久化存储
 * 
 * 使用 Markdown 文件存储，以 HTML 注释作为条目分隔符。
 * 格式: <!-- memory: {title} -->\n{content}\n
 */
export class MemoryStore {
    constructor(private filePath: string) {}

    /**
     * 读取全部记忆内容
     */
    read(): string {
        try {
            return fs.existsSync(this.filePath)
                ? fs.readFileSync(this.filePath, 'utf-8').trim()
                : '';
        } catch {
            return '';
        }
    }

    /**
     * 保存一条记忆（如已存在同名条目则替换）
     */
    save(title: string, content: string): void {
        // 先删除同名条目（去重），再追加
        let existing = this.read();
        existing = this.removeEntry(existing, title);

        const entry = `<!-- memory: ${title} -->\n${content.trim()}\n`;
        const result = existing ? `${existing}\n\n${entry}` : entry;
        fs.writeFileSync(this.filePath, result.trim() + '\n', 'utf-8');
    }

    /**
     * 按标题删除一条记忆
     */
    delete(title: string): boolean {
        const existing = this.read();
        const updated = this.removeEntry(existing, title);
        if (updated === existing) return false;

        fs.writeFileSync(this.filePath, updated.trim() ? updated.trim() + '\n' : '', 'utf-8');
        return true;
    }

    /**
     * 从文本中移除匹配标题的条目
     */
    private removeEntry(text: string, title: string): string {
        if (!text) return '';
        // 匹配从 <!-- memory: title --> 到下一个 <!-- memory: 或文件末尾
        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(
            `<!-- memory: ${escaped} -->\\n[\\s\\S]*?(?=<!-- memory:|$)`,
            'g'
        );
        return text.replace(regex, '').replace(/\n{3,}/g, '\n\n').trim();
    }
}
