import { describe, it, expect } from 'vitest';
import { SkillParser } from '@/main/services/skills/core/SkillParser';

describe('SkillParser', () => {
    it('should parse valid skill markdown properly', () => {
        const rawContent = `---
id: test-skill
name: Test Skill
description: A mock skill for testing
version: 1.2.3
metadata:
  customField: value
---

# Instruction
Do this and that.`;

        const skill = SkillParser.parse(rawContent, 'folder/SKILL.md');

        expect(skill.id).toBe('test-skill');
        expect(skill.name).toBe('Test Skill');
        expect(skill.description).toBe('A mock skill for testing');
        expect(skill.version).toBe('1.2.3');
        expect(skill.metadata).toEqual({ customField: 'value' });
        expect(skill.instruction).toBe('# Instruction\nDo this and that.');
        expect(skill.path).toBe('folder/SKILL.md');
    });

    it('should fallback to name for id and 1.0.0 for version if omitted', () => {
        const rawContent = `---
name: Fallback Skill
description: Shows fallback behavior
---
Body text.`;

        const skill = SkillParser.parse(rawContent);

        expect(skill.id).toBe('Fallback Skill');
        expect(skill.name).toBe('Fallback Skill');
        expect(skill.version).toBe('1.0.0');
        expect(skill.instruction).toBe('Body text.');
    });

    it('should fallback version from metadata.version if available', () => {
        const rawContent = `---
name: Meta Version Skill
description: Reads version from metamap
metadata:
  version: "2.0.0"
---
content`;

        const skill = SkillParser.parse(rawContent);

        expect(skill.version).toBe('2.0.0');
    });

    it('should throw Zod formatted error if required fields are missing', () => {
        const invalidContent = `---
id: broken-skill
---
Missing name and description`;

        expect(() => SkillParser.parse(invalidContent, 'broken.md')).toThrowError(/Invalid skill metadata in broken.md/);
    });
});
