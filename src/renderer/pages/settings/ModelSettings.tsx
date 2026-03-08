import React, { useState, useEffect } from 'react';
import { AppSettings, DEFAULT_PROVIDER_CONFIGS, ProviderConfig, ModelInstance } from '../../../common/types/settings';
import { useSettingsStore } from '../../store/useSettingsStore';
import { clsx } from 'clsx';
import { 
    Bot, Check, Globe, Key, Cpu, Zap, Search, Loader2, Plus, X, 
    Download, Upload, RefreshCw, Star, Trash2, Edit2, ChevronDown,
    Brain, Cloud, MessageSquare, Orbit, Monitor, Terminal
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SaveStatusBar } from '../../components/SaveStatusBar';
import { Switch } from '../../components/Switch';

// 定义支持的提供商元数据
const PROVIDER_ICONS: Record<string, (props: any) => React.ReactNode> = {
    'OpenAI': (props) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
    ),
    'Anthropic': (props) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 22h14M12 2v20M5 12h14" /></svg>
    ),
    'DeepSeek': (props) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><circle cx="12" cy="11" r="3" /></svg>
    )
};

const PROVIDER_META: Record<string, { icon: any, label: string, desc: string, color?: string }> = {
    'OpenAI': { icon: PROVIDER_ICONS['OpenAI'], label: 'OpenAI', desc: 'GPT-5.2, GPT-4o', color: '#10a37f' },
    'Anthropic': { icon: PROVIDER_ICONS['Anthropic'], label: 'Anthropic', desc: 'Claude 4.6 Opus/Sonnet', color: '#d97757' },
    'DeepSeek': { icon: PROVIDER_ICONS['DeepSeek'], label: 'DeepSeek', desc: 'DeepSeek-V3.2', color: '#4d6df1' },
    'ZhipuAI': { icon: Globe, label: '智谱 AI', desc: 'GLM-4, GLM-3', color: '#343b4d' },
    'Volcengine': { icon: Cloud, label: '火山引擎', desc: 'Doubao 豆包模型', color: '#ff4d4f' },
    'Qwen': { icon: MessageSquare, label: '通义千问', desc: 'Qwen 3.5, Qwen 3', color: '#6340ff' },
    'MiniMax': { icon: Orbit, label: 'MiniMax', desc: 'MiniMax M2.5', color: '#ff7a00' },
    'Ollama': { icon: Cpu, label: 'Ollama', desc: 'Llama 3, Mistral (Local)', color: '#444' },
    'LM Studio': { icon: Monitor, label: 'LM Studio', desc: 'Local OpenAI Server', color: '#6366f1' },
    'Local': { icon: Terminal, label: 'Local (Custom)', desc: 'Custom OpenAI-compatible', color: '#64748b' },
};

