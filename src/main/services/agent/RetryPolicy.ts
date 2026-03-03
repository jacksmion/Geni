export interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    retryableErrors: string[];
}

export const DEFAULT_LLM_RETRY: RetryOptions = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    retryableErrors: ['rate_limit', 'timeout', 'connection_error', '529', '503', '429', 'ECONNRESET', 'ETIMEDOUT']
};

export const DEFAULT_TOOL_RETRY: RetryOptions = {
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'timeout', 'network']
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions,
    onRetry?: (attempt: number, error: Error) => void,
    signal?: AbortSignal
): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
        if (signal?.aborted) {
            throw new Error('Aborted');
        }

        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            // 检查是否是被用户手动取消
            if (error.name === 'AbortError' || error.message?.toLowerCase().includes('aborted')) {
                throw error;
            }

            // 检查是否可重试
            const isRetryable = options.retryableErrors.some(e =>
                lastError.message?.toLowerCase().includes(e.toLowerCase()) ||
                lastError.name?.toLowerCase().includes(e.toLowerCase()) ||
                (lastError as any).code?.toLowerCase().includes(e.toLowerCase())
            );

            if (!isRetryable || attempt > options.maxRetries) {
                throw lastError;
            }

            // 指数退避计算
            const delay = Math.min(
                options.baseDelayMs * Math.pow(2, attempt - 1),
                options.maxDelayMs
            );

            onRetry?.(attempt, lastError);

            // 使用带有 abort 控制的计时器避免阻塞
            await new Promise<void>((resolve, reject) => {
                if (signal?.aborted) return reject(new Error('Aborted'));
                const timeoutId = setTimeout(resolve, delay);
                signal?.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Aborted'));
                });
            });
        }
    }

    throw lastError!;
}
