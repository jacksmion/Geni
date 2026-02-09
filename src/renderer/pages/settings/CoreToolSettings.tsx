import React, { useState, useEffect } from 'react';
import { TerminalSquare, Shield, AlertCircle, Box, Search, Database } from 'lucide-react';
import { clsx } from 'clsx';

interface CoreToolMetadata {
    name: string;
    description: string;
    enabled: boolean;
    trustLevel: 'Ask' | 'Auto';
}

export function CoreToolSettings() {
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
                正在加载工具...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-2">
                        内置核心工具
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-gray-400">管理内置核心工具的启用状态和授权策略。</p>
                </div>

                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                    <input
                        type="text"
                        placeholder="搜索工具..."
                        className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-indigo-500/50 focus:bg-white dark:focus:bg-black/30 transition-all w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                        <tr>
                            <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider">工具</th>
                            <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider">状态</th>
                            <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider">授权方式</th>
                            <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider">描述</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-[#18181b]">
                        {filteredTools.map((tool) => (
                            <tr key={tool.name} className={clsx(
                                "hover:bg-slate-50 dark:hover:bg-white/5 transition-colors",
                                !tool.enabled && "opacity-60"
                            )}>
                                <td className="px-4 py-4 align-top">
                                    <code className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded border border-indigo-100 dark:border-indigo-500/20 font-mono">
                                        {tool.name}
                                    </code>
                                </td>
                                <td className="px-4 py-4 align-top">
                                    <button
                                        onClick={() => handleToggle(tool.name)}
                                        className={clsx(
                                            "w-10 h-5 rounded-full transition-colors relative cursor-pointer",
                                            tool.enabled ? "bg-indigo-500" : "bg-slate-200 dark:bg-white/10"
                                        )}
                                    >
                                        <div className={clsx(
                                            "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                                            tool.enabled ? "translate-x-5" : "translate-x-0"
                                        )} />
                                    </button>
                                </td>
                                <td className="px-4 py-4 align-top">
                                    <select
                                        value={tool.trustLevel}
                                        onChange={(e) => handleSetTrustLevel(tool.name, e.target.value as 'Ask' | 'Auto')}
                                        disabled={!tool.enabled}
                                        className={clsx(
                                            "text-xs font-medium rounded-lg px-2 py-1 outline-none border transition-all appearance-none pr-6 relative bg-no-repeat bg-[right_0.4rem_center] bg-[length:0.8rem]",
                                            tool.trustLevel === 'Auto'
                                                ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                                : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400",
                                            !tool.enabled && "opacity-50 grayscale cursor-not-allowed"
                                        )}
                                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
                                    >
                                        <option value="Ask">需确认 (Ask)</option>
                                        <option value="Auto">自动批准 (Auto)</option>
                                    </select>
                                </td>
                                <td className="px-4 py-4 text-xs text-slate-500 dark:text-gray-400 leading-relaxed max-w-xs">
                                    {tool.description || <span className="italic opacity-50">无描述</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredTools.length === 0 && (
                    <div className="px-6 py-12 text-center text-slate-400 italic text-sm">
                        <div className="flex flex-col items-center gap-2">
                            <Database className="opacity-20" size={32} />
                            未发现匹配的内置工具
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/5 flex items-start gap-3">
                <Shield className="text-indigo-500 dark:text-indigo-400 mt-0.5 shrink-0" size={18} />
                <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-1">授权说明</h4>
                    <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">
                        设置为“自动批准 (Auto)”将允许 AI 在不显示确认对话框的情况下直接执行该工具。
                        为了安全起见，建议仅在涉及文件读取或目录浏览等不修改系统状态的操作时使用此模式。
                    </p>
                </div>
            </div>
        </div>
    );
}
