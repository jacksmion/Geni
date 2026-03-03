export enum ErrorCategory {
    Network = 'network',
    RateLimit = 'rate_limit',
    Authentication = 'auth',
    ToolExecution = 'tool',
    TokenLimit = 'token_limit',
    Unknown = 'unknown',
    Aborted = 'aborted'
}

export interface ClassifiedError {
    category: ErrorCategory;
    message: string;
    isRecoverable: boolean;
    suggestedAction?: string;
}

export function classifyError(error: any): ClassifiedError {
    const msg = error.message || String(error);
    const msgLower = msg.toLowerCase();

    if (msgLower.includes('aborted') || msgLower.includes('cancel')) {
        return {
            category: ErrorCategory.Aborted,
            message: '操作已取消',
            isRecoverable: false
        };
    }

    if (msgLower.includes('rate_limit') || msgLower.includes('429')) {
        return {
            category: ErrorCategory.RateLimit,
            message: 'API 调用频率限制',
            isRecoverable: true,
            suggestedAction: '请稍后重试，或检查您的 API 额度'
        };
    }

    if (msgLower.includes('enotfound') || msgLower.includes('econnrefused') || msgLower.includes('econnreset') || msgLower.includes('timeout') || msgLower.includes('network error') || msgLower.includes('fetch failed')) {
        return {
            category: ErrorCategory.Network,
            message: '网络连接失败',
            isRecoverable: true,
            suggestedAction: '请检查网络连接及代理设置'
        };
    }

    if (msgLower.includes('401') || msgLower.includes('invalid_api_key') || msgLower.includes('unauthorized')) {
        return {
            category: ErrorCategory.Authentication,
            message: 'API 认证失败',
            isRecoverable: false,
            suggestedAction: '请检查设置中的 API Key 是否正确'
        };
    }

    if (msgLower.includes('context_length_exceeded') || msgLower.includes('max_tokens') || msgLower.includes('exceeds maximum')) {
        return {
            category: ErrorCategory.TokenLimit,
            message: '上下文长度超限',
            isRecoverable: true,
            suggestedAction: '请清除部分历史对话后重试'
        };
    }

    return {
        category: ErrorCategory.Unknown,
        message: msg,
        isRecoverable: false
    };
}
