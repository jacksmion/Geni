/**
 * usage.ts - Token 用量统计相关类型定义
 */

export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

/**
 * 单次 LLM 调用用量记录
 */
export interface UsageRecord extends TokenUsage {
    id: string;
    sessionId: string;
    modelId: string;
    providerId: string;
    timestamp: number;
    /** 是否为估算值 (当 API 未返回 usage 时由 TokenCounter 计算) */
    isEstimated?: boolean;
}

/**
 * 按天汇总统计
 */
export interface DailyUsage {
    date: string; // YYYY-MM-DD
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    recordCount: number;
}

/**
 * 统计查询结果
 */
export interface UsageStats {
    total: TokenUsage;
    today: TokenUsage;
    daily: DailyUsage[];
    byModel: Record<string, TokenUsage>;
    byProvider: Record<string, TokenUsage>;
}
