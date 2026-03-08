import React, { useState, useEffect } from 'react';
import { Database, Plus, Trash2, CheckCircle2, AlertCircle, TerminalSquare, Server, Settings2, Link as LinkIcon, Box, Key, Globe, Command, Search, X } from 'lucide-react';
import { clsx } from 'clsx';
import { IMcpServerConfig } from '../../../common/types/settings';
import { SaveStatusBar } from '../../components/SaveStatusBar';

// Helper to split args string to array and vice versa
const argsToString = (args: string[]) => args?.join('\n') || '';
const stringToArgs = (str: string) => str.split(/\s+/).filter(s => s.trim().length > 0);

interface ToolDefinition {
    name: string;
    description: string;
}

export function McpSettings() {
    const [servers, setServers] = useState<IMcpServerConfig[]>([]);
    const [serversDraft, setServersDraft] = useState<IMcpServerConfig[]>([]);
    
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'tools'>('general');
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [newServerId, setNewServerId] = useState('');

    // Status tracking for manual connection attempts
    const [status, setStatus] = useState<Record<string, 'disconnected' | 'connecting' | 'connected' | 'error'>>({});
    const [statusMsg, setStatusMsg] = useState<Record<string, string>>({});

    // Tools list
    const [tools, setTools] = useState<ToolDefinition[]>([]);

    // Raw text for arguments to preserve formatting (newlines) while typing
    const [rawArgsText, setRawArgsText] = useState<string>('');

    // Sync rawArgsText when selected server or its content changes significantly
    useEffect(() => {
        if (selectedIdx !== null && serversDraft[selectedIdx]) {
            const currentArgs = serversDraft[selectedIdx].args || [];
            const canonicalFromRaw = stringToArgs(rawArgsText);
            
            // Only sync if the canonical content differs, to preserve trailing whitespace/newlines during typing
            if (JSON.stringify(currentArgs) !== JSON.stringify(canonicalFromRaw)) {
                setRawArgsText(argsToString(currentArgs));
            }
        } else {
            setRawArgsText('');
        }
    }, [selectedIdx, serversDraft]);

    const isDirty = JSON.stringify(serversDraft) !== JSON.stringify(servers);

    // Function to fetch actual connection statuses from backend
    const fetchStatuses = async () => {
        try {
            const backendStatuses = await window.electronAPI.tools.mcpGetStatuses();
            const newStatus: Record<string, 'disconnected' | 'connecting' | 'connected' | 'error'> = {};
            const newMsg: Record<string, string> = {};

            // Initialize with disconnected for all known servers
            serversDraft.forEach((s: IMcpServerConfig) => {
                newStatus[s.id] = 'disconnected';
            });

            // Override with actual backend states
            Object.entries(backendStatuses).forEach(([id, info]) => {
                newStatus[id] = info.state;
                if (info.error) {
                    newMsg[id] = info.error;
                }
            });

            setStatus(newStatus);
            if (Object.keys(newMsg).length > 0) {
                setStatusMsg(prev => ({ ...prev, ...newMsg }));
            }
        } catch (e) {
            console.error("Failed to fetch statuses", e);
        }
    };

    // Function to fetch tools
    const fetchTools = async () => {
        try {
            const list = await window.electronAPI.tools.mcpListTools();
            setTools(list);
            await fetchStatuses(); // Also sync statuses
        } catch (e) {
            console.error("Failed to fetch tools", e);
        }
    };

    const loadSettings = async () => {
        try {
            const settings = await window.electronAPI.system.getSettings();
            if (settings.mcpServers) {
                const srvs = settings.mcpServers;
                setServers(srvs);
                setServersDraft(JSON.parse(JSON.stringify(srvs)));
                
                if (srvs.length > 0 && selectedIdx === null) {
                    setSelectedIdx(0);
                }

                // Initial data sync
                const list = await window.electronAPI.tools.mcpListTools();
                setTools(list);
                fetchStatuses();
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        } finally {
            setLoading(false);
        }
    };

    // Load initial settings
    useEffect(() => {
        loadSettings();
    }, []);

    // Sync statuses when tools change
    useEffect(() => {
        fetchStatuses();
    }, [tools]);


    const handleSave = async () => {
        setIsSaving(true);
        try {
            const settings = await window.electronAPI.system.getSettings();
            await window.electronAPI.system.saveSettings({
                ...settings,
                mcpServers: serversDraft
            });
            
            // Sync permanent state
            setServers(JSON.parse(JSON.stringify(serversDraft)));
            
            // Trigger backend refresh
            setTimeout(fetchTools, 1500);
        } catch (e) {
            console.error("Failed to save settings", e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setServersDraft(JSON.parse(JSON.stringify(servers)));
    };

    const handleConnectTest = async (server: IMcpServerConfig) => {
        setStatus(prev => ({ ...prev, [server.id]: 'connecting' }));
        setStatusMsg(prev => ({ ...prev, [server.id]: '' }));

        try {
            const res = await window.electronAPI.tools.mcpConnect({
                id: server.id,
                command: server.command || '',
                args: server.args || [],
                type: server.type,
                url: server.url,
                apiKey: server.apiKey
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

    const handleAddServer = () => {
        if (!newServerId.trim()) return;
        const id = newServerId.trim();

        if (serversDraft.find(s => s.id === id)) {
            alert('服务器名称已存在！');
            return;
        }

        const newServer: IMcpServerConfig = {
            id: id,
            type: 'stdio',
            command: '',
            args: [],
            enabled: true
        };
        const newDraft = [...serversDraft, newServer];
        setServersDraft(newDraft);
        setSelectedIdx(newDraft.length - 1);
        setIsAdding(false);
        setNewServerId('');
    };

    const removeServerDraft = (index: number) => {
        const newDraft = [...serversDraft];
        newDraft.splice(index, 1);
        setServersDraft(newDraft);
        if (selectedIdx === index) setSelectedIdx(null);
        else if (selectedIdx !== null && selectedIdx > index) setSelectedIdx(selectedIdx - 1);
    };

    const updateServerDraftRow = (index: number, field: keyof IMcpServerConfig, value: any) => {
        const newDraft = [...serversDraft];
        if (field === 'args') {
            newDraft[index] = { ...newDraft[index], args: stringToArgs(value) };
        } else {
            newDraft[index] = { ...newDraft[index], [field]: value };
        }
        setServersDraft(newDraft);
    };

    const toggleEnableDraft = (index: number) => {
        const newDraft = [...serversDraft];
        newDraft[index] = { ...newDraft[index], enabled: !newDraft[index].enabled };
        setServersDraft(newDraft);
    };

    const handleToggleToolDraft = (serverId: string, originalToolName: string) => {
        const newDraft = [...serversDraft];
        const srvIdx = newDraft.findIndex(s => s.id === serverId);
        if (srvIdx === -1) return;

        const server = newDraft[srvIdx];
        const toolSettings = { ...(server.toolSettings || {}) };
        const currentSetting = toolSettings[originalToolName] || { enabled: true, trustLevel: 'Auto' };
        
        toolSettings[originalToolName] = { ...currentSetting, enabled: !currentSetting.enabled };
        newDraft[srvIdx] = { ...server, toolSettings };
        setServersDraft(newDraft);
    };

    const handleSetToolTrustLevelDraft = (serverId: string, originalToolName: string, level: 'Ask' | 'Auto') => {
        const newDraft = [...serversDraft];
        const srvIdx = newDraft.findIndex(s => s.id === serverId);
        if (srvIdx === -1) return;

        const server = newDraft[srvIdx];
        const toolSettings = { ...(server.toolSettings || {}) };
        const currentSetting = toolSettings[originalToolName] || { enabled: true, trustLevel: 'Auto' };
        
        toolSettings[originalToolName] = { ...currentSetting, trustLevel: level };
        newDraft[srvIdx] = { ...server, toolSettings };
        setServersDraft(newDraft);
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Loading configurations...</div>;

    const selectedServer = selectedIdx !== null ? serversDraft[selectedIdx] : null;

    // Filter servers based on search term
    const filteredServers = serversDraft.filter(server =>
        server.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter tools for the selected server
    const serverTools = selectedServer ? tools.filter(t => t.name.startsWith(`mcp__${selectedServer.id.replace(/[^a-zA-Z0-9_]/g, '_')}__`)) : [];

    return (
        <div className="flex h-full gap-6 animate-in fade-in duration-500 relative">
            {/* Left: Server List */}
            <div className="w-64 shrink-0 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                        <input
                            type="text"
                            placeholder="搜索服务器..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        />
                    </div>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="p-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 transition-colors"
                        title="添加服务器"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                {isAdding && (
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl space-y-2 animate-in slide-in-from-top-2">
                        <input
                            type="text"
                            autoFocus
                            placeholder="服务器名称 (ID)"
                            value={newServerId}
                            onChange={(e) => setNewServerId(e.target.value)}
                            className="w-full bg-white dark:bg-black/20 border border-indigo-200 dark:border-indigo-500/30 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-slate-900 dark:text-slate-100"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddServer()}
                        />
                        <div className="flex gap-2">
                            <button onClick={handleAddServer} className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs py-1.5 rounded-lg transition-colors">添加</button>
                            <button onClick={() => setIsAdding(false)} className="flex-1 bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-gray-400 text-xs py-1.5 rounded-lg hover:bg-slate-300 transition-colors">取消</button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {filteredServers.map((server) => {
                        const actualIdx = serversDraft.findIndex(s => s.id === server.id);
                        const isSelected = selectedIdx === actualIdx;
                        const isConnected = status[server.id] === 'connected';

                        return (
                            <button
                                key={server.id}
                                onClick={() => setSelectedIdx(actualIdx)}
                                className={clsx(
                                    "w-full text-left p-3 rounded-xl border transition-all duration-200 group relative",
                                    isSelected
                                        ? "bg-white dark:bg-[#18181b] border-indigo-500/50 shadow-sm z-10"
                                        : "bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className={clsx(
                                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                            isSelected ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-gray-400"
                                        )}>
                                            <Server size={18} />
                                        </div>
                                        <span className={clsx("font-medium text-sm", isSelected ? "text-slate-800 dark:text-white" : "text-slate-600 dark:text-gray-400")}>{server.id || 'Unnamed'}</span>
                                    </div>
                                    {server.enabled && (
                                        <div className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">ON</div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 pl-[42px]">
                                    <div className={clsx(
                                        "w-1.5 h-1.5 rounded-full shrink-0",
                                        status[server.id] === 'connected' ? "bg-emerald-500" :
                                            status[server.id] === 'connecting' ? "bg-indigo-500 animate-pulse" :
                                                status[server.id] === 'error' ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600"
                                    )} />
                                    <p className="text-xs text-slate-400 dark:text-gray-500 truncate capitalize">
                                        {status[server.id] || 'Disconnected'}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Right: Detailed Config */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl flex-1 flex flex-col shadow-sm">
                    {selectedServer ? (
                        <>
                            <div className="border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#18181b] z-10 shrink-0">
                                <div className="px-6 py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{selectedServer.id}</h2>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                                            <button onClick={() => setActiveTab('general')} className={clsx("px-3 py-1.5 rounded-md text-xs font-medium transition-all", activeTab === 'general' ? "bg-white dark:bg-[#18181b] text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200")}>通用设置</button>
                                            <button onClick={() => setActiveTab('tools')} className={clsx("px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2", activeTab === 'tools' ? "bg-white dark:bg-[#18181b] text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200")}>可用工具 {serverTools.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-white/10">{serverTools.length}</span>}</button>
                                        </div>
                                        <div className="w-px h-4 bg-slate-200 dark:bg-white/10" />
                                        <button onClick={() => removeServerDraft(selectedIdx!)} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-hidden relative">
                                {activeTab === 'general' ? (
                                    <div className="absolute inset-0 overflow-y-auto p-6 space-y-6">
                                        {status[selectedServer.id] === 'error' && (
                                            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                                                <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={16} />
                                                <div>
                                                    <h4 className="text-sm font-bold text-red-700 dark:text-red-400">连接测试失败</h4>
                                                    <p className="text-xs text-red-600 dark:text-red-300 mt- font-mono break-all">{statusMsg[selectedServer.id]}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Enable Toggle */}
                                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className={clsx("p-2 rounded-lg", selectedServer.enabled ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-slate-200 dark:bg-white/10 text-slate-500")}>
                                                    <Server size={18} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-slate-800 dark:text-white">启用此服务器</div>
                                                    <div className="text-xs text-slate-500 dark:text-gray-400">应用更改后将尝试连接</div>
                                                </div>
                                            </div>
                                            <button onClick={() => toggleEnableDraft(selectedIdx!)} className={clsx("w-12 h-6 rounded-full transition-colors relative", selectedServer.enabled ? "bg-emerald-500" : "bg-slate-200 dark:bg-white/10")}>
                                                <div className={clsx("absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform", selectedServer.enabled ? "translate-x-6" : "translate-x-0")} />
                                            </button>
                                        </div>

                                        {/* Server ID */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2"><Server size={14} /> 服务器 ID</label>
                                            <input type="text" value={selectedServer.id} onChange={(e) => updateServerDraftRow(selectedIdx!, 'id', e.target.value)} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200" />
                                        </div>

                                        {/* Transport Type */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2"><Settings2 size={14} /> 传输类型</label>
                                            <select value={selectedServer.type || 'stdio'} onChange={(e) => updateServerDraftRow(selectedIdx!, 'type', e.target.value as any)} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200 appearance-none">
                                                <option value="stdio">Stdio (本地执行)</option>
                                                <option value="sse">SSE (远程 HTTP)</option>
                                            </select>
                                        </div>

                                        {selectedServer.type === 'sse' ? (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2"><Globe size={14} /> URL 地址</label>
                                                    <input type="text" value={selectedServer.url || ''} onChange={(e) => updateServerDraftRow(selectedIdx!, 'url', e.target.value)} placeholder="http://..." className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-slate-700 dark:text-gray-200" />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2"><Key size={14} /> API Key (可选)</label>
                                                    <input type="password" value={selectedServer.apiKey || ''} onChange={(e) => updateServerDraftRow(selectedIdx!, 'apiKey', e.target.value)} className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-slate-700 dark:text-gray-200" />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2"><TerminalSquare size={14} /> 执行命令</label>
                                                    <input type="text" value={selectedServer.command || ''} onChange={(e) => updateServerDraftRow(selectedIdx!, 'command', e.target.value)} placeholder="node, python, uv..." className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-slate-700 dark:text-gray-200" />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2"><Command size={14} /> 执行参数</label>
                                                    <textarea 
                                                        value={rawArgsText} 
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setRawArgsText(val);
                                                            updateServerDraftRow(selectedIdx!, 'args', val);
                                                        }} 
                                                        placeholder="--option&#10;arg..." 
                                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-slate-700 dark:text-gray-200 min-h-[100px] resize-y focus:outline-none focus:border-indigo-500/50 transition-all" 
                                                    />
                                                </div>
                                            </>
                                        )}

                                        <div className="pt-2">
                                            <button 
                                                onClick={() => handleConnectTest(selectedServer)} 
                                                className="w-full py-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-sm font-semibold transition-all flex items-center justify-center gap-2 border border-indigo-100 dark:border-indigo-500/20 group"
                                            >
                                                <TerminalSquare size={16} className="group-hover:scale-110 transition-transform" />
                                                测试连接
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 overflow-y-auto p-6">
                                        <div className="space-y-4">
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">工具列表</h3>
                                            <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                                                <table className="w-full text-left text-xs">
                                                    <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                                                        <tr>
                                                            <th className="px-4 py-3 font-bold uppercase">工具名称</th>
                                                            <th className="px-4 py-3 font-bold uppercase">启用</th>
                                                            <th className="px-4 py-3 font-bold uppercase">信任级别</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                        {serverTools.map((tool, tIdx) => {
                                                            const originalName = tool.name.split('__').slice(2).join('__');
                                                            const srvToolSettings = selectedServer.toolSettings || {};
                                                            const tSetting = srvToolSettings[originalName] || { enabled: true, trustLevel: 'Auto' };

                                                            return (
                                                                <tr key={tIdx} className={clsx("hover:bg-slate-50 dark:hover:bg-white/5", !tSetting.enabled && "opacity-60")}>
                                                                    <td className="px-4 py-3 font-mono text-indigo-500">{originalName}</td>
                                                                    <td className="px-4 py-3">
                                                                        <button onClick={() => handleToggleToolDraft(selectedServer.id, originalName)} className={clsx("w-8 h-4 rounded-full relative transition-colors", tSetting.enabled ? "bg-indigo-500" : "bg-slate-300 dark:bg-white/10")}>
                                                                            <div className={clsx("absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform", tSetting.enabled ? "translate-x-4" : "")} />
                                                                        </button>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <select value={tSetting.trustLevel} onChange={(e) => handleSetToolTrustLevelDraft(selectedServer.id, originalName, e.target.value as any)} className="bg-transparent border-none outline-none font-bold text-emerald-500">
                                                                            <option value="Ask">Ask</option>
                                                                            <option value="Auto">Auto</option>
                                                                        </select>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
                            <Box size={48} className="opacity-10" />
                            <p className="text-sm">未选择服务器</p>
                        </div>
                    )}
                </div>
            </div>

            <SaveStatusBar isDirty={isDirty} isSaving={isSaving} onSave={handleSave} onReset={handleReset} />
        </div>
    );
}
