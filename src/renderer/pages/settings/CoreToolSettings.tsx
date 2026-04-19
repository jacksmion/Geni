import React, { useState, useEffect } from 'react';
import { TerminalSquare, Shield, AlertCircle, Box, Search, Database } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

interface CoreToolMetadata {
    name: string;
    description: string;
    enabled: boolean;
    trustLevel: 'Ask' | 'Auto';
}

export function CoreToolSettings() {
    const { t } = useTranslation();
    const [tools, setTools] = useState<CoreToolMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchTools = async () => {
        try {
            const list = await window.electronAPI.tools.coreToolList();
            setTools(list);
        } catch (e) {
            console.error("Failed to fetch core tools", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTools();
    }, []);

    const handleToggle = async (toolName: string) => {
        try {
            await window.electronAPI.tools.coreToolToggle(toolName);
            await fetchTools();
        } catch (e) {
            console.error("Failed to toggle core tool", e);
        }
    };

    const handleSetTrustLevel = async (toolName: string, level: 'Ask' | 'Auto') => {
        try {
            await window.electronAPI.tools.coreToolSetTrustLevel(toolName, level);
            await fetchTools();
        } catch (e) {
            console.error("Failed to set trust level for core tool", e);
        }
    };

    const filteredTools = tools.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-400">
                <div className="animate-spin mr-3">
                    <Box size={20} />
                </div>
                {t('coreToolSettings.loading')}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <p className="ui-text-body text-slate-500 dark:text-gray-400">{t('coreToolSettings.desc')}</p>
                </div>

                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                    <input
                        type="text"
                        placeholder={t('coreToolSettings.search')}
                        className="ui-text-body w-64 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-slate-700 transition-all focus:outline-none focus:border-indigo-500/50 focus:bg-white dark:border-white/10 dark:bg-black/20 dark:text-gray-200 dark:focus:bg-black/30"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                        <tr>
                            <th className="ui-text-meta px-3 py-2 font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider">{t('coreToolSettings.columns.tool')}</th>
                            <th className="ui-text-meta px-3 py-2 font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider">{t('coreToolSettings.columns.status')}</th>
                            <th className="ui-text-meta px-3 py-2 font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider">{t('coreToolSettings.columns.auth')}</th>
                            <th className="ui-text-meta px-3 py-2 font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider">{t('coreToolSettings.columns.desc')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-[#18181b]">
                        {filteredTools.map((tool) => (
                            <tr key={tool.name} className={clsx(
                                "hover:bg-slate-50 dark:hover:bg-white/5 transition-colors",
                                !tool.enabled && "opacity-60"
                            )}>
                                <td className="px-3 py-2">
                                    <span className="ui-text-meta font-semibold text-indigo-600 dark:text-indigo-400 font-mono">
                                        {tool.name}
                                    </span>
                                </td>
                                <td className="px-3 py-2">
                                    <button
                                        onClick={() => handleToggle(tool.name)}
                                        className={clsx(
                                            "w-8 h-4 rounded-full transition-colors relative cursor-pointer",
                                            tool.enabled ? "bg-indigo-500" : "bg-slate-200 dark:bg-white/10"
                                        )}
                                    >
                                        <div className={clsx(
                                            "absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform duration-200",
                                            tool.enabled ? "translate-x-4" : "translate-x-0"
                                        )} />
                                    </button>
                                </td>
                                <td className="px-3 py-2">
                                    <select
                                        value={tool.trustLevel}
                                        onChange={(e) => handleSetTrustLevel(tool.name, e.target.value as 'Ask' | 'Auto')}
                                        disabled={!tool.enabled}
                                        className={clsx(
                                            "ui-text-caption relative appearance-none rounded border px-1.5 py-0.5 pr-5 font-medium outline-none transition-all bg-no-repeat bg-[right_0.2rem_center] bg-[length:0.6rem]",
                                            tool.trustLevel === 'Auto'
                                                ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                                : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400",
                                            !tool.enabled && "opacity-50 grayscale cursor-not-allowed"
                                        )}
                                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
                                    >
                                        <option value="Ask">{t('coreToolSettings.ask')}</option>
                                        <option value="Auto">{t('coreToolSettings.auto')}</option>
                                    </select>
                                </td>
                                <td className="ui-text-meta px-3 py-2 text-slate-400 dark:text-gray-500 truncate max-w-[280px]">
                                    {tool.description || <span className="italic opacity-50">{t('coreToolSettings.noDesc')}</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredTools.length === 0 && (
                    <div className="ui-text-meta px-6 py-8 text-center text-slate-400 italic">
                        <div className="flex flex-col items-center gap-2">
                            <Database className="opacity-20" size={24} />
                            {t('coreToolSettings.noMatch')}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-200 dark:border-white/5 flex items-start gap-2.5">
                <Shield className="text-indigo-500 dark:text-indigo-400 mt-0.5 shrink-0" size={14} />
                <div>
                    <h4 className="ui-text-meta mb-0.5 font-bold text-slate-800 dark:text-white">{t('coreToolSettings.authNoteTitle')}</h4>
                    <p className="ui-text-meta text-slate-500 dark:text-gray-400 leading-relaxed">
                        {t('coreToolSettings.authNoteDesc')}
                    </p>
                </div>
            </div>
        </div>
    );
}
