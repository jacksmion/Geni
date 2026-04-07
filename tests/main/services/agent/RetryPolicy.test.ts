import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, DEFAULT_LLM_RETRY, DEFAULT_TOOL_RETRY, RetryOptions } from '@/main/services/agent/RetryPolicy';

describe('RetryPolicy', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('withRetry', () => {
        it('should return result on successful execution', async () => {
            const fn = vi.fn().mockResolvedValue('success');
            const result = await withRetry(fn, DEFAULT_LLM_RETRY);
            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should throw on first attempt when not retryable', async () => {
            const error = new Error('Invalid API key');
            const fn = vi.fn().mockRejectedValue(error);

            await expect(withRetry(fn, DEFAULT_LLM_RETRY)).rejects.toThrow('Invalid API key');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should throw on non-retryable error with 401 code', async () => {
            const error = new Error('401 Unauthorized');
            const fn = vi.fn().mockRejectedValue(error);

            await expect(withRetry(fn, DEFAULT_LLM_RETRY)).rejects.toThrow('401 Unauthorized');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should call onRetry callback on retryable errors', async () => {
            const retryableError = new Error('rate_limit exceeded');
            const fn = vi.fn()
                .mockRejectedValueOnce(retryableError)
                .mockRejectedValueOnce(retryableError)
                .mockResolvedValueOnce('success');
            const onRetry = vi.fn();

            const result = await withRetry(fn, DEFAULT_LLM_RETRY, onRetry);

            expect(result).toBe('success');
            expect(onRetry).toHaveBeenCalledTimes(2);
            expect(onRetry).toHaveBeenNthCalledWith(1, 1, retryableError);
        });

        it('should not retry on AbortError', async () => {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            const fn = vi.fn().mockRejectedValue(abortError);
            const onRetry = vi.fn();

            await expect(withRetry(fn, DEFAULT_LLM_RETRY, onRetry)).rejects.toThrow('Aborted');
            expect(fn).toHaveBeenCalledTimes(1);
            expect(onRetry).not.toHaveBeenCalled();
        });

        it('should check error code for retryability', async () => {
            const error529 = new Error('Service temporarily unavailable');
            (error529 as any).code = '529';
            const fn = vi.fn()
                .mockRejectedValueOnce(error529)
                .mockResolvedValueOnce('success');
            const onRetry = vi.fn();

            const result = await withRetry(fn, DEFAULT_LLM_RETRY, onRetry);

            expect(result).toBe('success');
            expect(onRetry).toHaveBeenCalledTimes(1);
        });

        it('should check error name for retryability', async () => {
            const error = new Error('Connection timeout');
            error.name = 'ETIMEDOUT';
            const fn = vi.fn()
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce('success');
            const onRetry = vi.fn();

            const result = await withRetry(fn, DEFAULT_LLM_RETRY, onRetry);

            expect(result).toBe('success');
        });
    });

    describe('DEFAULT_LLM_RETRY', () => {
        it('should have reasonable default values', () => {
            expect(DEFAULT_LLM_RETRY.maxRetries).toBe(3);
            expect(DEFAULT_LLM_RETRY.baseDelayMs).toBe(1000);
            expect(DEFAULT_LLM_RETRY.maxDelayMs).toBe(10000);
            expect(DEFAULT_LLM_RETRY.retryableErrors).toContain('rate_limit');
            expect(DEFAULT_LLM_RETRY.retryableErrors).toContain('timeout');
        });

        it('should include common HTTP error codes', () => {
            expect(DEFAULT_LLM_RETRY.retryableErrors).toContain('429');
            expect(DEFAULT_LLM_RETRY.retryableErrors).toContain('503');
            expect(DEFAULT_LLM_RETRY.retryableErrors).toContain('529');
        });
    });

    describe('DEFAULT_TOOL_RETRY', () => {
        it('should have different values than LLM retry', () => {
            expect(DEFAULT_TOOL_RETRY.maxRetries).toBeLessThan(DEFAULT_LLM_RETRY.maxRetries);
            expect(DEFAULT_TOOL_RETRY.baseDelayMs).toBeLessThan(DEFAULT_LLM_RETRY.baseDelayMs);
        });

        it('should include network-related errors', () => {
            expect(DEFAULT_TOOL_RETRY.retryableErrors).toContain('ECONNRESET');
            expect(DEFAULT_TOOL_RETRY.retryableErrors).toContain('ETIMEDOUT');
            expect(DEFAULT_TOOL_RETRY.retryableErrors).toContain('ENOTFOUND');
        });
    });
});
