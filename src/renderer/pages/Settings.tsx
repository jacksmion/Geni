import React, { useEffect, useState } from 'react';
import { Save, Globe, Key, Cpu, Sparkles, CheckCircle2, Zap, Palette } from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS, ProviderConfig, DEFAULT_PROVIDER_CONFIGS } from '../../common/types/settings';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { McpSettingsSection } from '../components/McpSettingsSection';
import { ACCENT_COLORS, AccentColor, applyTheme } from '../utils/theme';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// 预设模型列表（用于快捷选择）
const PROVIDER_MODELS: Record<string, { label: string; models: string[] }> = {
    'OpenAI': {
        label: 'OpenAI',
        models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    'Anthropic': {
        label: 'Anthropic',
        models: ['claude-3-5-sonnet-latest', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229']
    },
    'DeepSeek': {
        label: 'DeepSeek',
        models: ['deepseek-chat', 'deepseek-coder']
    },
    'Local': {
        label: 'Local (Ollama)',
        models: ['llama3:latest', 'qwen2.5:latest', 'mistral:latest']
    }
};

const Settings: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await window.electronAPI.getAppSettings();
                if (data) {
                    // 合并默认配置，确保新增的提供商也有默认值
                    const mergedProviders = { ...DEFAULT_PROVIDER_CONFIGS, ...data.llm?.providers };
                    setSettings({
                        ...DEFAULT_SETTINGS,
                        ...data,
                        llm: {
                            ...DEFAULT_SETTINGS.llm,
                            ...data.llm,
                            providers: mergedProviders
                        }
                    });

                    // Apply theme immediately on load if set
                    if (data.accentColor) {
                        applyTheme(data.accentColor);
                    }
                }
            } catch (err) {
                console.error("Failed to load settings:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        try {
            await window.electronAPI.saveAppSettings(settings);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);

            const remoteSettings = await window.electronAPI.getAppSettings();
            setSettings(remoteSettings);
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('保存配置失败，请检查控制台日志');
        }
    };

    // Handle Accent Color Change
    const handleAccentChange = (color: AccentColor) => {
        setSettings(prev => ({ ...prev, accentColor: color }));
        // Apply immediately for preview
        applyTheme(color);
    };

    // 切换提供商（仅切换 activeProvider，不改变配置）
    const handleProviderChange = (newProvider: string) => {
        setSettings({
            ...settings,
            llm: {
                ...settings.llm,
                activeProvider: newProvider
            }
        });
    };

    // 更新当前提供商的配置
    const updateCurrentProviderConfig = (field: keyof ProviderConfig, value: string | number) => {
        const activeProvider = settings.llm.activeProvider;
        setSettings({
            ...settings,
            llm: {
                ...settings.llm,
                providers: {
                    ...settings.llm.providers,
                    [activeProvider]: {
                        ...settings.llm.providers[activeProvider],
                        [field]: value
                    }
                }
            }
        });
    };

    const activeProvider = settings.llm.activeProvider;
    const currentConfig = settings.llm.providers[activeProvider] || DEFAULT_PROVIDER_CONFIGS[activeProvider];
    const currentProviderModels = PROVIDER_MODELS[activeProvider];

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                    <span className="text-xs text-gray-500 font-medium">配置加载中...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto animate-in fade-in duration-500">
            <div className="mb-10">
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">系统设置</h2>
                <p className="text-sm text-gray-400">配置模型提供商、API 密钥及其它偏好设置</p>
            </div>

            <div className="space-y-8">
                {/* Theme Section */}
                <section className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                    <div className="px-8 py-5 border-b border-white/5 bg-white/5 flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <Palette size={18} className="text-indigo-400" />
                        </div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">界面主题 (Interface)</h3>
                    </div>

                    <div className="p-8">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">
                            主题色 (Accent Color)
                        </label>
                        <div className="flex flex-wrap gap-4">
                            {Object.keys(ACCENT_COLORS).map((colorKey) => {
                                const color = colorKey as AccentColor;
                                const isSelected = settings.accentColor === color;
                                // Use the 500 shade for the button background
                                const bgStyle = { backgroundColor: `rgb(${ACCENT_COLORS[color][500]})` };

                                return (
                                    <button
                                        key={color}
                                        onClick={() => handleAccentChange(color)}
                                        className={cn(
                                            "w-12 h-12 rounded-full ring-2 ring-offset-2 ring-offset-[#1a1a1a] transition-all transform hover:scale-110",
                                            isSelected ? "ring-white scale-110" : "ring-transparent hover:ring-white/20"
                                        )}
                                        style={bgStyle}
                                        title={color}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* LLM Section */}
                <section className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                    <div className="px-8 py-5 border-b border-white/5 bg-white/5 flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <Sparkles size={18} className="text-indigo-400" />
                        </div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">大模型配置 (LLM)</h3>
                    </div>

                    <div className="p-8 space-y-6">
                        {/* Provider Selection */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Globe size={12} /> 提供商 (Provider)
                            </label>
                            <div className="relative">
                                <select
                                    value={activeProvider}
                                    onChange={(e) => handleProviderChange(e.target.value)}
                                    className="w-full appearance-none bg-black/20 border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-black/30 transition-all text-gray-200 cursor-pointer"
                                >
                                    {Object.keys(PROVIDER_MODELS).map((key) => (
                                        <option key={key} value={key} className="bg-[#1a1a1a] text-gray-200">
                                            {PROVIDER_MODELS[key].label}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-600 mt-1.5 ml-1">
                                每个提供商的配置独立保存，切换时会自动加载对应配置
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Model Name */}
                            <div className="flex flex-col gap-2">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <Cpu size={12} /> 模型名称 (Model)
                                </label>

                                {/* Quick Select Chips */}
                                {currentProviderModels && (
                                    <div className="flex flex-wrap gap-2 mb-1">
                                        {currentProviderModels.models.map(model => (
                                            <button
                                                key={model}
                                                onClick={() => updateCurrentProviderConfig('model', model)}
                                                className={cn(
                                                    "px-2.5 py-1 rounded-lg text-[10px] border transition-all",
                                                    currentConfig.model === model
                                                        ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                                                        : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                                                )}
                                            >
                                                {model}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="relative group">
                                    <input
                                        type="text"
                                        value={currentConfig.model}
                                        onChange={(e) => updateCurrentProviderConfig('model', e.target.value)}
                                        placeholder="输入自定义模型..."
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 pl-10 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-black/30 transition-all text-gray-200 placeholder:text-gray-600"
                                    />
                                    <Zap size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
                                </div>
                                <p className="text-[10px] text-gray-600 ml-1">
                                    点击上方标签快速填入，或在输入框中输入自定义模型 ID
                                </p>
                            </div>

                            {/* API Key */}
                            <div className="flex flex-col gap-2">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <Key size={12} /> API 密钥 (API Key)
                                </label>
                                <div className="h-[26px] mb-1" /> {/* Spacer to align with chips */}
                                <input
                                    type="password"
                                    value={currentConfig.apiKey}
                                    onChange={(e) => updateCurrentProviderConfig('apiKey', e.target.value)}
                                    placeholder={activeProvider === 'Local' ? "本地模式通常无需 Key" : "sk-..."}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-black/30 transition-all text-gray-200 placeholder:text-gray-600 font-mono tracking-wide"
                                />
                                <p className="text-[10px] text-gray-600 ml-1">
                                    密钥仅存储在本地，不会上传至任何服务器
                                </p>
                            </div>
                        </div>

                        {/* Base URL */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                                API Base URL
                            </label>
                            <input
                                type="text"
                                value={currentConfig.baseUrl}
                                onChange={(e) => updateCurrentProviderConfig('baseUrl', e.target.value)}
                                placeholder="https://api.openai.com/v1"
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-black/30 transition-all text-gray-200 placeholder:text-gray-600 font-mono"
                            />
                            {activeProvider === 'Local' && (
                                <p className="text-[10px] text-amber-500/80 mt-1.5 ml-1">
                                    提示: 也可以尝试 http://127.0.0.1:11434/v1 或本机 IP
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                {/* MCP Section */}
                <McpSettingsSection />

                {/* Action Bar */}
                <div className="flex justify-end pt-4 pb-8">
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-indigo-600/30 font-medium tracking-wide group"
                    >
                        {saved ? (
                            <>
                                <CheckCircle2 size={18} className="text-emerald-200" />
                                <span>已保存配置</span>
                            </>
                        ) : (
                            <>
                                <Save size={18} className="group-hover:scale-110 transition-transform" />
                                <span>保存所有更改</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
