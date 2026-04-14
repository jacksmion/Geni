import { describe, it, expect } from 'vitest';
import { PromptBuilder, AgentContext } from '@/main/services/agent/PromptBuilder';
import { Skill } from '@/common/types/skill';
import { MemoryStore } from '@/main/services/memory/MemoryStore';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('PromptBuilder', () => {
    it('should build prompt with default base prompt', () => {
        const builder = new PromptBuilder();
        const context: AgentContext = {};

        const prompt = builder.buildSystemPrompt(context);

        expect(prompt).toContain('You are Geni');
        expect(prompt).toContain('[System Environment]');
        expect(prompt).toContain('<memory>');
        expect(prompt).not.toContain('<skills>');
    });

    it('should build prompt using provided base prompt in context', () => {
        const builder = new PromptBuilder();
        const context: AgentContext = {
            basePrompt: 'You are a Custom AI Assistant.'
        };

        const prompt = builder.buildSystemPrompt(context);

        expect(prompt).toContain('You are a Custom AI Assistant.');
        expect(prompt).toContain('[System Environment]');
        expect(prompt).not.toContain('You are Geni');
    });

    it('should not include <skills> block if skills array is empty or undefined', () => {
        const builder = new PromptBuilder();

        const prompt1 = builder.buildSystemPrompt({ skills: [] });
        expect(prompt1).not.toContain('<skills>');

        const prompt2 = builder.buildSystemPrompt({});
        expect(prompt2).not.toContain('<skills>');
    });

    it('should not include <skills> block if all skills are disabled', () => {
        const builder = new PromptBuilder();
        const skills: Skill[] = [
            { id: 'skill1', name: 'Skill 1', description: 'Desc 1', enabled: false, path: '' }
        ];

        const prompt = builder.buildSystemPrompt({ skills });
        expect(prompt).not.toContain('<skills>');
    });

    it('should format enabled skills correctly in the <skills> block', () => {
        const builder = new PromptBuilder();
        const skills: Skill[] = [
            { id: 'db-expert', name: 'DB Expert', description: 'Handles database logic', enabled: true, path: '' },
            { id: 'disabled-skill', name: 'Disabled', description: 'Hidden', enabled: false, path: '' },
            { id: 'ui-expert', name: 'UI Expert', description: 'Builds UI', enabled: true, path: '' }
        ];

        const prompt = builder.buildSystemPrompt({ skills });

        expect(prompt).toContain('<skills>');
        expect(prompt).toContain('- **db-expert**: Handles database logic');
        expect(prompt).toContain('- **ui-expert**: Builds UI');
        expect(prompt).not.toContain('disabled-skill');
        expect(prompt).toContain('use the `load_skill` tool to load its full instructions');
    });

    it('should update default config base prompt via updateConfig', () => {
        const builder = new PromptBuilder();

        builder.updateConfig({ defaultBasePrompt: 'New Global Base Prompt' });

        const prompt = builder.buildSystemPrompt({});
        expect(prompt).toContain('New Global Base Prompt');
        expect(prompt).toContain('[System Environment]');
    });

    describe('tiered memory injection', () => {
        let tempDir: string;
        let filePath: string;
        let memoryStore: MemoryStore;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geni-prompt-test-'));
            filePath = path.join(tempDir, 'memory.md');
            memoryStore = new MemoryStore(filePath);
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it('should full-load preference memories and only inject titles for other categories', () => {
            memoryStore.save('lang pref', 'User prefers Chinese', 'preference');
            memoryStore.save('editor', 'User uses VS Code', 'preference');
            memoryStore.save('tech stack', 'React 19 + TypeScript', 'project');
            memoryStore.save('deploy flow', 'Build then push to S3', 'workflow');

            const builder = new PromptBuilder();
            const prompt = builder.buildSystemPrompt({ memoryStore });

            // Preference: full content injected
            expect(prompt).toContain('lang pref');
            expect(prompt).toContain('User prefers Chinese');
            expect(prompt).toContain('editor');
            expect(prompt).toContain('User uses VS Code');

            // Other categories: only titles, not full content
            expect(prompt).toContain('tech stack [project]');
            expect(prompt).not.toContain('React 19 + TypeScript');
            expect(prompt).toContain('deploy flow [workflow]');
            expect(prompt).not.toContain('Build then push to S3');
        });

        it('should work without memoryStore (just instructions)', () => {
            const builder = new PromptBuilder();
            const prompt = builder.buildSystemPrompt({});

            expect(prompt).toContain('<memory>');
            expect(prompt).toContain('memorize');
        });

        it('should include category guidance in instructions', () => {
            const builder = new PromptBuilder();
            const prompt = builder.buildSystemPrompt({ memoryStore });

            expect(prompt).toContain('preference');
            expect(prompt).toContain('project');
        });
    });
});
