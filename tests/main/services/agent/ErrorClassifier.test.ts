import { describe, it, expect } from 'vitest';
import { classifyError, ClassifiedError } from '@/main/services/agent/ErrorClassifier';
import { ErrorCategory } from '@/common/types/agent';

describe('ErrorClassifier', () => {
    describe('classifyError', () => {
        it('should classify aborted operations', () => {
            const result = classifyError(new Error('Operation was aborted'));
            expect(result.category).toBe(ErrorCategory.Aborted);
            expect(result.isRecoverable).toBe(false);
        });

        it('should classify cancelled operations', () => {
            const result = classifyError(new Error('User cancelled the request'));
            expect(result.category).toBe(ErrorCategory.Aborted);
        });

        it('should classify rate limit errors', () => {
            const result = classifyError(new Error('rate_limit exceeded'));
            expect(result.category).toBe(ErrorCategory.RateLimit);
            expect(result.isRecoverable).toBe(true);
            expect(result.suggestedAction).toContain('API 额度');
        });

        it('should classify 429 errors', () => {
            const result = classifyError(new Error('HTTP 429 Too Many Requests'));
            expect(result.category).toBe(ErrorCategory.RateLimit);
        });

        it('should classify network errors', () => {
            const result = classifyError(new Error('ENOTFOUND: Cannot resolve host'));
            expect(result.category).toBe(ErrorCategory.Network);
            expect(result.isRecoverable).toBe(true);
            expect(result.suggestedAction).toContain('网络连接');
        });

        it('should classify connection refused errors', () => {
            const result = classifyError(new Error('ECONNREFUSED connection refused'));
            expect(result.category).toBe(ErrorCategory.Network);
        });

        it('should classify timeout errors', () => {
            const result = classifyError(new Error('Request timeout after 30000ms'));
            expect(result.category).toBe(ErrorCategory.Network);
        });

        it('should classify fetch failed errors', () => {
            const result = classifyError(new Error('fetch failed: network error'));
            expect(result.category).toBe(ErrorCategory.Network);
        });

        it('should classify authentication errors', () => {
            const result = classifyError(new Error('401 Invalid API key'));
            expect(result.category).toBe(ErrorCategory.Authentication);
            expect(result.isRecoverable).toBe(false);
            expect(result.suggestedAction).toContain('API Key');
        });

        it('should classify unauthorized errors', () => {
            const result = classifyError(new Error('Unauthorized access denied'));
            expect(result.category).toBe(ErrorCategory.Authentication);
        });

        it('should classify token limit errors', () => {
            const result = classifyError(new Error('context_length_exceeded: maximum tokens reached'));
            expect(result.category).toBe(ErrorCategory.TokenLimit);
            expect(result.isRecoverable).toBe(true);
            expect(result.suggestedAction).toContain('清除部分历史对话');
        });

        it('should classify max tokens errors', () => {
            const result = classifyError(new Error('This request exceeds max_tokens limit'));
            expect(result.category).toBe(ErrorCategory.TokenLimit);
        });

        it('should classify unknown errors as default', () => {
            const result = classifyError(new Error('Some unexpected error'));
            expect(result.category).toBe(ErrorCategory.Unknown);
            expect(result.isRecoverable).toBe(false);
            expect(result.message).toBe('Some unexpected error');
        });

        it('should handle string input', () => {
            const result = classifyError('rate_limit exceeded');
            expect(result.category).toBe(ErrorCategory.RateLimit);
        });
    });

    describe('ErrorCategory enum', () => {
        it('should have all expected categories', () => {
            expect(ErrorCategory.Aborted).toBeDefined();
            expect(ErrorCategory.RateLimit).toBeDefined();
            expect(ErrorCategory.Network).toBeDefined();
            expect(ErrorCategory.Authentication).toBeDefined();
            expect(ErrorCategory.TokenLimit).toBeDefined();
            expect(ErrorCategory.Unknown).toBeDefined();
        });
    });
});
