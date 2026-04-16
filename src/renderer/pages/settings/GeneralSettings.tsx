import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';
import { Switch } from '../../components/Switch';

export function GeneralSettings() {
    const language = useSettingsStore(s => s.settings.language);
    const autoStart = useSettingsStore(s => s.settings.autoStart);
    const autoOpenArtifact = useSettingsStore(s => s.settings.autoOpenArtifact);
    const allowFullDiskAccess = useSettingsStore(s => s.settings.allowFullDiskAccess);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();

    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle');
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [downloadProgress, setDownloadProgress] = useState<any>(null);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [currentVersion, setCurrentVersion] = useState<string>('');

    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.update) return;

        api.update.getVersion().then(setCurrentVersion);

        const unsubs = [
            api.update.onChecking(() => setUpdateStatus('checking')),
            api.update.onUpdateAvailable((info: any) => {
                setUpdateStatus('available');
                setUpdateInfo(info);
            }),
            api.update.onUpdateNotAvailable(() => setUpdateStatus('not-available')),
            api.update.onDownloadProgress((prog: any) => {
                setUpdateStatus('downloading');
                setDownloadProgress(prog);
            }),
            api.update.onUpdateDownloaded((info: any) => {
                setUpdateStatus('downloaded');
                setUpdateInfo(info);
            }),
            api.update.onError((err: string) => {
                setUpdateStatus('error');
                setUpdateError(err);
            }),
        ];

        return () => unsubs.forEach(unsub => unsub?.());
    }, []);

    const handleCheckUpdate = () => {
        setUpdateError(null);
        setUpdateStatus('checking');
        (window as any).electronAPI.update.checkForUpdates().catch((err: any) => {
            setUpdateStatus('error');
            setUpdateError(err.message || 'Check failed');
        });
    };

    const handleDownload = () => {
        (window as any).electronAPI.update.downloadUpdate();
    };

    const handleInstall = () => {
        (window as any).electronAPI.update.quitAndInstall();
    };

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
                    <h3 className="text-sm font-medium text-slate-700 dark:text-gray-300">{t('generalSettings.autoOpenArtifact')}</h3>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-gray-400">{t('generalSettings.autoOpenArtifactDesc')}</span>
                        <Switch
                            checked={autoOpenArtifact ?? true}
                            onChange={(checked) => updateSettings({ autoOpenArtifact: checked })}
                        />
                    </div>
                </div>

                {/* Full Disk Access */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-gray-300">{t('generalSettings.fullDiskAccess')}</h3>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-gray-400">{t('generalSettings.fullDiskAccessDesc')}</span>
                        <Switch
                            checked={allowFullDiskAccess ?? false}
                            onChange={(checked) => updateSettings({ allowFullDiskAccess: checked })}
                        />
                    </div>
                </div>

                {/* Update Settings */}
                <div className="pt-6 border-t border-slate-200 dark:border-white/10 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h3 className="text-sm font-medium text-slate-700 dark:text-gray-300">{t('generalSettings.softwareUpdate')}</h3>
                            <p className="text-xs text-slate-500 dark:text-gray-500">{t('generalSettings.currentVersion', { version: currentVersion })}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-slate-500 dark:text-gray-500">{t('generalSettings.autoCheckUpdate')}</span>
                            <Switch
                                checked={useSettingsStore.getState().settings.autoUpdate ?? true}
                                onChange={(checked) => updateSettings({ autoUpdate: checked })}
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-200 dark:border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                {updateStatus === 'idle' && (
                                    <p className="text-sm text-slate-600 dark:text-gray-400">{t('generalSettings.checkUpdateDesc')}</p>
                                )}
                                {updateStatus === 'checking' && (
                                    <p className="text-sm text-indigo-500 animate-pulse">{t('generalSettings.checkingUpdate')}</p>
                                )}
                                {updateStatus === 'available' && (
                                    <p className="text-sm text-emerald-500 font-medium">{t('generalSettings.newVersionFound', { version: updateInfo?.version })}</p>
                                )}
                                {updateStatus === 'not-available' && (
                                    <p className="text-sm text-slate-500">{t('generalSettings.isLatestVersion')}</p>
                                )}
                                {updateStatus === 'downloading' && (
                                    <div className="space-y-2 w-full min-w-[200px]">
                                        <p className="text-sm text-indigo-500">{t('generalSettings.downloadingUpdate', { percent: Math.round(downloadProgress?.percent || 0) })}</p>
                                        <div className="h-1.5 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-indigo-500 transition-all duration-300" 
                                                style={{ width: `${downloadProgress?.percent || 0}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {updateStatus === 'downloaded' && (
                                    <p className="text-sm text-emerald-500 font-medium">{t('generalSettings.updateDownloaded')}</p>
                                )}
                                {updateStatus === 'error' && (
                                    <p className="text-sm text-rose-500">{t('generalSettings.updateError', { error: updateError })}</p>
                                )}
                            </div>

                            <div className="flex gap-2">
                                {updateStatus === 'available' ? (
                                    <button
                                        onClick={handleDownload}
                                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                        {t('generalSettings.downloadNow')}
                                    </button>
                                ) : updateStatus === 'downloaded' ? (
                                    <button
                                        onClick={handleInstall}
                                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                        {t('generalSettings.installNow')}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCheckUpdate}
                                        disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                                        className="px-4 py-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        {updateStatus === 'checking' ? t('generalSettings.checking') : t('generalSettings.checkNow')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
