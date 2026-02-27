import { describe, it, expect } from 'vitest';
import { PromptBuilder, AgentContext } from '@/main/services/agent/PromptBuilder';
import { Skill } from '@/common/types/skill';

describe('PromptBuilder', () => {
    it('should build prompt using default base prompt if not provided', () => {
        const builder = new PromptBuilder();
        const context: AgentContext = {};

        const prompt = builder.buildSystemPrompt(context);

        expect(prompt).toContain('You are Geni, a highly efficient AI coding assistant.');
        expect(prompt).not.toContain('<skills>');
    });

    it('should build prompt using provided base prompt in context', () => {
        const builder = new PromptBuilder();
        const context: AgentContext = {
            basePrompt: 'You are a Custom AI Assistant.'
        };

        const prompt = builder.buildSystemPrompt(context);

        expect(prompt).toBe('You are a Custom AI Assistant.');
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
        expect(prompt).toBe('New Global Base Prompt');
    });
});
