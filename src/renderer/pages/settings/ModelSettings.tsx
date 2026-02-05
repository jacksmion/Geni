import React, { useState } from 'react';
import { AppSettings, DEFAULT_PROVIDER_CONFIGS, ProviderConfig } from '../../../common/types/settings';
import { useSettingsStore } from '../../store/useSettingsStore';
import { clsx } from 'clsx';
import { Bot, Check, Globe, Key, Cpu, Zap, Search } from 'lucide-react';

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

    // 处理 Provider 切换（全局激活）
    const handleActivateProvider = (providerKey: string) => {
        updateSettings({
            llm: {
                ...settings.llm,
                activeProvider: providerKey
            }
        });
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

    // Filter providers
    const filteredProviders = Object.keys(DEFAULT_PROVIDER_CONFIGS).filter(key =>
        key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        PROVIDER_META[key]?.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex h-full gap-6 animate-in fade-in duration-500">
            {/* Left: Provider List */}
            <div className="w-64 shrink-0 flex flex-col gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                    <input
                        type="text"
                        placeholder="搜索模型平台..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-700 dark:text-gray-200"
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {filteredProviders.map(key => {
                        const meta = PROVIDER_META[key] || { icon: Bot, label: key, desc: 'Custom Provider' };
                        const isSelected = selectedProvider === key;
                        const isActive = settings.llm.activeProvider === key;
                        const Icon = meta.icon;

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
                                    {isActive && (
                                        <div className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">ON</div>
                                    )}
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
                                {settings.llm.activeProvider === selectedProvider ? '当前已启用' : '点击启用此模型'}
                            </span>
                            <button
                                onClick={() => handleActivateProvider(selectedProvider)}
                                className={clsx(
                                    "w-12 h-6 rounded-full transition-colors relative cursor-pointer",
                                    settings.llm.activeProvider === selectedProvider
                                        ? "bg-emerald-500"
                                        : "bg-slate-200 dark:bg-white/10"
                                )}
                            >
                                <div className={clsx(
                                    "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                                    settings.llm.activeProvider === selectedProvider ? "translate-x-6" : "translate-x-0"
                                )} />
                            </button>
                        </div>
                    </div>

                    {/* Config Form */}
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
                    </div>
                </div>
            </div>
        </div>
    );
}
