import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MemoryStore } from '@/main/services/memory/MemoryStore';

describe('MemoryStore', () => {
    let tempDir: string;
    let filePath: string;
    let store: MemoryStore;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geni-memory-test-'));
        filePath = path.join(tempDir, 'memory.md');
        store = new MemoryStore(filePath);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('basic operations', () => {
        it('should return empty string when file does not exist', () => {
            expect(store.read()).toBe('');
        });

        it('should save and read a memory entry', () => {
            store.save('test title', 'test content');
            const content = store.read();
            expect(content).toContain('<!-- memory: test title -->');
            expect(content).toContain('test content');
        });

        it('should delete a memory entry', () => {
            store.save('to delete', 'content');
            expect(store.delete('to delete')).toBe(true);
            expect(store.read()).not.toContain('to delete');
        });

        it('should return false when deleting non-existent entry', () => {
            expect(store.delete('nonexistent')).toBe(false);
        });

        it('should replace existing entry with same title (dedup)', () => {
            store.save('my entry', 'old content');
            store.save('my entry', 'new content');
            const content = store.read();
            expect(content).toContain('new content');
            expect(content).not.toContain('old content');
            // Should only appear once
            expect((content.match(/<!-- memory: my entry -->/g) || []).length).toBe(1);
        });
    });

    describe('category support', () => {
        it('should save memory with category', () => {
            store.save('user lang', 'prefers Chinese', 'preference');
            const content = store.read();
            expect(content).toContain('<!-- memory:category:preference -->');
            expect(content).toContain('<!-- memory: user lang -->');
            expect(content).toContain('prefers Chinese');
        });

        it('should save memory without category', () => {
            store.save('some fact', 'hello world');
            const content = store.read();
            expect(content).toContain('<!-- memory: some fact -->');
            expect(content).not.toContain('<!-- memory:category:');
        });

        it('should list titles with categories', () => {
            store.save('lang pref', 'Chinese', 'preference');
            store.save('tech stack', 'React + TS', 'project');
            store.save('a fact', 'something');

            const titles = store.listTitles();
            expect(titles).toHaveLength(3);

            const langPref = titles.find(t => t.title === 'lang pref');
            expect(langPref?.category).toBe('preference');

            const techStack = titles.find(t => t.title === 'tech stack');
            expect(techStack?.category).toBe('project');

            const fact = titles.find(t => t.title === 'a fact');
            expect(fact?.category).toBeUndefined();
        });

        it('should read by category', () => {
            store.save('lang pref', 'Chinese', 'preference');
            store.save('editor', 'VS Code', 'preference');
            store.save('tech stack', 'React + TS', 'project');

            const preferences = store.readByCategory('preference');
            expect(preferences).toContain('lang pref');
            expect(preferences).toContain('editor');
            expect(preferences).toContain('Chinese');
            expect(preferences).toContain('VS Code');
            expect(preferences).not.toContain('tech stack');
        });

        it('should return empty string for category with no entries', () => {
            store.save('a fact', 'something');
            expect(store.readByCategory('preference')).toBe('');
        });

        it('should read by title', () => {
            store.save('my entry', 'hello world', 'project');
            const content = store.readByTitle('my entry');
            expect(content).toBe('hello world');
        });

        it('should return empty string for non-existent title', () => {
            expect(store.readByTitle('nonexistent')).toBe('');
        });

        it('should deduplicate within same category', () => {
            store.save('lang pref', 'English', 'preference');
            store.save('lang pref', 'Chinese', 'preference');

            const preferences = store.readByCategory('preference');
            const titleCount = (preferences.match(/<!-- memory: lang pref -->/g) || []).length;
            expect(titleCount).toBe(1);
            expect(preferences).toContain('Chinese');
            expect(preferences).not.toContain('English');
        });

        it('should handle replacing entry across different categories', () => {
            store.save('my entry', 'as fact');
            store.save('my entry', 'as preference', 'preference');

            const content = store.read();
            expect(content).toContain('as preference');
            expect(content).not.toContain('as fact');
            // Should only have one entry
            const titleCount = (content.match(/<!-- memory: my entry -->/g) || []).length;
            expect(titleCount).toBe(1);
        });
    });
});
