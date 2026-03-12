import fs from 'fs';
import { TokenUsage, UsageRecord, UsageStats, DailyUsage } from '../../../common/types/usage';
import { PathManager } from '../PathManager';

/**
 * UsageManager - Token 用量统计管理服务
 * 
 * 职责:
 * - 记录每一轮对话的 Token 消耗
 * - 按照日期、模型、提供商进行聚合汇总
 * - 数据持久化到 usage.json
 */
export class UsageManager {
    private usagePath: string;
    private records: UsageRecord[] = [];

    constructor(private pathManager: PathManager) {
        this.usagePath = this.pathManager.getUsageFile();
        this.loadRecords();
    }

    /**
     * 记录一次 Token 消耗
     */
    public recordUsage(record: Omit<UsageRecord, 'id' | 'timestamp'>): void {
        const fullRecord: UsageRecord = {
            ...record,
            id: Math.random().toString(36).substring(7),
            timestamp: Date.now(),
        };

        this.records.push(fullRecord);
        this.saveRecords();
    }

    /**
     * 获取汇总统计信息
     */
    public getStats(): UsageStats {
        const total: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        const dailyMap = new Map<string, DailyUsage>();
        const byModel: Record<string, TokenUsage> = {};
        const byProvider: Record<string, TokenUsage> = {};

        for (const rec of this.records) {
            // 总计
            total.prompt_tokens += rec.prompt_tokens;
            total.completion_tokens += rec.completion_tokens;
            total.total_tokens += rec.total_tokens;

            // 按天汇总
            const date = new Date(rec.timestamp).toISOString().split('T')[0];
            if (!dailyMap.has(date)) {
                dailyMap.set(date, { date, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, recordCount: 0 });
            }
            const daily = dailyMap.get(date)!;
            daily.prompt_tokens += rec.prompt_tokens;
            daily.completion_tokens += rec.completion_tokens;
            daily.total_tokens += rec.total_tokens;
            daily.recordCount++;

            // 按模型汇总
            if (!byModel[rec.modelId]) byModel[rec.modelId] = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            byModel[rec.modelId].prompt_tokens += rec.prompt_tokens;
            byModel[rec.modelId].completion_tokens += rec.completion_tokens;
            byModel[rec.modelId].total_tokens += rec.total_tokens;

            // 按提供商汇总
            if (!byProvider[rec.providerId]) byProvider[rec.providerId] = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            byProvider[rec.providerId].prompt_tokens += rec.prompt_tokens;
            byProvider[rec.providerId].completion_tokens += rec.completion_tokens;
            byProvider[rec.providerId].total_tokens += rec.total_tokens;
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const today = dailyMap.get(todayStr) || { date: todayStr, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, recordCount: 0 };

        return {
            total,
            today,
            daily: Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
            byModel,
            byProvider,
        };
    }

    private loadRecords(): void {
        try {
            if (fs.existsSync(this.usagePath)) {
                const data = fs.readFileSync(this.usagePath, 'utf-8');
                this.records = JSON.parse(data);
            }
        } catch (error) {
            console.error('[UsageManager] Failed to load usage records:', error);
            this.records = [];
        }
    }

    private saveRecords(): void {
        try {
            // 限制记录数量，防止文件过大（仅保留最近 10000 条，旧记录已在汇总逻辑中可被忽略或导出）
            if (this.records.length > 10000) {
                this.records = this.records.slice(-10000);
            }
            fs.writeFileSync(this.usagePath, JSON.stringify(this.records, null, 2));
        } catch (error) {
            console.error('[UsageManager] Failed to save usage records:', error);
        }
    }
}
