import { describe, it, expect } from 'vitest';
import { extractTextFromPrompt } from '@/main/services/agent/types';

describe('extractTextFromPrompt', () => {
    it('should return string input as-is', () => {
        expect(extractTextFromPrompt('hello world')).toBe('hello world');
    });

    it('should extract text from ContentPart array', () => {
        const parts = [
            { type: 'text' as const, text: 'hello' },
            { type: 'image_url' as const, image_url: { url: 'http://example.com/img.png' } },
            { type: 'text' as const, text: 'world' },
        ];
        expect(extractTextFromPrompt(parts)).toBe('hello world');
    });

    it('should return empty string for empty ContentPart array', () => {
        expect(extractTextFromPrompt([])).toBe('');
    });

    it('should return empty string for array with no text parts', () => {
        const parts = [
            { type: 'image_url' as const, image_url: { url: 'http://example.com/img.png' } },
        ];
        expect(extractTextFromPrompt(parts)).toBe('');
    });
});
