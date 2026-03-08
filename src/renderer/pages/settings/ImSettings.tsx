import React, { useState } from 'react';
import { Bot, Save, CheckCircle2 } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';

export function ImSettings() {
    const telegramConfig = useSettingsStore(s => s.settings.telegram);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();
    const telegram = telegramConfig || { enabled: false, token: '', proxyUrl: '' };

    const [token, setToken] = useState(telegram.token);
    const [proxyUrl, setProxyUrl] = useState(telegram.proxyUrl || '');
    const [enabled, setEnabled] = useState(telegram.enabled);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        await updateSettings({
            telegram: {
                enabled,
                token,
                proxyUrl
            }
        });

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="max-w-3xl space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-white/10">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-gray-100">{t('imSettings.title')}</h2>
                    <p className="text-sm text-slate-500 dark:text-gray-400">{t('imSettings.desc')}</p>
                </div>
                <div className="ml-auto">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white border border-transparent peer-checked:border-transparent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
                    </label>
                </div>
            </div>

            <div className={`space-y-4 transition-all duration-300 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">
                        {t('imSettings.tokenLabel')}
                    </label>
                    <input
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                        className="w-full px-3 py-2 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-gray-200"
                    />
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                        {t('imSettings.tokenDesc')}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">
                        {t('imSettings.proxyLabel')}
                    </label>
                    <input
                        type="text"
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                        placeholder="http://127.0.0.1:7890"
                        className="w-full px-3 py-2 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-gray-200"
                    />
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                        {t('imSettings.proxyDesc')}
                    </p>
                </div>
            </div>

            <div className="pt-6 border-t border-slate-200 dark:border-white/10">
                <button
                    onClick={handleSave}
                    disabled={saved}
                    className="flex items-center justify-center gap-2 px-6 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-black rounded-lg text-sm font-medium transition-colors w-full sm:w-auto ml-auto"
                >
                    {saved ? (
                        <>
                            <CheckCircle2 size={16} className="text-green-500" />
                            {t('imSettings.saved')}
                        </>
                    ) : (
                        <>
                            <Save size={16} />
                            {t('imSettings.saving')}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
