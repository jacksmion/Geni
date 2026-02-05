import React, { useEffect, useState } from 'react';
import { Save, Globe, Key, Cpu, Sparkles, CheckCircle2 } from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS } from '../../common/types/settings';

const Settings: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            const data = await window.electronAPI.getAppSettings();
            setSettings(data);
            setLoading(false);
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        await window.electronAPI.saveAppSettings(settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    if (loading) return null;

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-1">系统设置</h2>
                <p className="text-xs text-gray-500">配置模型提供商、API 密钥及其它偏好设置</p>
            </div>

            <div className="space-y-6">
                {/* LLM Section */}
                <section className="bg-[#2d2d2d] rounded-2xl border border-[#3c3c3c] overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#3c3c3c] bg-[#333333]/30 flex items-center gap-2">
                        <Sparkles size={18} className="text-indigo-400" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">大模型配置 (LLM)</h3>
                    </div>

                    <div className="p-6 space-y-5">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Globe size={12} /> 提供商 (Provider)
                            </label>
                            <select
                                value={settings.llm.provider}
                                onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, provider: e.target.value } })}
                                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            >
                                <option>OpenAI</option>
                                <option>Anthropic</option>
                                <option>DeepSeek</option>
                                <option>Local (Ollama/LM Studio)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Cpu size={12} /> 模型名称 (Model)
                            </label>
                            <input
                                type="text"
                                value={settings.llm.model}
                                onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, model: e.target.value } })}
                                placeholder="例如: gpt-4o, claude-3-5-sonnet"
                                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Key size={12} /> API 密钥 (API Key)
                            </label>
                            <input
                                type="password"
                                value={settings.llm.apiKey}
                                onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, apiKey: e.target.value } })}
                                placeholder="sk-..."
                                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                                API Base URL
                            </label>
                            <input
                                type="text"
                                value={settings.llm.baseUrl}
                                onChange={(e) => setSettings({ ...settings, llm: { ...settings.llm, baseUrl: e.target.value } })}
                                placeholder="https://api.openai.com/v1"
                                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                    </div>
                </section>

                {/* Action Bar */}
                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 font-medium"
                    >
                        {saved ? (
                            <>
                                <CheckCircle2 size={18} />
                                <span>已保存</span>
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                <span>保存配置</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
