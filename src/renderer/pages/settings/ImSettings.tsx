import React, { useState, useEffect } from 'react';
import { Bot, Save, CheckCircle2, Send, ShieldCheck, Globe, Key, Search, Zap, Loader2, MessageSquare, Plus, Bell, X } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { SaveStatusBar } from '../../components/SaveStatusBar';
import { TelegramConfig } from '../../../common/types/settings';

export function ImSettings() {
    const telegramConfig = useSettingsStore(s => s.settings.telegram);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();

    // 定义支持的 IM 提供商元数据 (Move inside component to use 't')
    const IM_PROVIDERS = [
        { id: 'telegram', label: 'Telegram', icon: Bot, desc: t('imSettings.providerTgDesc'), color: '#0088cc' },
        { id: 'discord', label: 'Discord', icon: MessageSquare, desc: t('imSettings.providerDiscordDesc'), color: '#5865F2', comingSoon: true },
        { id: 'slack', label: 'Slack', icon: Zap, desc: t('imSettings.providerSlackDesc'), color: '#4A154B', comingSoon: true },
    ];

    // --- State ---
    const [selectedIM, setSelectedIM] = useState('telegram');
    const [isSaving, setIsSaving] = useState(false);
    
    // Telegram Draft State
    const [tgDraft, setTgDraft] = useState<TelegramConfig>(telegramConfig || { enabled: false, token: '', proxyUrl: '' });
    
    // Test Status
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Sync from store when changed externally
    useEffect(() => {
        if (telegramConfig) {
            setTgDraft(telegramConfig);
        }
    }, [telegramConfig]);

    const isDirty = JSON.stringify(tgDraft) !== JSON.stringify(telegramConfig);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSettings({
                telegram: tgDraft
            });
        } catch (e) {
            console.error("Failed to save IM settings", e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setTgDraft(telegramConfig || { enabled: false, token: '', proxyUrl: '' });
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await window.electronAPI.system.testTelegram(tgDraft);
            setTestResult(result);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message || 'Connection failed' });
        } finally {
            setIsTesting(false);
        }
    };

    const selectedProviderMeta = IM_PROVIDERS.find(p => p.id === selectedIM);

    return (
        <div className="flex h-full gap-6 animate-in fade-in duration-500 relative">
            {/* Left Box: IM Provider List */}
            <div className="w-64 shrink-0 flex flex-col gap-4">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">
                    {t('imSettings.providers')}
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                    {IM_PROVIDERS.map(provider => {
                        const isSelected = selectedIM === provider.id;
                        const isComingSoon = provider.comingSoon;
                        
                        return (
                            <button
                                key={provider.id}
                                disabled={isComingSoon}
                                onClick={() => setSelectedIM(provider.id)}
                                className={clsx(
                                    "w-full text-left p-3 rounded-xl border transition-all relative group",
                                    isSelected 
                                        ? "bg-white dark:bg-[#18181b] border-indigo-500/30 shadow-sm" 
                                        : "bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5",
                                    isComingSoon && "opacity-50 cursor-not-allowed grayscale"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div 
                                        className={clsx(
                                            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                            isSelected ? "shadow-inner" : "bg-slate-100 dark:bg-white/5"
                                        )}
                                        style={isSelected ? { backgroundColor: `${provider.color}20`, color: provider.color } : {}}
                                    >
                                        <provider.icon size={18} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={clsx("text-sm font-semibold truncate", isSelected ? "text-slate-900 dark:text-white" : "text-slate-500")}>
                                                {provider.label}
                                            </span>
                                            {isComingSoon && (
                                                <span className="text-[8px] bg-slate-200 dark:bg-white/10 text-slate-500 px-1 rounded uppercase">{t('imSettings.comingSoon')}</span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-slate-400 truncate leading-tight">
                                            {provider.desc}
                                        </span>
                                    </div>
                                </div>
                                {isSelected && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Right Box: Configuration Panel */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl flex-1 flex flex-col shadow-sm overflow-hidden">
                    {selectedIM === 'telegram' ? (
                        <>
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-2xl bg-[#0088cc]/10 text-[#0088cc]">
                                        <Bot size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-800 dark:text-white">{t('imSettings.tgBotTitle')}</h2>
                                        <p className="text-xs text-slate-500 dark:text-gray-400">{t('imSettings.tgBotDesc')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={clsx("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full", tgDraft.enabled ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10" : "bg-slate-100 text-slate-500 dark:bg-white/10")}>
                                        {tgDraft.enabled ? t('on') : t('off')}
                                    </span>
                                    <button 
                                        onClick={() => setTgDraft({...tgDraft, enabled: !tgDraft.enabled})}
                                        className={clsx("w-10 h-5 rounded-full relative transition-colors", tgDraft.enabled ? "bg-emerald-500" : "bg-slate-200 dark:bg-white/10")}
                                    >
                                        <div className={clsx("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", tgDraft.enabled ? "translate-x-5" : "translate-x-0")} />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
                                {/* Token Section */}
                                <div className="space-y-4">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Key size={14} /> {t('imSettings.tokenLabel')}
                                    </label>
                                    <div className="relative">
                                        <input 
                                            type="password" 
                                            value={tgDraft.token}
                                            onChange={(e) => setTgDraft({...tgDraft, token: e.target.value})}
                                            placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                                            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl px-5 py-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-700 dark:text-gray-200"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">
                                            <ShieldCheck size={20} />
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-gray-500 pl-1 leading-relaxed">
                                        {t('imSettings.tokenDesc')}
                                    </p>
                                </div>

                                {/* Proxy Section */}
                                <div className="space-y-4">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Globe size={14} /> {t('imSettings.proxyLabel')}
                                    </label>
                                    <input 
                                        type="text" 
                                        value={tgDraft.proxyUrl || ''}
                                        onChange={(e) => setTgDraft({...tgDraft, proxyUrl: e.target.value})}
                                        placeholder="http://127.0.0.1:7890"
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl px-5 py-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-700 dark:text-gray-200"
                                    />
                                    <p className="text-xs text-slate-500 dark:text-gray-500 pl-1">
                                        {t('imSettings.proxyDesc')}
                                    </p>
                                </div>

                                {/* Testing Section */}
                                <div className="pt-6 border-t border-slate-100 dark:border-white/5">
                                    <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-3xl p-6 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('imSettings.connectivityCheck')}</h4>
                                            <p className="text-xs text-slate-500">{t('imSettings.connectivityCheckDesc')}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            {testResult && (
                                                <div className={clsx(
                                                    "text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2",
                                                    testResult.success 
                                                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" 
                                                        : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                                                )}>
                                                    {testResult.success ? <CheckCircle2 size={14} /> : <X size={14} />}
                                                    {testResult.message}
                                                </div>
                                            )}
                                            <button 
                                                onClick={handleTestConnection}
                                                disabled={isTesting || !tgDraft.token}
                                                className="px-6 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2 active:scale-95"
                                            >
                                                {isTesting ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} fill="currentColor" />}
                                                {t('imSettings.testConnection')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center flex-1 text-slate-400 space-y-4">
                            <Plus size={48} className="opacity-10" />
                            <p className="text-sm uppercase tracking-widest font-bold">{t('imSettings.comingSoon')}</p>
                            <p className="text-xs">{t('imSettings.comingSoonDesc', { name: selectedProviderMeta?.label })}</p>
                        </div>
                    )}
                </div>
            </div>

            <SaveStatusBar 
                isDirty={isDirty} 
                isSaving={isSaving} 
                onSave={handleSave} 
                onReset={handleReset} 
            />
        </div>
    );
}
