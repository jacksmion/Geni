import React, { useEffect, useState } from 'react';
import { Save, Globe, Key, Cpu, Sparkles, CheckCircle2, Zap } from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS } from '../../common/types/settings';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { McpSettingsSection } from '../features/settings/McpSettingsSection';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// 预设配置数据
const PROVIDER_CONFIGS: Record<string, { label: string; baseUrl: string; models: string[] }> = {
    'OpenAI': {
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    'Anthropic': {
        label: 'Anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        models: ['claude-3-5-sonnet-latest', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229']
    },
    'DeepSeek': {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        models: ['deepseek-chat', 'deepseek-coder']
    },
    'Local': {
        label: 'Local (Ollama)',
        baseUrl: 'http://localhost:11434/v1',
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
                if (data) setSettings(data);
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

            // 可选：触发一个全局事件或重新拉取最新配置以确保一致性
            const remoteSettings = await window.electronAPI.getAppSettings();
            setSettings(remoteSettings);
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('保存配置失败，请检查控制台日志');
        }
    };

    // 切换提供商时，自动填充 Base URL（如果当前为空或为默认值）
    const handleProviderChange = (newProvider: string) => {
        const config = PROVIDER_CONFIGS[newProvider];
        const oldConfig = PROVIDER_CONFIGS[settings.llm.provider];

        let newBaseUrl = settings.llm.baseUrl;

        // 如果当前 BaseUrl 是空的，或者是旧提供商的默认 URL，则切换到新提供商的默认 URL
        if (!newBaseUrl || (oldConfig && newBaseUrl === oldConfig.baseUrl)) {
            newBaseUrl = config?.baseUrl || '';
        }

        setSettings({
            ...settings,
            llm: {
                ...settings.llm,
                provider: newProvider,
                baseUrl: newBaseUrl
            }
        });
    };

    const currentProviderConfig = PROVIDER_CONFIGS[settings.llm.provider];

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
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {Object.keys(PROVIDER_CONFIGS).map((key) => (
                                    <button
                                        key={key}
                                        onClick={() => handleProviderChange(key)}
                                        className={cn(
                                            "relative px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200 text-left overflow-hidden group",
                                            settings.llm.provider === key
                                                ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                                                : "bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
                                        )}
                                    >
                                        <span className="relative z-10">{PROVIDER_CONFIGS[key].label}</span>
                                        {settings.llm.provider === key && (
                                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Model Name */}
                            <div className="flex flex-col gap-2">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <Cpu size={12} /> 模型名称 (Model)
                                </label>

                                {/* Quick Select Chips */}
                                {currentProviderConfig && (
                                    <div className="flex flex-wrap gap-2 mb-1">
                                        {currentProviderConfig.models.map(model => (
                                            <button
                                                key={model}
                                                onClick={() => setSettings({ ...settings, llm: { ...settings.llm, model } })}
                                                className={cn(
                                                    "px-2.5 py-1 rounded-lg text-[10px] border transition-all",
                                                    settings.llm.model === model
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
                                        value={settings.llm.model}
                                        onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, model: e.target.value } })}
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
                                    value={settings.llm.apiKey}
                                    onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, apiKey: e.target.value } })}
                                    placeholder={settings.llm.provider === 'Local' ? "本地模式通常无需 Key" : "sk-..."}
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
                                value={settings.llm.baseUrl}
                                onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, baseUrl: e.target.value } })}
                                placeholder="https://api.openai.com/v1"
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-black/30 transition-all text-gray-200 placeholder:text-gray-600 font-mono"
                            />
                            {settings.llm.provider === 'Local' && (
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
