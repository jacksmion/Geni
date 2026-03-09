import React from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';
import { Switch } from '../../components/Switch';

export function GeneralSettings() {
    const language = useSettingsStore(s => s.settings.language);
    const autoStart = useSettingsStore(s => s.settings.autoStart);
    const autoOpenArtifact = useSettingsStore(s => s.settings.autoOpenArtifact);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();

    return (
        <div className="max-w-3xl space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="mb-6 hidden">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100 mb-1">通用</h2>
            </div>

            <section className="space-y-8">
                {/* Language */}
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-gray-300">{t('generalSettings.language')}</span>
                    <select
                        value={language || 'zh'}
                        onChange={(e) => updateSettings({ language: e.target.value as 'zh' | 'en' })}
                        className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32"
                    >
                        <option value="zh">{t('generalSettings.zh')}</option>
                        <option value="en">{t('generalSettings.en')}</option>
                    </select>
                </div>

                {/* Auto Start */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-gray-300">{t('generalSettings.autoStart')}</h3>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-gray-400">{t('generalSettings.autoStartDesc')}</span>
                        <Switch
                            checked={autoStart || false}
                            onChange={(checked) => updateSettings({ autoStart: checked })}
                        />
                    </div>
                </div>

                {/* Auto-open Artifact */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-gray-300">自动打开 Artifact 面板</h3>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-gray-400">调用工具产生输出时，是否自动弹窗显示详情</span>
                        <Switch
                            checked={autoOpenArtifact ?? true}
                            onChange={(checked) => updateSettings({ autoOpenArtifact: checked })}
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}
