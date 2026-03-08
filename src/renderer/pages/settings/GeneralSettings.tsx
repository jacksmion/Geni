import React from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';

export function GeneralSettings() {
    const language = useSettingsStore(s => s.settings.language);
    const autoStart = useSettingsStore(s => s.settings.autoStart);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();

    return (
        <div className="max-w-3xl space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="mb-6 hidden">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100 mb-1">通用</h2>
            </div>
            {/* We already have a header in Settings.tsx, but the screenshot shows "通用", so let's check if the screenshot is from GeneralSettings. The screenshot shows "通用", but wait: Settings.tsx has "通用" in the header! So I don't need a heading here? Wait, Settings.tsx has `h1` in the header. The image shows a large "通用". So it's probably just rendered by Settings.tsx header, and here we just render the content. Wait, I will just make the content match. */}

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
                        <button
                            role="switch"
                            aria-checked={autoStart || false}
                            onClick={(e) => {
                                e.preventDefault();
                                updateSettings({ autoStart: !(autoStart || false) });
                            }}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${autoStart ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                        >
                            <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoStart ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                            />
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
