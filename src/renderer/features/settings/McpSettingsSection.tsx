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

export function McpSettingsSection() {
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
        <section className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="px-8 py-5 border-b border-white/5 bg-white/5 flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Database size={18} className="text-emerald-400" />
                </div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">MCP Servers (Beta)</h3>
                <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500 text-white font-bold uppercase">
                    Connect External Tools
                </span>
            </div>

            <div className="p-8 space-y-6">
                <div className="space-y-4">
                    {servers.map((server, idx) => (
                        <div key={idx} className="bg-black/20 rounded-xl p-4 border border-white/5">
                            <div className="grid grid-cols-12 gap-4 mb-3">
                                <div className="col-span-3">
                                    <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Server ID</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. sqlite"
                                        value={server.id}
                                        onChange={(e) => updateRow(idx, 'id', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500/50 outline-none font-mono"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Command</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. npx, uvx"
                                        value={server.command}
                                        onChange={(e) => updateRow(idx, 'command', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500/50 outline-none font-mono"
                                    />
                                </div>
                                <div className="col-span-6">
                                    <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block">Arguments</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g. -y @modelcontextprotocol/server-sqlite"
                                            value={server.args}
                                            onChange={(e) => updateRow(idx, 'args', e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500/50 outline-none font-mono"
                                        />
                                        <button
                                            onClick={() => removeRow(idx)}
                                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <div className="flex items-center gap-2">
                                    {status[server.id] === 'connected' && (
                                        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                                            <CheckCircle2 size={14} /> Connected
                                        </span>
                                    )}
                                    {status[server.id] === 'connecting' && (
                                        <span className="flex items-center gap-1.5 text-xs text-indigo-400 animate-pulse">
                                            <Plug size={14} /> Connecting...
                                        </span>
                                    )}
                                    {status[server.id] === 'error' && (
                                        <span className="flex items-center gap-1.5 text-xs text-red-400" title={statusMsg[server.id]}>
                                            <AlertCircle size={14} /> Failed: {statusMsg[server.id].substring(0, 30)}...
                                        </span>
                                    )}
                                    {!status[server.id] && (
                                        <span className="text-xs text-gray-600">Not Connected</span>
                                    )}
                                </div>

                                <button
                                    onClick={() => handleConnect(server)}
                                    disabled={!server.id || !server.command || status[server.id] === 'connecting' || status[server.id] === 'connected'}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2",
                                        status[server.id] === 'connected'
                                            ? "bg-emerald-500/10 text-emerald-400 cursor-default"
                                            : "bg-indigo-600 hover:bg-indigo-500 text-white"
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
                    className="w-full py-3 border border-dashed border-white/10 rounded-xl text-xs text-gray-500 hover:text-indigo-400 hover:border-indigo-500/30 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={14} /> Add MCP Server
                </button>
            </div>
        </section>
    );
}
