import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, TrendingUp, Cpu, Hash, Calendar } from 'lucide-react';
import { UsageStats } from '../../../common/types/usage';
import { useSettingsStore } from '../../store/useSettingsStore';

export function UsageSettings() {
    const { t, i18n } = useTranslation();
    const settings = useSettingsStore(s => s.settings);
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const data = await (window as any).electronAPI.system.getUsageStats();
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch usage stats:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const getModelName = (modelId: string) => {
        // 1. Try to find in user settings (Full or Partial Match)
        for (const [providerId, provider] of Object.entries(settings.llm.providers)) {
            // 先尝试完全匹配模型 ID
            let found = provider.models?.find(m => m.model === modelId);
            
            // 如果没找到，尝试模糊匹配 (Endpoint ID 匹配)
            if (!found) {
                found = provider.models?.find(m => 
                    modelId.includes(m.model) || m.model.includes(modelId)
                );
            }

            if (found) return found.label;
        }

        // 2. Try to find in i18n translations (for built-ins)
        const i18nKey = `modelNames.${modelId}`;
        const translated = t(i18nKey);
        if (translated !== i18nKey) return translated;

        // 3. Specialized Pattern Matching (e.g. Volcengine)
        if (modelId.startsWith('ep-')) {
            return `火山引擎 (豆包) - ${modelId.substring(0, 10)}...`;
        }

        // 4. Fallback to modelId
        return modelId;
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64 text-slate-400">{t('usageSettings.loading')}</div>;
    }

    if (!stats || (stats.today.total_tokens === 0 && Object.keys(stats.byModel).length === 0)) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
                <BarChart3 size={48} className="opacity-20" />
                <p>{t('usageSettings.noData')}</p>
            </div>
        );
    }

    const formatNumber = (num: number) => new Intl.NumberFormat().format(num);

    return (
        <div className="max-w-4xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-indigo-500/10 to-purple-600/10 dark:from-indigo-500/20 dark:to-purple-600/20 border border-indigo-100 dark:border-indigo-500/30 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <TrendingUp size={100} />
                    </div>
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-300 mb-2">
                        <TrendingUp size={14} />
                        <span className="ui-text-meta font-semibold uppercase tracking-wider">{t('usageSettings.todayTotal')}</span>
                    </div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white">
                        {formatNumber(stats.today.total_tokens)}
                    </div>
                    <div className="ui-text-meta mt-2 text-indigo-500/60 dark:text-indigo-300/60 font-medium uppercase tracking-tight">{t('usageSettings.totalTokensToday')}</div>
                </div>

                <div className="bg-white dark:bg-[#18181b]/50 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400 mb-2">
                        <Hash size={14} />
                        <span className="ui-text-meta font-semibold uppercase tracking-wider">{t('usageSettings.promptTokens')}</span>
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                        {formatNumber(stats.today.prompt_tokens)}
                    </div>
                    <div className="ui-text-meta mt-2 text-slate-400 font-medium uppercase tracking-tight">{t('usageSettings.today')}</div>
                </div>

                <div className="bg-white dark:bg-[#18181b]/50 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400 mb-2">
                        <Cpu size={14} />
                        <span className="ui-text-meta font-semibold uppercase tracking-wider">{t('usageSettings.completionTokens')}</span>
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                        {formatNumber(stats.today.completion_tokens)}
                    </div>
                    <div className="ui-text-meta mt-2 text-slate-400 font-medium uppercase tracking-tight">{t('usageSettings.today')}</div>
                </div>
            </div>

            {/* Total Historical Usage (Optional but nice) */}
            <div className="p-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500 rounded-lg text-white">
                        <BarChart3 size={16} />
                    </div>
                    <div>
                        <div className="ui-text-meta text-slate-500 dark:text-gray-400 uppercase font-bold tracking-tighter">{t('usageSettings.allTimeUsage')}</div>
                        <div className="ui-text-body font-bold text-slate-800 dark:text-gray-200">{formatNumber(stats.total.total_tokens)} {t('usageSettings.tokens')}</div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="ui-text-caption text-slate-400 dark:text-gray-500 uppercase font-bold">{t('usageSettings.accumulated')}</div>
                    <div className="ui-text-meta font-mono text-slate-500">{formatNumber(stats.total.prompt_tokens)} P / {formatNumber(stats.total.completion_tokens)} C</div>
                </div>
            </div>

            {/* Usage by Model */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="ui-text-label font-bold text-slate-800 dark:text-gray-100 flex items-center gap-2">
                        <Cpu size={14} className="text-indigo-500" />
                        {t('usageSettings.byModel')}
                    </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(stats.byModel).map(([modelId, usage]) => {
                        const displayName = getModelName(modelId);
                        return (
                            <div key={modelId} className="p-3.5 bg-white dark:bg-[#18181b]/50 border border-slate-200 dark:border-white/5 rounded-2xl hover:border-indigo-500/30 transition-all group">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex flex-col">
                                        <span className="ui-text-meta font-bold text-slate-700 dark:text-gray-200 group-hover:text-indigo-500 transition-colors">{displayName}</span>
                                        {displayName !== modelId && (
                                            <span className="ui-text-caption text-slate-400 font-mono mt-0.5">{modelId}</span>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                                            {formatNumber(usage.total_tokens)}
                                        </div>
                                        <div className="ui-text-caption text-slate-400 uppercase font-bold">{t('usageSettings.total')}</div>
                                    </div>
                                </div>
                                
                                {/* Simple Progress Bar */}
                                <div className="h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden mb-2">
                                    <div 
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-1000 group-hover:bg-indigo-400" 
                                        style={{ width: `${stats.total.total_tokens > 0 ? Math.min(100, (usage.total_tokens / stats.total.total_tokens) * 100) : 0}%` }}
                                    ></div>
                                </div>
                                
                                <div className="ui-text-meta flex justify-between items-center">
                                    <span className="text-slate-500 dark:text-gray-400 flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-gray-600" />
                                        {t('usageSettings.promptTokens')}: <span className="font-mono">{formatNumber(usage.prompt_tokens)}</span>
                                    </span>
                                    <span className="text-slate-500 dark:text-gray-400 flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-50" />
                                        {t('usageSettings.completionTokens')}: <span className="font-mono">{formatNumber(usage.completion_tokens)}</span>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Daily History */}
            <section className="space-y-4">
                <h3 className="ui-text-label font-bold text-slate-800 dark:text-gray-100 flex items-center gap-2">
                    <Calendar size={14} className="text-purple-500" />
                    {t('usageSettings.dailyHistory')}
                </h3>
                <div className="bg-white dark:bg-[#18181b]/50 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                        {stats.daily.slice(0, 7).map((day) => (
                            <div key={day.date} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex flex-col items-center justify-center">
                                        <span className="ui-text-caption font-bold text-slate-400 uppercase leading-none">
                                            {new Date(day.date + 'T00:00:00').toLocaleDateString(i18n.language, { month: 'short' })}
                                        </span>
                                        <span className="ui-text-meta font-bold text-slate-600 dark:text-gray-300 leading-none mt-1">{day.date.split('-')[2]}</span>
                                    </div>
                                    <div>
                                        <div className="ui-text-meta font-bold text-slate-700 dark:text-gray-200">{day.date === new Date().toISOString().split('T')[0] ? t('usageSettings.today') : day.date}</div>
                                        <div className="ui-text-caption text-slate-400 font-bold uppercase tracking-tight">{day.recordCount} {t('usageSettings.requests')}</div>
                                    </div>
                                </div>
                                <div className="flex gap-8">
                                    <div className="text-right hidden sm:block">
                                        <div className="ui-text-caption text-slate-400 font-bold uppercase">{t('usageSettings.prompt')}</div>
                                        <div className="ui-text-meta font-medium text-slate-600 dark:text-gray-300 font-mono tracking-tighter">{formatNumber(day.prompt_tokens)}</div>
                                    </div>
                                    <div className="text-right hidden sm:block">
                                        <div className="ui-text-caption text-slate-400 font-bold uppercase">{t('usageSettings.completion')}</div>
                                        <div className="ui-text-meta font-medium text-slate-600 dark:text-gray-300 font-mono tracking-tighter">{formatNumber(day.completion_tokens)}</div>
                                    </div>
                                    <div className="text-right min-w-[100px]">
                                        <div className="ui-text-caption text-indigo-500 font-black uppercase tracking-widest mb-0.5">{t('usageSettings.totalUsage')}</div>
                                        <div className="ui-text-meta font-bold text-indigo-600 dark:text-indigo-400 font-mono tracking-tighter">{formatNumber(day.total_tokens)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Maintenance Note */}
            <div className="text-center pt-5 border-t border-slate-100 dark:border-white/5">
                <p className="ui-text-meta text-slate-400 font-medium uppercase tracking-widest">
                    {t('usageSettings.maintenanceNote')}
                </p>
            </div>
        </div>
    );
}
