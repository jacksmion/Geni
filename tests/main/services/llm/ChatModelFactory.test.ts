import { describe, it, expect } from 'vitest';
import { createChatModel } from '@/main/services/llm/ChatModelFactory';
import { OpenAIAdapter } from '@/main/services/llm/providers/OpenAIAdapter';
import { AnthropicAdapter } from '@/main/services/llm/providers/AnthropicAdapter';
import { ChatModelConfig } from '@/main/services/llm/IChatModel';

describe('ChatModelFactory', () => {
    const mockConfig: ChatModelConfig = {
        apiKey: 'test-key',
        model: 'test-model'
    };

    it('should create AnthropicAdapter for claude/anthropic provider IDs', () => {
        const claudeModel = createChatModel('claude', mockConfig);
        expect(claudeModel).toBeInstanceOf(AnthropicAdapter);

        const anthropicModel = createChatModel('AnThroPic', mockConfig); // Test case insensitivity
        expect(anthropicModel).toBeInstanceOf(AnthropicAdapter);
    });

    it('should create OpenAIAdapter for openai provider IDs', () => {
        const openaiModel = createChatModel('openai', mockConfig);
        expect(openaiModel).toBeInstanceOf(OpenAIAdapter);
    });

    it('should create OpenAIAdapter for deepseek provider IDs (compatible API)', () => {
        const dsModel = createChatModel('deepseek', mockConfig);
        expect(dsModel).toBeInstanceOf(OpenAIAdapter);
    });

    it('should create OpenAIAdapter for local/ollama provider IDs (compatible API)', () => {
        const ollamaModel = createChatModel('ollama', mockConfig);
        expect(ollamaModel).toBeInstanceOf(OpenAIAdapter);

        const localModel = createChatModel('local', mockConfig);
        expect(localModel).toBeInstanceOf(OpenAIAdapter);
    });

    it('should fallback to OpenAIAdapter generic compatible adapter for unknown providers', () => {
        const unknownModel = createChatModel('unknown-future-provider', mockConfig);
        expect(unknownModel).toBeInstanceOf(OpenAIAdapter);
    });
});
