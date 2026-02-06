import React, { useState, useEffect } from 'react';
import { Database, Plus, Trash2, CheckCircle2, AlertCircle, Play, Pause, Save, TerminalSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { IMcpServerConfig } from '../../../common/types/settings';
import { useChatStore } from '../../store/useChatStore';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

// Helper to split args string to array and vice versa
const argsToString = (args: string[]) => args.join(' ');
const stringToArgs = (str: string) => str.split(' ').filter(s => s.trim().length > 0);

interface ToolDefinition {
    name: string;
    description: string;
}

export function McpSettings() {
    const [servers, setServers] = useState<IMcpServerConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Status tracking for manual connection attempts
    const [status, setStatus] = useState<Record<string, 'disconnected' | 'connecting' | 'connected' | 'error'>>({});
    const [statusMsg, setStatusMsg] = useState<Record<string, string>>({});

    // Tools list
    const [tools, setTools] = useState<ToolDefinition[]>([]);

    // Function to fetch tools
    const fetchTools = async () => {
        try {
            const list = await window.electronAPI.mcpListTools();
            setTools(list);
        } catch (e) {
            console.error("Failed to fetch tools", e);
        }
    };

    // Load initial settings and check status (optimistic or actual?)
    // In a real app we'd ping statuses. For now, we assume status based on connection actions.
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings = await window.electronAPI.getAppSettings();
                if (settings.mcpServers) {
                    setServers(settings.mcpServers);

                    // Assume enabled servers might be connected if we just loaded?
                    // Ideally we ask backend for connection status.
                    // For now, let's just fetch tools, which implies connection if tools exist.
                    fetchTools();
                }
            } catch (e) {
                console.error("Failed to load settings", e);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    // Also verify status by checking if tools exist for a server
    useEffect(() => {
        // Simple heuristic: if we have tools matching the server prefix, mark it as connected
        const newStatus = { ...status };
        let changed = false;

        servers.forEach(server => {
            if (!server.id) return;
            const safePrefix = server.id.replace(/[^a-zA-Z0-9_]/g, '_');
            const prefix = `mcp__${safePrefix}__`;
            const hasTools = tools.some(t => t.name.startsWith(prefix));

            if (hasTools && newStatus[server.id] !== 'connected') {
                newStatus[server.id] = 'connected';
                changed = true;
            }
        });

        if (changed) setStatus(newStatus);
    }, [tools, servers]);


    const saveChanges = async (newServers: IMcpServerConfig[]) => {
        setSaving(true);
        try {
            const settings = await window.electronAPI.getAppSettings();
            await window.electronAPI.saveAppSettings({
                ...settings,
                mcpServers: newServers
            });
            // Main process handles reconnection automatically

            // After save (and potential reconnect), refresh tools
            setTimeout(fetchTools, 2000); // Wait a bit for connection
        } catch (e) {
            console.error("Failed to save settings", e);
        } finally {
            setSaving(false);
        }
    };

    const handleConnect = async (server: IMcpServerConfig) => {
        // Manual connect trigger if needed (though save usually triggers it)
        setStatus(prev => ({ ...prev, [server.id]: 'connecting' }));
        setStatusMsg(prev => ({ ...prev, [server.id]: '' }));

        try {
            const res = await window.electronAPI.mcpConnect({
                id: server.id,
                command: server.command,
                args: server.args
            });

            if (res.success) {
                setStatus(prev => ({ ...prev, [server.id]: 'connected' }));
                fetchTools();
            } else {
                setStatus(prev => ({ ...prev, [server.id]: 'error' }));
                setStatusMsg(prev => ({ ...prev, [server.id]: res.error || 'Unknown error' }));
            }
        } catch (err: any) {
            setStatus(prev => ({ ...prev, [server.id]: 'error' }));
            setStatusMsg(prev => ({ ...prev, [server.id]: err.message }));
        }
    };

    const addRow = () => {
        const newServer: IMcpServerConfig = {
            id: `server-${Date.now()}`,
            command: '',
            args: [],
            enabled: true
        };
        const newServers = [...servers, newServer];
        setServers(newServers);
        saveChanges(newServers);
    };

    const removeRow = (index: number) => {
        const newServers = [...servers];
        newServers.splice(index, 1);
        setServers(newServers);
        saveChanges(newServers);
    };

    const updateRow = (index: number, field: keyof IMcpServerConfig, value: any) => {
        const newServers = [...servers];
        if (field === 'args') {
            newServers[index] = { ...newServers[index], args: stringToArgs(value) };
        } else {
            newServers[index] = { ...newServers[index], [field]: value };
        }
        setServers(newServers);
    };

    // Auto-save on specific actions (handled in remove/add), for text fields we need to handle blur
    const handleBlur = () => {
        saveChanges(servers);
    };

    const toggleEnable = (index: number) => {
        const newServers = [...servers];
        newServers[index].enabled = !newServers[index].enabled;
        setServers(newServers);
        saveChanges(newServers);
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Loading configurations...</div>;

    return (
        <div className="max-w-4xl space-y-8 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="flex justify-between items-end border-b border-slate-200 dark:border-white/10 pb-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100">MCP 服务管理</h2>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500 text-white font-bold uppercase">Beta</span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-gray-400">配置和管理 Model Context Protocol 服务器。启用后 Agent 可自动使用其提供的工具。</p>
                </div>
                {saving && <span className="text-xs text-indigo-500 animate-pulse flex items-center gap-1"><Save size={12} /> Saving...</span>}
            </div>

            <div className="space-y-4">
                {servers.length === 0 && (
                    <div className="p-8 text-center border border-dashed border-slate-200 dark:border-white/10 rounded-xl bg-slate-50/50 dark:bg-white/5">
                        <p className="text-sm text-slate-400">暂无配置 MCP 服务器</p>
                    </div>
                )}

                {servers.map((server, idx) => (
                    <div key={idx} className={clsx(
                        "bg-white dark:bg-[#18181b] border rounded-xl p-5 shadow-sm transition-all duration-300",
                        server.enabled ? "border-indigo-200 dark:border-indigo-500/30" : "border-slate-200 dark:border-white/5 opacity-70 grayscale-[0.5]"
                    )}>
                        <div className="grid grid-cols-12 gap-4 mb-4">
                            <div className="col-span-3 space-y-1.5">
                                <label className="text-[10px] uppercase text-slate-500 dark:text-gray-500 font-bold block">ID</label>
                                <input
                                    type="text"
                                    placeholder="e.g. sqlite"
                                    value={server.id}
                                    onChange={(e) => updateRow(idx, 'id', e.target.value)}
                                    onBlur={handleBlur}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-gray-200 focus:border-indigo-500/50 outline-none font-mono"
                                />
                            </div>
                            <div className="col-span-3 space-y-1.5">
                                <label className="text-[10px] uppercase text-slate-500 dark:text-gray-500 font-bold block">Command</label>
                                <input
                                    type="text"
                                    placeholder="e.g. uvx"
                                    value={server.command}
                                    onChange={(e) => updateRow(idx, 'command', e.target.value)}
                                    onBlur={handleBlur}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-gray-200 focus:border-indigo-500/50 outline-none font-mono"
                                />
                            </div>
                            <div className="col-span-6 space-y-1.5">
                                <label className="text-[10px] uppercase text-slate-500 dark:text-gray-500 font-bold block">Arguments</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g. mcp-server-sqlite"
                                        value={argsToString(server.args)}
                                        onChange={(e) => updateRow(idx, 'args', e.target.value)}
                                        onBlur={handleBlur}
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-gray-200 focus:border-indigo-500/50 outline-none font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/5">
                            <div className="flex items-center gap-2">
                                <span className={clsx(
                                    "w-2 h-2 rounded-full",
                                    status[server.id] === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                        status[server.id] === 'connecting' ? "bg-indigo-500 animate-pulse" :
                                            status[server.id] === 'error' ? "bg-red-500" :
                                                "bg-slate-300 dark:bg-slate-600"
                                )}></span>
                                <span className="text-xs font-medium text-slate-600 dark:text-gray-400">
                                    {status[server.id] === 'connected' ? 'Connected' :
                                        status[server.id] === 'connecting' ? 'Connecting...' :
                                            status[server.id] === 'error' ? 'Error' :
                                                'Disconnected'}
                                </span>
                                {statusMsg[server.id] && (
                                    <span className={clsx(
                                        "text-[10px] max-w-[200px] truncate",
                                        status[server.id] === 'error' ? "text-red-400" : "text-slate-400"
                                    )} title={statusMsg[server.id]}>{statusMsg[server.id]}</span>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => handleConnect(server)}
                                    disabled={!server.id || !server.command || status[server.id] === 'connecting' || status[server.id] === 'connected'}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2",
                                        status[server.id] === 'connected'
                                            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 cursor-default"
                                            : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-500/30"
                                    )}
                                >
                                    {status[server.id] === 'connected' ? 'Active' : 'Connect'}
                                    {status[server.id] !== 'connected' && <TerminalSquare size={14} />}
                                </button>

                                <button
                                    onClick={() => toggleEnable(idx)}
                                    className={clsx(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                                        server.enabled
                                            ? "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                                            : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                                    )}
                                >
                                    {server.enabled ? <><Pause size={14} /> 禁用</> : <><Play size={14} /> 启用</>}
                                </button>

                                <button
                                    onClick={() => removeRow(idx)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                                    title="Delete Server"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Tool List */}
                        {status[server.id] === 'connected' && (
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 animate-in slide-in-from-top-2 duration-300">
                                <h4 className="text-xs font-semibold text-slate-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                                    <Database size={12} /> Available Tools
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {tools
                                        .filter(t => t.name.startsWith(`mcp__${server.id.replace(/[^a-zA-Z0-9_]/g, '_')}__`))
                                        .map((tool, tIdx) => (
                                            <div key={tIdx} className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg p-2.5 flex items-start gap-2.5 group hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors">
                                                <div className="bg-white dark:bg-black/20 p-1.5 rounded text-indigo-500">
                                                    <TerminalSquare size={12} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-xs font-medium text-slate-700 dark:text-gray-200 truncate font-mono" title={tool.name}>
                                                        {tool.name.split('__').slice(2).join('__')}
                                                    </div>
                                                    {tool.description && (
                                                        <div className="text-[10px] text-slate-400 dark:text-gray-500 truncate mt-0.5" title={tool.description}>
                                                            {tool.description}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    }
                                    {tools.filter(t => t.name.startsWith(`mcp__${server.id.replace(/[^a-zA-Z0-9_]/g, '_')}__`)).length === 0 && (
                                        <div className="col-span-2 text-center py-2 text-xs text-slate-400 italic">No tools exposed by this server yet.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <button
                onClick={addRow}
                className="w-full py-4 border border-dashed border-slate-300 dark:border-white/10 rounded-xl text-xs text-slate-500 dark:text-gray-500 hover:text-indigo-500 hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2"
            >
                <Plus size={14} /> 添加 MCP 服务器
            </button>
        </div>
    );
}
