import React, { useState } from 'react';
import { AppSettings, DEFAULT_PROVIDER_CONFIGS, ProviderConfig } from '../../../common/types/settings';
import { useSettingsStore } from '../../store/useSettingsStore';
import { clsx } from 'clsx';
import { Bot, Check, Globe, Key, Cpu, Zap, Search, Loader2, Plus, X } from 'lucide-react';

// 定义支持的提供商元数据（图标、名称、状态等）
const PROVIDER_META: Record<string, { icon: any, label: string, desc: string }> = {
    'OpenAI': { icon: Bot, label: 'OpenAI', desc: 'GPT-4, GPT-3.5 Turbo' },
    'Anthropic': { icon: Bot, label: 'Anthropic', desc: 'Claude 3.5 Sonnet, Opus' },
    'DeepSeek': { icon: Bot, label: 'DeepSeek', desc: 'DeepSeek Chat, Coder' },
    'Local': { icon: Cpu, label: 'Local (Ollama)', desc: 'Llama 3, Mistral, Qwen' },
};

export function ModelSettings() {
    const { settings, updateSettings } = useSettingsStore();
    // 本地状态：当前选中的 Provider（用于显示右侧详情），默认选中当前激活的 Provider
    const [selectedProvider, setSelectedProvider] = useState<string>(settings.llm.activeProvider || 'OpenAI');
    const [searchTerm, setSearchTerm] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean, message: string } | null>(null);

    // Add Custom Provider State
    const [isAdding, setIsAdding] = useState(false);
    const [newProviderName, setNewProviderName] = useState('');

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await window.electronAPI.system.testLLM({
                apiKey: currentConfig.apiKey,
                baseUrl: currentConfig.baseUrl,
                model: currentConfig.model
            });
            setTestResult(result);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message });
        } finally {
            setIsTesting(false);
        }
    };

    // 处理 Provider 启用/禁用（独立开关，多个可同时启用）
    const handleToggleProvider = (providerKey: string) => {
        const currentProviders = settings.llm.providers;
        const config = currentProviders[providerKey] || DEFAULT_PROVIDER_CONFIGS[providerKey];
        const newEnabled = !config.enabled;

        const updatedProviders = {
            ...currentProviders,
            [providerKey]: {
                ...config,
                enabled: newEnabled
            }
        };

        // 如果当前 activeProvider 被禁用，自动切换到第一个已启用的 Provider
        let newActiveProvider = settings.llm.activeProvider;
        if (!newEnabled && providerKey === settings.llm.activeProvider) {
            const firstEnabled = Object.entries(updatedProviders).find(([_, cfg]) => cfg.enabled);
            newActiveProvider = firstEnabled ? firstEnabled[0] : providerKey;
        }
        // 如果启用了一个新的，且当前没有 activeProvider，则自动设为 activeProvider
        if (newEnabled && !Object.values(currentProviders).some(p => p.enabled)) {
            newActiveProvider = providerKey;
        }

        updateSettings({
            llm: {
                ...settings.llm,
                activeProvider: newActiveProvider,
                providers: updatedProviders
            }
        });
    };

    const handleAddProvider = () => {
        if (!newProviderName.trim()) return;
        const key = newProviderName.trim();

        // Check if exists
        if (settings.llm.providers[key] || DEFAULT_PROVIDER_CONFIGS[key]) {
            alert('Provider already exists!');
            return;
        }

        updateSettings({
            llm: {
                ...settings.llm,
                providers: {
                    ...settings.llm.providers,
                    [key]: { apiKey: '', baseUrl: '', model: '', temperature: 0.7 }
                }
            }
        });

        setSelectedProvider(key);
        setIsAdding(false);
        setNewProviderName('');
    };

    const handleDeleteProvider = (key: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`确认删除 "${key}" 配置吗?`)) {
            const { [key]: deleted, ...remainingProviders } = settings.llm.providers;

            // If deleting current, switch to default
            if (selectedProvider === key) {
                setSelectedProvider('OpenAI');
            }
            if (settings.llm.activeProvider === key) {
                updateSettings({
                    llm: {
                        ...settings.llm,
                        activeProvider: 'OpenAI',
                        providers: remainingProviders
                    }
                });
            } else {
                updateSettings({
                    llm: {
                        ...settings.llm,
                        providers: remainingProviders
                    }
                });
            }
        }
    };

    // 处理配置更新
    const updateConfig = (key: keyof ProviderConfig, value: string | number) => {
        const currentProviders = settings.llm.providers;
        const currentConfig = currentProviders[selectedProvider] || DEFAULT_PROVIDER_CONFIGS[selectedProvider];

        updateSettings({
            llm: {
                ...settings.llm,
                providers: {
                    ...currentProviders,
                    [selectedProvider]: {
                        ...currentConfig,
                        [key]: value
                    }
                }
            }
        });
    };

    const currentConfig = settings.llm.providers[selectedProvider] || DEFAULT_PROVIDER_CONFIGS[selectedProvider] || { apiKey: '', baseUrl: '', model: '', temperature: 0.7 };

    // Merge default providers and custom added providers from settings
    const allProviderKeys = Array.from(new Set([
        ...Object.keys(DEFAULT_PROVIDER_CONFIGS),
        ...Object.keys(settings.llm.providers)
    ]));

    // Filter providers
    const filteredProviders = allProviderKeys.filter(key =>
        key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (PROVIDER_META[key]?.label || key).toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex h-full gap-6 animate-in fade-in duration-500">
            {/* Left: Provider List */}
            <div className="w-64 shrink-0 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                        <input
                            type="text"
                            placeholder="搜索..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        />
                    </div>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="p-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 transition-colors"
                        title="Add Custom Provider"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                {isAdding && (
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl space-y-2 animate-in slide-in-from-top-2">
                        <input
                            type="text"
                            autoFocus
                            placeholder="Provider Name (e.g. My-LLM)"
                            value={newProviderName}
                            onChange={(e) => setNewProviderName(e.target.value)}
                            className="w-full bg-white dark:bg-black/20 border border-indigo-200 dark:border-indigo-500/30 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-slate-900 dark:text-slate-100"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddProvider()}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleAddProvider}
                                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs py-1.5 rounded-lg transition-colors"
                            >
                                Add
                            </button>
                            <button
                                onClick={() => setIsAdding(false)}
                                className="flex-1 bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-gray-400 text-xs py-1.5 rounded-lg hover:bg-slate-300 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {filteredProviders.map(key => {
                        const meta = PROVIDER_META[key] || { icon: Bot, label: key, desc: 'Custom Provider' };
                        const isSelected = selectedProvider === key;
                        const providerConfig = settings.llm.providers[key] || DEFAULT_PROVIDER_CONFIGS[key];
                        const isEnabled = providerConfig?.enabled ?? false;
                        const Icon = meta.icon;
                        const isCustom = !DEFAULT_PROVIDER_CONFIGS[key];

                        return (
                            <button
                                key={key}
                                onClick={() => setSelectedProvider(key)}
                                className={clsx(
                                    "w-full text-left p-3 rounded-xl border transition-all duration-200 group relative",
                                    isSelected
                                        ? "bg-white dark:bg-[#18181b] border-indigo-500/50 shadow-sm z-10"
                                        : "bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className={clsx(
                                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                            isSelected ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-gray-400"
                                        )}>
                                            <Icon size={18} />
                                        </div>
                                        <span className={clsx("font-medium text-sm", isSelected ? "text-slate-800 dark:text-white" : "text-slate-600 dark:text-gray-400")}>{meta.label}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {isEnabled && (
                                            <div className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">ON</div>
                                        )}
                                        {isCustom && (
                                            <div
                                                onClick={(e) => handleDeleteProvider(key, e)}
                                                className="p-1 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                                                title="Delete Provider"
                                            >
                                                <X size={14} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 dark:text-gray-500 truncate pl-[42px]">{meta.desc}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Right: Detailed Config */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl flex-1 flex flex-col shadow-sm">
                    {/* Detail Header */}
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{PROVIDER_META[selectedProvider]?.label || selectedProvider}</h2>
                            <a href="#" className="hidden text-xs text-indigo-500 hover:underline flex items-center gap-1">
                                <Globe size={12} />
                                官方文档
                            </a>
                        </div>

                        {/* Global Switch */}
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 dark:text-gray-400">
                                {(settings.llm.providers[selectedProvider] || DEFAULT_PROVIDER_CONFIGS[selectedProvider])?.enabled ? '当前已启用' : '点击启用此模型'}
                            </span>
                            <button
                                onClick={() => handleToggleProvider(selectedProvider)}
                                className={clsx(
                                    "w-12 h-6 rounded-full transition-colors relative cursor-pointer",
                                    (settings.llm.providers[selectedProvider] || DEFAULT_PROVIDER_CONFIGS[selectedProvider])?.enabled
                                        ? "bg-emerald-500"
                                        : "bg-slate-200 dark:bg-white/10"
                                )}
                            >
                                <div className={clsx(
                                    "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                                    (settings.llm.providers[selectedProvider] || DEFAULT_PROVIDER_CONFIGS[selectedProvider])?.enabled ? "translate-x-6" : "translate-x-0"
                                )} />
                            </button>
                        </div>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto">
                        {/* API Key */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center justify-between">
                                <div className="flex items-center gap-2"><Key size={14} /> API 密钥</div>
                                <span className="text-[10px] font-normal normal-case text-slate-400">仅存储于本地</span>
                            </label>
                            <input
                                type="password"
                                value={currentConfig.apiKey}
                                onChange={(e) => updateConfig('apiKey', e.target.value)}
                                placeholder="sk-..."
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200 font-mono"
                            />
                        </div>

                        {/* Base URL */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Globe size={14} /> API 地址 (Base URL)
                            </label>
                            <input
                                type="text"
                                value={currentConfig.baseUrl}
                                onChange={(e) => updateConfig('baseUrl', e.target.value)}
                                placeholder="https://api.openai.com/v1"
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200 font-mono"
                            />
                        </div>

                        {/* Model Name */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Cpu size={14} /> 模型名称 (Model)
                            </label>
                            <input
                                type="text"
                                value={currentConfig.model}
                                onChange={(e) => updateConfig('model', e.target.value)}
                                placeholder="gpt-4o"
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200"
                            />
                            <p className="text-[10px] text-slate-400 dark:text-gray-500">
                                手动输入要使用的模型 ID，例如: gpt-4o, claude-3-5-sonnet-latest
                            </p>
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleTestConnection}
                                    disabled={isTesting}
                                    className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-gray-300 text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                    测试连接
                                </button>

                                {testResult && (
                                    <div className={clsx(
                                        "text-xs flex items-center gap-2 px-3 py-1.5 rounded-lg animate-in fade-in slide-in-from-left-2",
                                        testResult.success ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                                    )}>
                                        {testResult.success ? <Check size={12} /> : null}
                                        {testResult.message}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
