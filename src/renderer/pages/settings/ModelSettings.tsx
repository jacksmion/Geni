import React, { useState, useEffect } from 'react';
import { AppSettings, DEFAULT_PROVIDER_CONFIGS, ProviderConfig, ModelInstance } from '../../../common/types/settings';
import { useSettingsStore } from '../../store/useSettingsStore';
import { clsx } from 'clsx';
import {
    Check, Key, Cpu, Zap, Search, Loader2, Plus, X, Globe,
    Download, Upload, RefreshCw, Star, Trash2, Edit2, ChevronDown, ShieldCheck
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SaveStatusBar } from '../../components/SaveStatusBar';
import { Switch } from '../../components/Switch';
import { useModalStore } from '../../store/useModalStore';
import {
    OpenAIIcon, AnthropicIcon, DeepSeekIcon, ZhipuIcon,
    MiniMaxIcon, QwenIcon, OllamaIcon, VolcengineIcon,
    OpenRouterIcon, CustomProviderIcon
} from '../../components/icons/providers';


const PROVIDER_META: Record<string, { icon: any, label: string, desc: string, color?: string }> = {
    'OpenAI': { icon: OpenAIIcon, label: 'OpenAI', desc: 'GPT-5.2, GPT-4o', color: '#10a37f' },
    'Anthropic': { icon: AnthropicIcon, label: 'Anthropic', desc: 'Claude 4.6 Opus/Sonnet', color: '#d97757' },
    'DeepSeek': { icon: DeepSeekIcon, label: 'DeepSeek', desc: 'DeepSeek-V3.2', color: '#4d6df1' },
    'ZhipuAI': { icon: ZhipuIcon, label: '智谱 AI', desc: 'GLM-4, GLM-3', color: '#343b4d' },
    'Volcengine': { icon: VolcengineIcon, label: '火山引擎', desc: 'Doubao 豆包模型', color: '#ff4d4f' },
    'Qwen': { icon: QwenIcon, label: '通义千问', desc: 'Qwen 3.5, Qwen 3', color: '#6340ff' },
    'MiniMax': { icon: MiniMaxIcon, label: 'MiniMax', desc: 'MiniMax M2.5', color: '#ff7a00' },
    'Ollama': { icon: OllamaIcon, label: 'Ollama', desc: 'Llama 3, Mistral (Local)', color: '#444' },
    'LM Studio': { icon: CustomProviderIcon, label: 'LM Studio', desc: 'Local OpenAI Server', color: '#6366f1' },
    'Local': { icon: CustomProviderIcon, label: 'Local (Custom)', desc: 'Custom OpenAI-compatible', color: '#64748b' },
};


