import fs from 'fs';
import type { MemoryCategory } from '../../../common/types/memory';

/**
 * MemoryStore - 长期记忆持久化存储
 *
 * 使用 Markdown 文件存储，以 HTML 注释作为条目分隔符。
 * 支持按分类组织记忆，格式:
 *   <!-- memory:category:{category} -->
 *   <!-- memory: {title} -->
 *   {content}
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
    save(title: string, content: string, category?: MemoryCategory): void {
        // 先删除同名条目（去重），再追加
        let existing = this.read();
        existing = this.removeEntry(existing, title);

        const categoryTag = category ? `<!-- memory:category:${category} -->\n` : '';
        const entry = `${categoryTag}<!-- memory: ${title} -->\n${content.trim()}\n`;
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
     * 获取所有记忆条目的标题和分类
     */
    listTitles(): Array<{ title: string; category?: MemoryCategory }> {
        const content = this.read();
        if (!content) return [];

        const results: Array<{ title: string; category?: MemoryCategory }> = [];
        const lines = content.split('\n');
        let currentCategory: MemoryCategory | undefined;

        for (const line of lines) {
            // Check for category marker
            const categoryMatch = line.match(/^<!-- memory:category:(\w+) -->$/);
            if (categoryMatch) {
                currentCategory = categoryMatch[1] as MemoryCategory;
                continue;
            }

            // Check for entry title
            const titleMatch = line.match(/^<!-- memory: (.+?) -->$/);
            if (titleMatch) {
                results.push({ title: titleMatch[1], category: currentCategory });
                // Reset category after use (each entry has its own category tag)
                currentCategory = undefined;
            }
        }

        return results;
    }

    /**
     * 读取指定分类的所有条目内容
     */
    readByCategory(category: MemoryCategory): string {
        const content = this.read();
        if (!content) return '';

        // Extract sections that belong to the given category
        const sections = content.split(/(?=<!-- memory:category:)/);
        const matching: string[] = [];

        for (const section of sections) {
            if (section.startsWith(`<!-- memory:category:${category} -->`)) {
                matching.push(section.trim());
            }
        }

        return matching.join('\n\n').trim();
    }

    /**
     * 按标题读取单条记忆内容
     */
    readByTitle(title: string): string {
        const content = this.read();
        if (!content) return '';

        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(
            `(?:<!-- memory:category:\\w+ -->\\n)?<!-- memory: ${escaped} -->\\n([\\s\\S]*?)(?=<!-- memory:|$)`,
            'g'
        );
        const match = regex.exec(content);
        return match ? match[1].trim() : '';
    }

    /**
     * 从文本中移除匹配标题的条目
     */
    private removeEntry(text: string, title: string): string {
        if (!text) return '';
        // Match optional category tag + entry title + content
        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(
            `(?:<!-- memory:category:\\w+ -->\\n)?<!-- memory: ${escaped} -->\\n[\\s\\S]*?(?=<!-- memory:|$)`,
            'g'
        );
        return text.replace(regex, '').replace(/\n{3,}/g, '\n\n').trim();
    }
}