export function ModelSettings() {
    const llm = useSettingsStore(s => s.settings.llm);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();
    
    // --- Local Draft & Dirty Logic ---
    const [llmDraft, setLlmDraft] = useState({...llm});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setLlmDraft({...llm});
    }, [llm]);

    const isDirty = JSON.stringify(llmDraft) !== JSON.stringify(llm);

    const [selectedProvider, setSelectedProvider] = useState<string>(llmDraft.activeProvider || 'OpenAI');
    const [searchTerm, setSearchTerm] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean, message: string } | null>(null);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [showModelPicker, setShowModelPicker] = useState(false);

    const [isAdding, setIsAdding] = useState(false);
    const [newProviderName, setNewProviderName] = useState('');

    const [showModelEditor, setShowModelEditor] = useState(false);
    const [editingModelIndex, setEditingModelIndex] = useState<number | null>(null);
    const [modelForm, setModelForm] = useState({ label: '', model: '', supportVision: false, temperature: 0.7 });

    const currentProviderConfig = llmDraft.providers[selectedProvider] || DEFAULT_PROVIDER_CONFIGS[selectedProvider] || { apiKey: '', baseUrl: '', enabled: false, models: [] };
    
    // API Config Local State (Internal to UI)
    const [apiKeyInput, setApiKeyInput] = useState(currentProviderConfig.apiKey || '');
    const [baseUrlInput, setBaseUrlInput] = useState(currentProviderConfig.baseUrl || '');

    useEffect(() => {
        setApiKeyInput(currentProviderConfig.apiKey || '');
        setBaseUrlInput(currentProviderConfig.baseUrl || '');
    }, [selectedProvider, currentProviderConfig.apiKey, currentProviderConfig.baseUrl]);

    const handleConfigChange = (type: 'apiKey' | 'baseUrl', value: string) => {
        if (type === 'apiKey') setApiKeyInput(value);
        if (type === 'baseUrl') setBaseUrlInput(value);
        
        // Update draft immediately
        updateProviderDraft({ [type]: value });
    };

    const handleReset = () => {
        setLlmDraft({...llm});
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSettings({ llm: llmDraft });
        } catch (e) {
            console.error("Failed to save Model settings", e);
        } finally {
            setIsSaving(false);
        }
    };

    const updateProviderDraft = (updates: Partial<ProviderConfig>) => {
        setLlmDraft({
            ...llmDraft,
            providers: {
                ...llmDraft.providers,
                [selectedProvider]: { ...currentProviderConfig, ...updates }
            }
        });
    };

    // --- IPC 交互 ---
    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await window.electronAPI.system.testLLM({
                apiKey: currentProviderConfig.apiKey,
                baseUrl: currentProviderConfig.baseUrl,
                model: currentProviderConfig.models?.[0]?.model || 'test'
            });
            const translatedMessage = result.message.startsWith('modelSettings.') 
                ? t(result.message) 
                : result.message;
            setTestResult({ ...result, message: translatedMessage });
        } catch (e: any) {
            setTestResult({ success: false, message: e.message });
        } finally {
            setIsTesting(false);
        }
    };

    const handleFetchModels = async () => {
        if (!currentProviderConfig.apiKey && selectedProvider !== 'Local') {
            alert(t('modelSettings.apiKeyRequired', 'Please enter API Key first'));
            return;
        }
        setIsFetchingModels(true);
        setShowModelPicker(true);
        try {
            const models = await window.electronAPI.system.fetchProviderModels({
                providerId: selectedProvider,
                config: {
                    apiKey: currentProviderConfig.apiKey,
                    baseUrl: currentProviderConfig.baseUrl
                }
            });
            setAvailableModels(models);
        } catch (e: any) {
            alert(t('modelSettings.fetchFailed', 'Failed to fetch models: ') + e.message);
            setShowModelPicker(false);
        } finally {
            setIsFetchingModels(false);
        }
    };

    const handleExportPreset = () => {
        const withKey = window.confirm(t('modelSettings.exportWithKey', 'Do you want to include API Keys in the export?'));
        const preset = {
            version: '1.0',
            llm: {
                ...llmDraft,
                providers: Object.fromEntries(
                    Object.entries(llmDraft.providers).map(([id, config]) => [
                        id,
                        withKey ? config : { ...config, apiKey: '' }
                    ])
                )
            }
        };
        const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `geni-llm-preset-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    const handleImportPreset = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const text = await file.text();
            try {
                const imported = JSON.parse(text);
                if (imported.llm) {
                    setLlmDraft({
                        ...llmDraft,
                        providers: { ...llmDraft.providers, ...imported.llm.providers }
                    });
                    alert(t('modelSettings.importSuccess', 'Preset imported successfully!'));
                }
            } catch (err) {
                alert(t('modelSettings.importError', 'Invalid preset file.'));
            }
        };
        input.click();
    };

    // --- 提供商管理 ---
    const handleToggleProvider = (providerKey: string) => {
        const config = llmDraft.providers[providerKey] || DEFAULT_PROVIDER_CONFIGS[providerKey];
        const newEnabled = !config.enabled;

        const updatedProviders = {
            ...llmDraft.providers,
            [providerKey]: { ...config, enabled: newEnabled }
        };

        let newActiveProvider = llmDraft.activeProvider;
        if (!newEnabled && providerKey === llmDraft.activeProvider) {
            const firstEnabled = Object.entries(updatedProviders).find(([_, cfg]) => (cfg as any).enabled);
            newActiveProvider = firstEnabled ? (firstEnabled[0] as string) : providerKey;
        }

        setLlmDraft({ ...llmDraft, activeProvider: newActiveProvider, providers: updatedProviders });
    };

    const handleAddProvider = () => {
        if (!newProviderName.trim()) return;
        const key = newProviderName.trim();
        if (llmDraft.providers[key]) return;

        setLlmDraft({
            ...llmDraft,
            providers: {
                ...llmDraft.providers,
                [key]: { apiKey: '', baseUrl: '', enabled: true, models: [], activeModelId: '' }
            }
        });
        setSelectedProvider(key);
        setIsAdding(false);
        setNewProviderName('');
    };

    const handleDeleteProvider = (providerKey: string) => {
        if (!window.confirm(t('modelSettings.confirmDeleteProvider', `Are you sure you want to delete ${providerKey}?`))) return;
        
        const updatedProviders = { ...llmDraft.providers };
        delete updatedProviders[providerKey];

        let newActiveProvider = llmDraft.activeProvider;
        if (providerKey === llmDraft.activeProvider) {
            const firstAvailable = Object.keys(updatedProviders)[0] || 'OpenAI';
            newActiveProvider = firstAvailable;
            setSelectedProvider(firstAvailable);
        }

        setLlmDraft({ ...llmDraft, activeProvider: newActiveProvider, providers: updatedProviders });
    };

    // --- 模型管理 ---
    const openModelEditor = (index: number | null = null, initialModelId?: string) => {
        if (index !== null) {
            const model = currentProviderConfig.models[index];
            setEditingModelIndex(index);
            setModelForm({
                label: model.label,
                model: model.model,
                supportVision: model.supportVision || false,
                temperature: model.temperature || 0.7
            });
        } else {
            setEditingModelIndex(null);
            setModelForm({
                label: initialModelId || '',
                model: initialModelId || '',
                supportVision: false,
                temperature: 0.7
            });
        }
        setShowModelEditor(true);
    };

    const saveModel = () => {
        if (!modelForm.label || !modelForm.model) return;

        const updatedModels = [...(currentProviderConfig.models || [])];
        if (editingModelIndex !== null) {
            updatedModels[editingModelIndex] = {
                ...updatedModels[editingModelIndex],
                ...modelForm
            };
        } else {
            const newInstance: ModelInstance = {
                id: `${modelForm.model}-${Math.random().toString(36).substring(7)}`,
                ...modelForm,
                enabled: true
            };
            updatedModels.push(newInstance);
        }

        updateProviderDraft({ models: updatedModels });
        setShowModelEditor(false);
    };

    const removeModelInstance = (index: number) => {
        const updatedModels = [...(currentProviderConfig.models || [])];
        updatedModels.splice(index, 1);
        updateProviderDraft({ models: updatedModels });
    };

    // --- 渲染逻辑 ---
    const filteredProviders = Array.from(new Set([
        ...Object.keys(DEFAULT_PROVIDER_CONFIGS),
        ...Object.keys(llmDraft.providers)
    ])).filter(key => key.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="flex h-full gap-6 animate-in fade-in duration-500 relative">
            {/* Left Box: Provider List */}
            <div className="w-64 shrink-0 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                        <input
                            type="text"
                            placeholder={t('modelSettings.search')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-900 dark:text-slate-100"
                        />
                    </div>
                    <div className="flex items-center bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
                        <button onClick={handleImportPreset} className="p-2 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 transition-colors border-r border-slate-100 dark:border-white/5" title={t('modelSettings.import')}>
                            <Upload size={14} />
                        </button>
                        <button onClick={handleExportPreset} className="p-2 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 transition-colors border-r border-slate-100 dark:border-white/5" title={t('modelSettings.export')}>
                            <Download size={14} />
                        </button>
                        <button onClick={() => setIsAdding(!isAdding)} className="p-2 hover:bg-slate-50 dark:hover:bg-white/5 text-indigo-500 transition-colors" title={t('modelSettings.addProvider')}>
                            <Plus size={14} />
                        </button>
                    </div>
                </div>

                {isAdding && (
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl space-y-2">
                        <input type="text" autoFocus placeholder={t('modelSettings.namePlaceholder')} value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} className="w-full bg-white dark:bg-black/20 border border-indigo-200 dark:border-indigo-500/30 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100" onKeyDown={(e) => e.key === 'Enter' && handleAddProvider()} />
                        <div className="flex gap-2">
                            <button onClick={handleAddProvider} className="flex-1 bg-indigo-500 text-white text-xs py-1.5 rounded-lg">{t('modelSettings.add')}</button>
                            <button onClick={() => setIsAdding(false)} className="flex-1 bg-slate-200 dark:bg-white/10 text-xs py-1.5 rounded-lg">{t('modelSettings.cancel')}</button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                    {filteredProviders.map(key => {
                        const meta = PROVIDER_META[key] || { icon: Bot, label: key, desc: t('modelSettings.custom') };
                        const isSelected = selectedProvider === key;
                        const config = llmDraft.providers[key] || DEFAULT_PROVIDER_CONFIGS[key];
                        const isCustom = !DEFAULT_PROVIDER_CONFIGS[key];
                        
                        return (
                            <div key={key} className="relative group/item">
                                <button onClick={() => setSelectedProvider(key)} className={clsx("w-full text-left p-2.5 rounded-xl border transition-all relative", isSelected ? "bg-white dark:bg-[#18181b] border-indigo-500/30 shadow-sm" : "bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5")}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <div 
                                                className={clsx("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors", isSelected ? "shadow-inner" : "")}
                                                style={{ 
                                                    backgroundColor: isSelected ? `${meta.color}20` : 'rgba(100, 116, 139, 0.05)',
                                                    color: isSelected ? meta.color : '#94a3b8'
                                                }}
                                            >
                                                <meta.icon size={16} color={isSelected ? meta.color : 'currentColor'} />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className={clsx("text-sm font-semibold truncate", isSelected ? "text-slate-900 dark:text-white" : "text-slate-500")}>
                                                    {meta.label}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {config?.enabled && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                                            {isCustom && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteProvider(key); }}
                                                    className="opacity-0 group-hover/item:opacity-100 p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right Box: Detailed Configuration */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl flex-1 flex flex-col shadow-sm overflow-hidden">
                    {/* Detail Header */}
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{PROVIDER_META[selectedProvider]?.label || selectedProvider}</h2>
                            <div className={clsx("px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-tight", currentProviderConfig.enabled ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10" : "bg-slate-100 text-slate-500 dark:bg-white/5")}>
                                {currentProviderConfig.enabled ? t('on') : t('off')}
                            </div>
                        </div>
                        <Switch 
                            checked={!!currentProviderConfig.enabled}
                            onChange={() => handleToggleProvider(selectedProvider)}
                        />
                    </div>

                    <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar">
                        {/* API Config Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    < Globe size={12} /> {t('modelSettings.apiConfig', 'API Configuration')}
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 col-span-2">
                                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('modelSettings.apiKey')}</label>
                                    <input type="password" value={apiKeyInput} onChange={(e) => handleConfigChange('apiKey', e.target.value)} placeholder="sk-..." className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200" />
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('modelSettings.apiUrl')}</label>
                                    <input type="text" value={baseUrlInput} onChange={(e) => handleConfigChange('baseUrl', e.target.value)} placeholder="https://api..." className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200" />
                                </div>
                            </div>
                        </div>

                        {/* Model Management Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Cpu size={12} /> {t('modelSettings.models')}
                                </label>
                                <div className="flex gap-2">
                                    <button onClick={handleFetchModels} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all">
                                        <RefreshCw size={12} className={clsx(isFetchingModels && "animate-spin")} />
                                        {t('modelSettings.autoDiscover')}
                                    </button>
                                    <button onClick={() => openModelEditor()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/10 transition-all">
                                        <Plus size={12} />
                                        {t('modelSettings.addModel')}
                                    </button>
                                </div>
                            </div>

                            {/* Model Pick List */}
                            {showModelPicker && (
                                <div className="p-4 bg-slate-50 dark:bg-black/20 border border-dashed border-slate-300 dark:border-white/10 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-slate-500">{isFetchingModels ? t('loading') : t('availableModels')}</span>
                                        <button onClick={() => setShowModelPicker(false)} className="text-slate-400 hover:text-slate-600"><X size={14}/></button>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto grid grid-cols-2 gap-2 pr-1 custom-scrollbar">
                                        {availableModels.map(name => (
                                            <button key={name} onClick={() => { openModelEditor(null, name); setShowModelPicker(false); }} className="text-left px-3 py-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 text-xs hover:border-indigo-500/50 hover:text-indigo-500 transition-all truncate">
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Configured Models List */}
                            <div className="grid grid-cols-1 gap-3">
                                {currentProviderConfig.models?.map((model, idx) => (
                                    <div key={model.id} className="group p-4 rounded-2xl border transition-all duration-300 bg-white dark:bg-white/[0.02] border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-800 dark:text-white">{model.label}</span>
                                                    {model.supportVision && (
                                                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 text-[10px] font-bold">VISION</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                                                        {model.model}
                                                    </span>
                                                    <div className="h-1 w-1 rounded-full bg-slate-300 dark:bg-white/10" />
                                                    <div className="text-[10px] text-slate-400">
                                                        Temp: <span className="font-bold text-indigo-500">{model.temperature}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openModelEditor(idx)} className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-white/5 rounded-xl transition-all">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => removeModelInstance(idx)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {(!currentProviderConfig.models || currentProviderConfig.models.length === 0) && (
                                <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-3xl text-slate-400">
                                    <Bot size={48} className="mb-3 opacity-20" />
                                    <p className="text-xs">{t('modelSettings.noModels', 'No models configured yet.')}</p>
                                    <button onClick={handleFetchModels} className="mt-4 text-indigo-500 text-xs font-bold hover:underline">{t('modelSettings.startDiscover', 'Start Discovering')}</button>
                                </div>
                            )}
                        </div>

                        {/* Connection Test Footer */}
                        <div className="pt-8 border-t border-slate-100 dark:border-white/5">
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/[0.02] rounded-2xl">
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">{t('modelSettings.connectivity', 'Connectivity Status')}</h4>
                                    <p className="text-[10px] text-slate-400">{t('modelSettings.connectivityDesc', 'Verify your API keys and endpoint settings.')}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    {testResult && (
                                        <div className={clsx("text-xs font-medium px-3 py-1.5 rounded-lg", testResult.success ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400")}>
                                            {testResult.message}
                                        </div>
                                    )}
                                    <button onClick={handleTestConnection} disabled={isTesting} className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
                                        {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} fill="currentColor" />}
                                        {t('modelSettings.testConnection')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Model Editor Modal */}
            {showModelEditor && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModelEditor(false)} />
                    <div className="relative w-full max-w-md bg-white dark:bg-[#1c1c1f] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <h3 className="text-md font-bold text-slate-800 dark:text-white">{editingModelIndex !== null ? t('modelSettings.editModel') : t('modelSettings.addNewModel')}</h3>
                            <button onClick={() => setShowModelEditor(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('modelSettings.modelLabel')}</label>
                                <input 
                                    type="text" 
                                    placeholder="GPT-4"
                                    value={modelForm.label}
                                    onChange={e => setModelForm({...modelForm, label: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-slate-700 dark:text-gray-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('modelSettings.modelID')}</label>
                                <input 
                                    type="text" 
                                    placeholder="gpt-4"
                                    value={modelForm.model}
                                    onChange={e => setModelForm({...modelForm, model: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-slate-700 dark:text-gray-200"
                                />
                            </div>

                            <div className="flex items-center gap-2 py-2">
                                <input 
                                    type="checkbox" 
                                    id="vision-support"
                                    checked={modelForm.supportVision}
                                    onChange={e => setModelForm({...modelForm, supportVision: e.target.checked})}
                                    className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-indigo-500 focus:ring-indigo-500/50 transition-all"
                                />
                                <label htmlFor="vision-support" className="text-sm text-slate-600 dark:text-slate-300 font-medium cursor-pointer">{t('modelSettings.visionSupport')}</label>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('modelSettings.temperature')} ({modelForm.temperature})</label>
                                <input 
                                    type="range" 
                                    min="0" max="2" step="0.1"
                                    value={modelForm.temperature}
                                    onChange={e => setModelForm({...modelForm, temperature: parseFloat(e.target.value)})}
                                    className="w-full accent-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-5 bg-slate-50/50 dark:bg-white/[0.02] flex justify-end gap-3">
                            <button 
                                onClick={() => setShowModelEditor(false)}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                            >
                                {t('modelSettings.cancel')}
                            </button>
                            <button 
                                onClick={saveModel}
                                className="px-8 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 shadow-lg shadow-indigo-500/20 transition-all"
                            >
                                {t('save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SaveStatusBar 
                isDirty={isDirty} 
                isSaving={isSaving} 
                onSave={handleSave} 
                onReset={handleReset} 
            />
        </div>
    );
}