export function ModelSettings() {
    const llm = useSettingsStore(s => s.settings.llm);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const { t } = useTranslation();
    const showConfirm = useModalStore(s => s.showConfirm);

    // --- Local Draft & Dirty Logic ---
    const [llmDraft, setLlmDraft] = useState({...llm});
    const [isSaving, setIsSaving] = useState(false);

    // --- Toast for inline notifications ---
    const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
    const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

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
            showToast(t('modelSettings.apiKeyRequired', 'Please enter API Key first'), 'error');
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
            showToast(t('modelSettings.fetchFailed', 'Failed to fetch models: ') + e.message, 'error');
            setShowModelPicker(false);
        } finally {
            setIsFetchingModels(false);
        }
    };

    const handleExportPreset = () => {
        showConfirm({
            message: t('modelSettings.exportWithKey', 'Do you want to include API Keys in the export?'),
            confirmText: t('modelSettings.includeKey'),
            cancelText: t('modelSettings.excludeKey'),
            onConfirm: () => doExport(true),
            onCancel: () => doExport(false),
        });
    };

    const doExport = (withKey: boolean) => {
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
                    showToast(t('modelSettings.importSuccess', 'Preset imported successfully!'), 'success');
                }
            } catch (err) {
                showToast(t('modelSettings.importError', 'Invalid preset file.'), 'error');
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
        const key = `custom-${Date.now().toString(36)}`;
        setLlmDraft({
            ...llmDraft,
            providers: {
                ...llmDraft.providers,
                [key]: { label: 'New Provider', apiKey: '', baseUrl: '', enabled: true, models: [], activeModelId: '' }
            }
        });
        setSelectedProvider(key);
    };

    const handleDeleteProvider = (providerKey: string) => {
        const config = llmDraft.providers[providerKey] || DEFAULT_PROVIDER_CONFIGS[providerKey];
        const meta = PROVIDER_META[providerKey];
        const displayName = config?.label || meta?.label || providerKey;
        showConfirm({
            message: t('modelSettings.confirmDeleteProvider', { key: displayName }),
            confirmText: t('modelSettings.delete', 'Delete'),
            onConfirm: () => {
                const updatedProviders = { ...llmDraft.providers };
                delete updatedProviders[providerKey];

                let newActiveProvider = llmDraft.activeProvider;
                if (providerKey === llmDraft.activeProvider) {
                    const firstAvailable = Object.keys(updatedProviders)[0] || 'OpenAI';
                    newActiveProvider = firstAvailable;
                    setSelectedProvider(firstAvailable);
                }

                setLlmDraft({ ...llmDraft, activeProvider: newActiveProvider, providers: updatedProviders });
            },
        });
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
                    <div className="flex items-center bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shrink-0">
                        <button onClick={handleImportPreset} className="p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 transition-colors border-r border-slate-100 dark:border-white/5" title={t('modelSettings.import')}>
                            <Upload size={15} />
                        </button>
                        <button onClick={handleExportPreset} className="p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 transition-colors border-r border-slate-100 dark:border-white/5" title={t('modelSettings.export')}>
                            <Download size={15} />
                        </button>
                        <button onClick={handleAddProvider} className="p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-indigo-500 transition-colors" title={t('modelSettings.addProvider')}>
                            <Plus size={15} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                    {filteredProviders.map(key => {
                        const meta = PROVIDER_META[key] || { icon: CustomProviderIcon, label: key, desc: t('modelSettings.custom') };
                        const isSelected = selectedProvider === key;
                        const config = llmDraft.providers[key] || DEFAULT_PROVIDER_CONFIGS[key];
                        const isCustom = !DEFAULT_PROVIDER_CONFIGS[key];
                        
                        return (
                            <div key={key} className="relative group/item">
                                <div className={clsx(
                                    "w-full text-left p-3 rounded-xl border transition-all relative flex items-center justify-between group",
                                    isSelected ? "bg-white dark:bg-[#18181b] border-indigo-500/30 shadow-sm" : "bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5"
                                )} onClick={() => setSelectedProvider(key)}>
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-9 h-9 flex items-center justify-center shrink-0">
                                            <meta.icon className="w-6 h-6" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className={clsx("text-sm font-bold truncate", isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300")}>
                                                {config.label || meta.label}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                        <Switch 
                                            size="sm"
                                            checked={!!config?.enabled}
                                            onChange={() => handleToggleProvider(key)}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right Box: Detailed Configuration */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl flex-1 flex flex-col shadow-sm overflow-hidden">
                    {/* Detail Header */}
                    <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#18181b] flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 flex items-center justify-center shrink-0">
                                {(() => {
                                    const Icon = PROVIDER_META[selectedProvider]?.icon || CustomProviderIcon;
                                    return <Icon className="w-7 h-7" />;
                                })()}
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h2 className="text-xl font-bold text-slate-800 dark:text-white leading-none">{currentProviderConfig.label || PROVIDER_META[selectedProvider]?.label || selectedProvider}</h2>
                                    {currentProviderConfig.enabled && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)] animate-pulse" />
                                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">已启用</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 dark:text-gray-500 mt-1.5 font-medium uppercase tracking-widest">{selectedProvider.startsWith('custom-') ? 'Custom Provider' : 'Standard Provider'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {!DEFAULT_PROVIDER_CONFIGS[selectedProvider] && (
                                <button 
                                    onClick={() => handleDeleteProvider(selectedProvider)} 
                                    className="text-slate-400 hover:text-red-500 p-2.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all active:scale-95"
                                    title={t('modelSettings.deleteProvider')}
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar">
                        {/* Provider Info (For Custom) */}
                        {selectedProvider.startsWith('custom-') && (
                            <div className="space-y-4">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Edit2 size={12} /> {t('modelSettings.providerName', 'Provider Name')}
                                </label>
                                <input 
                                    type="text" 
                                    value={currentProviderConfig.label || ''} 
                                    onChange={(e) => updateProviderDraft({ label: e.target.value })} 
                                    placeholder="e.g. My Private GPT..." 
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200" 
                                />
                            </div>
                        )}

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
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 truncate max-w-[140px] border border-slate-200/50 dark:border-white/5">
                                                        {model.model}
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="px-2 py-0.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-500/5 text-indigo-500 text-[10px] font-bold border border-indigo-100 dark:border-indigo-500/10">
                                                            TEMP: {model.temperature}
                                                        </div>
                                                        {model.supportVision && (
                                                            <div className="px-2 py-0.5 rounded-lg bg-amber-50/50 dark:bg-amber-500/5 text-amber-600 dark:text-amber-400 text-[10px] font-bold border border-amber-100 dark:border-amber-500/10">
                                                                VISION
                                                            </div>
                                                        )}
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
                                    <Cpu size={48} className="mb-3 opacity-20" />
                                    <p className="text-xs">{t('modelSettings.noModels', 'No models configured yet.')}</p>
                                    <button onClick={handleFetchModels} className="mt-4 text-indigo-500 text-xs font-bold hover:underline">{t('modelSettings.startDiscover', 'Start Discovering')}</button>
                                </div>
                            )}
                        </div>

                        {/* Connection Test Footer */}
                        <div className="pt-8 mt-4 border-t border-slate-100 dark:border-white/5">
                            <div className="flex items-center justify-between p-5 bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-3xl group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-white dark:bg-white/5 flex items-center justify-center shadow-sm border border-slate-100 dark:border-white/5 text-indigo-500">
                                        <ShieldCheck size={20} />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('modelSettings.connectivity', 'Connectivity Status')}</h4>
                                        <p className="text-xs text-slate-400 dark:text-gray-500">{t('modelSettings.connectivityDesc', 'Verify your API keys and endpoint settings.')}</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                    {testResult && (
                                        <div className={clsx(
                                            "text-xs font-bold px-4 py-2 rounded-xl animate-in fade-in slide-in-from-right-2 duration-300",
                                            testResult.success 
                                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20" 
                                                : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 border border-red-100 dark:border-red-500/20"
                                        )}>
                                            {testResult.message}
                                        </div>
                                    )}
                                    <button 
                                        onClick={handleTestConnection} 
                                        disabled={isTesting} 
                                        className="px-6 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2.5 whitespace-nowrap"
                                    >
                                        {isTesting ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} fill="currentColor" />}
                                        <span>{t('imSettings.testConnection')}</span>
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

            {/* Toast Notification */}
            {toast && (
                <div className={clsx(
                    "fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl shadow-2xl text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-300",
                    toast.type === 'error' && "bg-red-500 text-white",
                    toast.type === 'success' && "bg-emerald-500 text-white",
                    toast.type === 'info' && "bg-slate-800 text-white dark:bg-white dark:text-slate-800"
                )}>
                    {toast.message}
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
