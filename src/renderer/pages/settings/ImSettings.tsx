import React, { useState, useEffect } from 'react';
import { Bot, CheckCircle2, ShieldCheck, Globe, Key, Zap, Loader2, X, Building2, MessageSquare } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { QRCodeSVG } from 'qrcode.react';
import { SaveStatusBar } from '../../components/SaveStatusBar';
import { Switch } from '../../components/Switch';
import { TelegramConfig, WeComConfig, LarkConfig, WechatConfig } from '../../../common/types/settings';

export function ImSettings() {
    const telegramConfig = useSettingsStore(s => s.settings.telegram);
    const wecomConfig = useSettingsStore(s => s.settings.wecom);
    const wechatConfig = useSettingsStore(s => s.settings.wechat);
    const larkConfig = useSettingsStore(s => s.settings.lark);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();

    // --- State ---
    const [selectedIM, setSelectedIM] = useState('telegram');
    const [isSaving, setIsSaving] = useState(false);

    // Draft States
    const [tgDraft, setTgDraft] = useState<TelegramConfig>(telegramConfig || { enabled: false, token: '', proxyUrl: '' });
    const [wecomDraft, setWecomDraft] = useState<WeComConfig>(wecomConfig || { enabled: false, botId: '', secret: '' });
    const [wechatDraft, setWechatDraft] = useState<WechatConfig>(wechatConfig || { enabled: false });
    const [larkDraft, setLarkDraft] = useState<LarkConfig>(larkConfig || { enabled: false, appId: '', appSecret: '' });

    // WeChat QR State
    // WeChat QR State
    const [wechatQrUrl, setWechatQrUrl] = useState<string | null>(null);
    const [wechatConnected, setWechatConnected] = useState(false);

    // Drafts Ref for callbacks
    const draftsRef = React.useRef({ tgDraft, wecomDraft, wechatDraft, larkDraft });
    useEffect(() => {
        draftsRef.current = { tgDraft, wecomDraft, wechatDraft, larkDraft };
    }, [tgDraft, wecomDraft, wechatDraft, larkDraft]);

    // Test Status
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Sync from store when changed externally
    useEffect(() => {
        if (telegramConfig) setTgDraft(telegramConfig);
        if (wecomConfig) setWecomDraft(wecomConfig);
        if (wechatConfig) setWechatDraft(wechatConfig);
        if (larkConfig) setLarkDraft(larkConfig);
    }, [telegramConfig, wecomConfig, wechatConfig, larkConfig]);

    useEffect(() => {
        if (window.electronAPI?.system?.onWechatQr) {
            const unsubscribe = window.electronAPI.system.onWechatQr((payload) => {
                if (payload === 'connected') {
                    setWechatConnected(true);
                    setWechatQrUrl((prevUrl) => {
                        // Automatically enable and save when wechat is connected
                        const drafts = draftsRef.current;
                        if (!drafts.wechatDraft.enabled) {
                            const newWechatDraft = { ...drafts.wechatDraft, enabled: true };
                            setWechatDraft(newWechatDraft);
                            useSettingsStore.getState().updateSettings({
                                telegram: drafts.tgDraft,
                                wecom: drafts.wecomDraft,
                                wechat: newWechatDraft,
                                lark: drafts.larkDraft
                            }).catch(console.error);
                        }
                        return null;
                    });
                } else if (payload === 'disconnected') {
                    setWechatConnected(false);
                    setWechatQrUrl(null);
                } else if (payload) {
                    setWechatConnected(false);
                    setWechatQrUrl(payload);
                }
            });
            return unsubscribe;
        }
    }, []);

    useEffect(() => {
        if (selectedIM === 'wechat') {
            window.electronAPI?.system?.testWechat?.().catch?.((e: any) => console.error(e));
        }
    }, [selectedIM]);

    const isDirty = JSON.stringify(tgDraft) !== JSON.stringify(telegramConfig) ||
        JSON.stringify(wecomDraft) !== JSON.stringify(wecomConfig) ||
        JSON.stringify(wechatDraft) !== JSON.stringify(wechatConfig) ||
        JSON.stringify(larkDraft) !== JSON.stringify(larkConfig);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSettings({
                telegram: tgDraft,
                wecom: wecomDraft,
                wechat: wechatDraft,
                lark: larkDraft
            });
        } catch (e) {
            console.error("Failed to save IM settings", e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setTgDraft(telegramConfig || { enabled: false, token: '', proxyUrl: '' });
        setWecomDraft(wecomConfig || { enabled: false, botId: '', secret: '' });
        setWechatDraft(wechatConfig || { enabled: false });
        setLarkDraft(larkConfig || { enabled: false, appId: '', appSecret: '' });
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            let result: { success: boolean; message: string } | null = null;
            if (selectedIM === 'telegram') {
                result = await window.electronAPI.system.testTelegram(tgDraft);
            } else if (selectedIM === 'wecom') {
                result = await window.electronAPI.system.testWeCom(wecomDraft);
            } else if (selectedIM === 'lark') {
                result = await window.electronAPI.system.testLark(larkDraft);
            }
            if (result) setTestResult(result);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message || 'Connection failed' });
        } finally {
            setIsTesting(false);
        }
    };

    const IM_PROVIDERS: { id: string; label: string; icon: any; desc: string; color: string; enabled: boolean; onToggle: (val: boolean) => void }[] = [
        {
            id: 'telegram',
            label: 'Telegram',
            icon: Bot,
            desc: t('imSettings.providerTgDesc'),
            color: '#0088cc',
            enabled: tgDraft.enabled,
            onToggle: (val) => setTgDraft({ ...tgDraft, enabled: val })
        },
        {
            id: 'wecom',
            label: t('imSettings.wecomBotTitle'),
            icon: Building2,
            desc: t('imSettings.providerWeComDesc'),
            color: '#1877f2',
            enabled: wecomDraft.enabled,
            onToggle: (val) => setWecomDraft({ ...wecomDraft, enabled: val })
        },
        {
            id: 'lark',
            label: t('imSettings.larkBotTitle'),
            icon: MessageSquare,
            desc: t('imSettings.providerLarkDesc'),
            color: '#3370ff',
            enabled: larkDraft.enabled,
            onToggle: (val) => setLarkDraft({ ...larkDraft, enabled: val })
        },
        {
            id: 'wechat',
            label: 'WeChat (微信)',
            icon: Bot,
            desc: '扫码登录微信个人号接入 Agent',
            color: '#07c160',
            enabled: wechatDraft.enabled,
            onToggle: (val) => setWechatDraft({ ...wechatDraft, enabled: val })
        },
    ];

    const getSelectedColor = () => {
        const p = IM_PROVIDERS.find(p => p.id === selectedIM);
        return p?.color || '#6366f1';
    };

    return (
        <div className="flex h-full gap-6 animate-in fade-in duration-500 relative">
            {/* Left Box: IM Provider List */}
            <div className="w-56 shrink-0 flex flex-col gap-4">
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
                    {t('imSettings.providers')}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                    {IM_PROVIDERS.map(provider => {
                        const isSelected = selectedIM === provider.id;

                        return (
                            <div
                                key={provider.id}
                                onClick={() => {
                                    setSelectedIM(provider.id);
                                    setTestResult(null);
                                }}
                                className={clsx(
                                    "p-3 rounded-2xl border transition-all cursor-pointer group flex items-center justify-between",
                                    isSelected
                                        ? "bg-indigo-50/50 dark:bg-indigo-500/10 border-indigo-500/30 shadow-sm"
                                        : "bg-white dark:bg-[#18181b] border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10"
                                )}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div
                                        className={clsx(
                                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
                                            isSelected ? "bg-indigo-500 text-white shadow-indigo-200 dark:shadow-none" : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-white/10"
                                        )}
                                        style={!isSelected ? { borderLeft: `3px solid ${provider.color}` } : {}}
                                    >
                                        <provider.icon size={18} />
                                    </div>
                                    <span className={clsx("text-sm font-bold truncate", isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300")}>
                                        {provider.label}
                                    </span>
                                </div>

                                <div onClick={(e) => e.stopPropagation()} className="ml-2 scale-90">
                                    <Switch
                                        size="sm"
                                        checked={provider.enabled}
                                        onChange={(val) => {
                                            provider.onToggle(val);
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right Box: Configuration Panel */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-3xl flex-1 flex flex-col shadow-sm overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                        {(() => {
                            const current = IM_PROVIDERS.find(p => p.id === selectedIM);
                            const Icon = current?.icon;
                            const isConnected = selectedIM === 'wechat' ? wechatConnected : !!testResult?.success;
                            return (
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-2xl shadow-sm transition-colors"
                                        style={{ backgroundColor: `${current?.color || '#6366f1'}1a`, color: current?.color || '#6366f1' }}>
                                        {Icon && <Icon size={24} />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">
                                                {current?.label}
                                            </h2>
                                            <div className={clsx(
                                                "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                                isConnected
                                                    ? "bg-emerald-500/10 text-emerald-500"
                                                    : "bg-slate-100 text-slate-400 dark:bg-white/5"
                                            )}>
                                                <div className={clsx("w-1.5 h-1.5 rounded-full", isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-slate-600")} />
                                                {isConnected ? t('modelSettings.connected') : t('mcpSettings.notConnected')}
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            {current?.desc}
                                        </p>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    <div className="p-10 space-y-10 overflow-y-auto custom-scrollbar flex-1">
                        {selectedIM === 'telegram' && (
                            <>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <Key size={14} className="text-indigo-500/70" /> {t('imSettings.tokenLabel')}
                                    </label>
                                    <input
                                        type="password"
                                        value={tgDraft.token}
                                        onChange={(e) => setTgDraft({ ...tgDraft, token: e.target.value })}
                                        placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-700 dark:text-gray-200 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <Globe size={14} className="text-indigo-500/70" /> {t('imSettings.proxyLabel')}
                                    </label>
                                    <input
                                        type="text"
                                        value={tgDraft.proxyUrl || ''}
                                        onChange={(e) => setTgDraft({ ...tgDraft, proxyUrl: e.target.value })}
                                        placeholder="http://127.0.0.1:7890"
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-700 dark:text-gray-200 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                    />
                                </div>
                            </>
                        )}

                        {selectedIM === 'wecom' && (
                            <>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <Zap size={14} className="text-indigo-500/70" /> {t('imSettings.wecomBotIdLabel')}
                                    </label>
                                    <input
                                        type="text"
                                        value={wecomDraft.botId}
                                        onChange={(e) => setWecomDraft({ ...wecomDraft, botId: e.target.value })}
                                        placeholder="Enter Bot ID"
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-700 dark:text-gray-200 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <Key size={14} className="text-indigo-500/70" /> {t('imSettings.wecomSecretLabel')}
                                    </label>
                                    <input
                                        type="password"
                                        value={wecomDraft.secret}
                                        onChange={(e) => setWecomDraft({ ...wecomDraft, secret: e.target.value })}
                                        placeholder="Enter Bot Secret"
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-700 dark:text-gray-200 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                    />
                                </div>
                            </>
                        )}

                        {selectedIM === 'lark' && (
                            <>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <Zap size={14} className="text-indigo-500/70" /> {t('imSettings.larkAppIdLabel')}
                                    </label>
                                    <input
                                        type="text"
                                        value={larkDraft.appId}
                                        onChange={(e) => setLarkDraft({ ...larkDraft, appId: e.target.value })}
                                        placeholder="cli_a1b2c3d4e5f6g7h8"
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-700 dark:text-gray-200 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <Key size={14} className="text-indigo-500/70" /> {t('imSettings.larkAppSecretLabel')}
                                    </label>
                                    <input
                                        type="password"
                                        value={larkDraft.appSecret}
                                        onChange={(e) => setLarkDraft({ ...larkDraft, appSecret: e.target.value })}
                                        placeholder="Enter App Secret"
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-700 dark:text-gray-200 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                    />
                                </div>
                            </>
                        )}

                        {selectedIM === 'wechat' && (
                            <div className="space-y-4">

                                {wechatConnected && (
                                    <div className="flex flex-col items-center justify-center p-8 border border-emerald-200 dark:border-emerald-800/30 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 text-center shadow-sm">
                                        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-800/40 rounded-full flex items-center justify-center mb-4 text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-50 dark:ring-emerald-900/20">
                                            <Bot size={36} />
                                        </div>
                                        <p className="text-emerald-800 dark:text-emerald-400 font-bold text-lg flex items-center gap-2">
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                            </span>
                                            微信机器人在线中
                                        </p>
                                        <p className="text-emerald-600 dark:text-emerald-500 text-sm mt-2">
                                            身份验证成功，您可以随时在微信中与我对话了。
                                        </p>
                                    </div>
                                )}
                                {!wechatConnected && wechatQrUrl && (
                                    <div className="flex flex-col items-center justify-center p-8 border border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-black/20 text-center">
                                        <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">
                                            <QRCodeSVG value={wechatQrUrl} size={200} />
                                        </div>
                                        <p className="mt-4 text-sm font-bold text-slate-700 dark:text-gray-300">
                                            请使用微信扫描二维码登录
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            （若二维码过期或未显示，请尝试重新关闭后开启并保存）
                                        </p>
                                    </div>
                                )}
                                {!wechatConnected && !wechatQrUrl && (
                                    <div className="flex flex-col items-center justify-center p-8 border border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-black/20 text-center">
                                        <Loader2 size={32} className="animate-spin text-indigo-500 mb-4" />
                                        <p className="text-sm font-bold text-slate-700 dark:text-gray-300">
                                            正在检查登录状态或生成二维码...
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            请耐心等待（初次登录需几秒，已登录则会自动就绪）
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedIM !== 'wechat' && (
                            <div className="pt-6">
                                <button
                                    onClick={handleTestConnection}
                                    disabled={isTesting || (selectedIM === 'telegram' ? !tgDraft.token : (selectedIM === 'wecom' ? (!wecomDraft.botId || !wecomDraft.secret) : (!larkDraft.appId || !larkDraft.appSecret)))}
                                    className="w-full bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-2xl py-4 flex items-center justify-center gap-2 font-bold transition-all active:scale-[0.98] shadow-sm shadow-indigo-500/10 disabled:opacity-30 disabled:pointer-events-none"
                                >
                                    {isTesting ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <ShieldCheck size={18} />
                                    )}
                                    <span className="text-sm tracking-tight">{t('imSettings.testConnection')}</span>
                                </button>

                                {testResult && (
                                    <div className={clsx(
                                        "mt-4 p-5 rounded-2xl flex items-start gap-4 animate-in slide-in-from-top-2 duration-300",
                                        testResult.success
                                            ? "bg-emerald-50/50 dark:bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20"
                                            : "bg-red-50/50 dark:bg-red-500/5 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20"
                                    )}>
                                        <div className={clsx("mt-0.5", testResult.success ? "text-emerald-500" : "text-red-500")}>
                                            {testResult.success ? <CheckCircle2 size={18} /> : <X size={18} />}
                                        </div>
                                        <div className="flex-1 flex flex-col gap-1">
                                            <span className="text-sm font-bold">{testResult.success ? t('modelSettings.connected') : t('modelSettings.testFailed')}</span>
                                            <span className="text-xs opacity-80 leading-relaxed font-medium">{testResult.message}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
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
