import React, { useState } from 'react';
import { Database, Plus, Trash2, CheckCircle2, AlertCircle, TerminalSquare, Plug } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface McpServerForm {
    id: string;
    command: string;
    args: string;
}

export function McpSettings() {
    const [servers, setServers] = useState<McpServerForm[]>([
        { id: 'sqlite', command: 'uvx', args: 'mcp-server-sqlite' } // Example
    ]);
    const [status, setStatus] = useState<Record<string, 'disconnected' | 'connecting' | 'connected' | 'error'>>({});
    const [statusMsg, setStatusMsg] = useState<Record<string, string>>({});

    const handleConnect = async (server: McpServerForm) => {
        setStatus(prev => ({ ...prev, [server.id]: 'connecting' }));
        setStatusMsg(prev => ({ ...prev, [server.id]: '' }));

        try {
            // Split args string into array
            const argsArray = server.args.split(' ').filter(s => s.trim().length > 0);

            const res = await window.electronAPI.mcpConnect({
                id: server.id,
                command: server.command,
                args: argsArray
            });

            if (res.success) {
                setStatus(prev => ({ ...prev, [server.id]: 'connected' }));
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
        setServers([...servers, { id: '', command: '', args: '' }]);
    };

    const removeRow = (index: number) => {
        const newServers = [...servers];
        newServers.splice(index, 1);
        setServers(newServers);
    };

    const updateRow = (index: number, field: keyof McpServerForm, value: string) => {
        const newServers = [...servers];
        newServers[index] = { ...newServers[index], [field]: value };
        setServers(newServers);
    };

    return (
        <div className="max-w-4xl space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100">MCP 服务</h2>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500 text-white font-bold uppercase">Beta</span>
                </div>
                <p className="text-sm text-slate-500 dark:text-gray-400">连接外部工具和服务 (Model Context Protocol)</p>
            </div>

            <div className="space-y-4">
                {servers.map((server, idx) => (
                    <div key={idx} className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl p-5 shadow-sm">
                        <div className="grid grid-cols-12 gap-4 mb-4">
                            <div className="col-span-3 space-y-1.5">
                                <label className="text-[10px] uppercase text-slate-500 dark:text-gray-500 font-bold block">Server ID</label>
                                <input
                                    type="text"
                                    placeholder="e.g. sqlite"
                                    value={server.id}
                                    onChange={(e) => updateRow(idx, 'id', e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-gray-200 focus:border-indigo-500/50 outline-none font-mono"
                                />
                            </div>
                            <div className="col-span-3 space-y-1.5">
                                <label className="text-[10px] uppercase text-slate-500 dark:text-gray-500 font-bold block">Command</label>
                                <input
                                    type="text"
                                    placeholder="e.g. npx, uvx"
                                    value={server.command}
                                    onChange={(e) => updateRow(idx, 'command', e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-gray-200 focus:border-indigo-500/50 outline-none font-mono"
                                />
                            </div>
                            <div className="col-span-6 space-y-1.5">
                                <label className="text-[10px] uppercase text-slate-500 dark:text-gray-500 font-bold block">Arguments</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g. -y @modelcontextprotocol/server-sqlite"
                                        value={server.args}
                                        onChange={(e) => updateRow(idx, 'args', e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-gray-200 focus:border-indigo-500/50 outline-none font-mono"
                                    />
                                    <button
                                        onClick={() => removeRow(idx)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                {status[server.id] === 'connected' && (
                                    <span className="flex items-center gap-1.5 text-xs text-emerald-500 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded">
                                        <CheckCircle2 size={14} /> Connected
                                    </span>
                                )}
                                {status[server.id] === 'connecting' && (
                                    <span className="flex items-center gap-1.5 text-xs text-indigo-500 dark:text-indigo-400 font-medium animate-pulse bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded">
                                        <Plug size={14} /> Connecting...
                                    </span>
                                )}
                                {status[server.id] === 'error' && (
                                    <span className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 font-medium bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded" title={statusMsg[server.id]}>
                                        <AlertCircle size={14} /> Failed
                                    </span>
                                )}
                                {!status[server.id] && (
                                    <span className="text-xs text-slate-400 dark:text-gray-600 px-2 py-1">Not Connected</span>
                                )}

                                {statusMsg[server.id] && status[server.id] === 'error' && (
                                    <span className="text-[10px] text-red-400 max-w-[200px] truncate">{statusMsg[server.id]}</span>
                                )}
                            </div>

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
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={addRow}
                className="w-full py-4 border border-dashed border-slate-300 dark:border-white/10 rounded-xl text-xs text-slate-500 dark:text-gray-500 hover:text-indigo-500 hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2"
            >
                <Plus size={14} /> Add MCP Server
            </button>
        </div>
    );
}
