import React, { useState, useEffect } from 'react';
import { Database, Plus, Trash2, CheckCircle2, AlertCircle, TerminalSquare, Server, Settings2, Link as LinkIcon, Box, Key, Globe, Command, Search, X } from 'lucide-react';
import { clsx } from 'clsx';
import { IMcpServerConfig } from '../../../common/types/settings';

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

    // Function to fetch tools
    const fetchTools = async () => {
        try {
            const list = await window.electronAPI.tools.mcpListTools();
            setTools(list);
        } catch (e) {
            console.error("Failed to fetch tools", e);
        }
    };

    const loadSettings = async () => {
        try {
            const settings = await window.electronAPI.system.getSettings();
            if (settings.mcpServers) {
                setServers(settings.mcpServers);
                if (settings.mcpServers.length > 0 && selectedIdx === null) {
                    setSelectedIdx(0);
                }
                fetchTools();
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

    // Verify status logic
    useEffect(() => {
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
            const settings = await window.electronAPI.system.getSettings();
            await window.electronAPI.system.saveSettings({
                ...settings,
                mcpServers: newServers
            });
            setTimeout(fetchTools, 2000);
        } catch (e) {
            console.error("Failed to save settings", e);
        } finally {
            setSaving(false);
        }
    };

    const handleConnect = async (server: IMcpServerConfig) => {
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

        if (servers.find(s => s.id === id)) {
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
        const newServers = [...servers, newServer];
        setServers(newServers);
        saveChanges(newServers);
        setSelectedIdx(newServers.length - 1);
        setIsAdding(false);
        setNewServerId('');
    };

    const addRow = () => {
        const newServer: IMcpServerConfig = {
            id: `server-${Date.now()}`,
            type: 'stdio',
            command: '',
            args: [],
            enabled: true
        };
        const newServers = [...servers, newServer];
        setServers(newServers);
        saveChanges(newServers);
        setSelectedIdx(newServers.length - 1);
    };

    const removeRow = (index: number) => {
        const newServers = [...servers];
        newServers.splice(index, 1);
        setServers(newServers);
        saveChanges(newServers);
        if (selectedIdx === index) setSelectedIdx(null);
        else if (selectedIdx !== null && selectedIdx > index) setSelectedIdx(selectedIdx - 1);
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

    const handleBlur = () => {
        saveChanges(servers);
    };

    const toggleEnable = (index: number) => {
        const newServers = [...servers];
        newServers[index].enabled = !newServers[index].enabled;
        setServers(newServers);
        saveChanges(newServers);
    };

    const handleToggleTool = async (serverId: string, originalToolName: string) => {
        try {
            await window.electronAPI.tools.mcpToggleTool(serverId, originalToolName);
            // Refresh settings and tools
            await loadSettings();
            await fetchTools();
        } catch (e) {
            console.error("Failed to toggle tool", e);
        }
    };

    const handleSetToolTrustLevel = async (serverId: string, originalToolName: string, level: 'Ask' | 'Auto') => {
        try {
            await window.electronAPI.tools.mcpSetToolTrustLevel(serverId, originalToolName, level);
            // Refresh settings and tools
            await loadSettings();
            await fetchTools();
        } catch (e) {
            console.error("Failed to set tool trust level", e);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Loading configurations...</div>;

    const selectedServer = selectedIdx !== null ? servers[selectedIdx] : null;

    // Filter servers based on search term
    const filteredServers = servers.filter(server =>
        server.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter tools for the selected server
    const serverTools = selectedServer ? tools.filter(t => t.name.startsWith(`mcp__${selectedServer.id.replace(/[^a-zA-Z0-9_]/g, '_')}__`)) : [];

    return (
        <div className="flex h-full gap-6 animate-in fade-in duration-500">
            {/* Left: Server List - 与 ModelSettings 保持一致的样式 */}
            <div className="w-64 shrink-0 flex flex-col gap-4">
                {/* Search and Add Button */}
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
                            <button
                                onClick={handleAddServer}
                                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs py-1.5 rounded-lg transition-colors"
                            >
                                添加
                            </button>
                            <button
                                onClick={() => setIsAdding(false)}
                                className="flex-1 bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-gray-400 text-xs py-1.5 rounded-lg hover:bg-slate-300 transition-colors"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {filteredServers.map((server, idx) => {
                        const actualIdx = servers.findIndex(s => s.id === server.id);
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
                                    {isConnected && (
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

                    {filteredServers.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            <Box className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">{searchTerm ? '未找到相关服务器' : '暂无服务器'}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Detailed Config - 与 ModelSettings 保持一致 */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl flex-1 flex flex-col shadow-sm">
                    {selectedServer ? (
                        <>
                            {/* Detail Header & Tabs */}
                            <div className="border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#18181b] z-10 shrink-0">
                                <div className="px-6 py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{selectedServer.id}</h2>
                                        {status[selectedServer.id] === 'connected' && (
                                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                                <CheckCircle2 size={12} /> Connected
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                                            <button
                                                onClick={() => setActiveTab('general')}
                                                className={clsx(
                                                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                                                    activeTab === 'general'
                                                        ? "bg-white dark:bg-[#18181b] text-slate-800 dark:text-white shadow-sm"
                                                        : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                                                )}
                                            >
                                                通用设置
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('tools')}
                                                className={clsx(
                                                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                                                    activeTab === 'tools'
                                                        ? "bg-white dark:bg-[#18181b] text-slate-800 dark:text-white shadow-sm"
                                                        : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                                                )}
                                            >
                                                可用工具
                                                {serverTools.length > 0 && (
                                                    <span className={clsx(
                                                        "px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-white/10",
                                                        activeTab === 'tools' && "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                                                    )}>
                                                        {serverTools.length}
                                                    </span>
                                                )}
                                            </button>
                                        </div>

                                        <div className="w-px h-4 bg-slate-200 dark:bg-white/10" />

                                        <button
                                            onClick={() => removeRow(selectedIdx!)}
                                            className="text-slate-400 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg"
                                            title="删除服务器"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 overflow-hidden relative">
                                {activeTab === 'general' ? (
                                    <div className="absolute inset-0 overflow-y-auto p-6 space-y-6">
                                        {/* Error Message */}
                                        {status[selectedServer.id] === 'error' && (
                                            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                                                <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={16} />
                                                <div>
                                                    <h4 className="text-sm font-bold text-red-700 dark:text-red-400">连接失败</h4>
                                                    <p className="text-xs text-red-600 dark:text-red-300 mt-1 font-mono break-all">{statusMsg[selectedServer.id]}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Enable Toggle - Moved inside General */}
                                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className={clsx("p-2 rounded-lg", selectedServer.enabled ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-slate-200 dark:bg-white/10 text-slate-500")}>
                                                    <Server size={18} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-slate-800 dark:text-white">启用此服务器</div>
                                                    <div className="text-xs text-slate-500 dark:text-gray-400">启用后将自动加载工具</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => toggleEnable(selectedIdx!)}
                                                className={clsx(
                                                    "w-12 h-6 rounded-full transition-colors relative cursor-pointer",
                                                    selectedServer.enabled
                                                        ? "bg-emerald-500"
                                                        : "bg-slate-200 dark:bg-white/10"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                                                    selectedServer.enabled ? "translate-x-6" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>

                                        {/* Server ID (Name) */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                <Server size={14} /> 名称 (Name)
                                            </label>
                                            <input
                                                type="text"
                                                value={selectedServer.id}
                                                onChange={(e) => updateRow(selectedIdx!, 'id', e.target.value)}
                                                onBlur={handleBlur}
                                                placeholder="my-mcp-server"
                                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200 font-mono"
                                            />
                                            <p className="text-[10px] text-slate-400 dark:text-gray-500">
                                                唯一标识符，用于区分不同的 MCP 服务器
                                            </p>
                                        </div>

                                        {/* Transport Type */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                <Settings2 size={14} /> 传输类型 (Transport)
                                            </label>
                                            <select
                                                value={selectedServer.type || 'stdio'}
                                                onChange={(e) => updateRow(selectedIdx!, 'type', e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200 appearance-none"
                                            >
                                                <option value="stdio">Stdio (本地命令)</option>
                                                <option value="sse">SSE (远程服务器)</option>
                                            </select>
                                        </div>

                                        {/* Dynamic Fields based on Type */}
                                        {selectedServer.type === 'sse' ? (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                        <Globe size={14} /> 服务器地址 (URL)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={selectedServer.url || ''}
                                                        onChange={(e) => updateRow(selectedIdx!, 'url', e.target.value)}
                                                        onBlur={handleBlur}
                                                        placeholder="http://localhost:3000/sse"
                                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200 font-mono"
                                                    />
                                                    <p className="text-[10px] text-slate-400 dark:text-gray-500">
                                                        SSE 端点地址，通常以 /sse 结尾
                                                    </p>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center justify-between">
                                                        <div className="flex items-center gap-2"><Key size={14} /> API 密钥 (可选)</div>
                                                        <span className="text-[10px] font-normal normal-case text-slate-400">仅存储于本地</span>
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={selectedServer.apiKey || ''}
                                                        onChange={(e) => updateRow(selectedIdx!, 'apiKey', e.target.value)}
                                                        onBlur={handleBlur}
                                                        placeholder="sk-..."
                                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200 font-mono"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                        <TerminalSquare size={14} /> 命令 (Command)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={selectedServer.command || ''}
                                                        onChange={(e) => updateRow(selectedIdx!, 'command', e.target.value)}
                                                        onBlur={handleBlur}
                                                        placeholder="uvx"
                                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200 font-mono"
                                                    />
                                                    <p className="text-[10px] text-slate-400 dark:text-gray-500">
                                                        用于启动 MCP 服务器的可执行命令
                                                    </p>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                        <Command size={14} /> 参数 (Arguments)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={argsToString(selectedServer.args || [])}
                                                        onChange={(e) => updateRow(selectedIdx!, 'args', e.target.value)}
                                                        onBlur={handleBlur}
                                                        placeholder="mcp-server-sqlite --db-path ./data.db"
                                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all text-slate-700 dark:text-gray-200 font-mono"
                                                    />
                                                    <p className="text-[10px] text-slate-400 dark:text-gray-500">
                                                        以空格分隔的命令行参数
                                                    </p>
                                                </div>
                                            </>
                                        )}

                                        {/* Connect Button */}
                                        <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                                            <button
                                                onClick={() => handleConnect(selectedServer)}
                                                disabled={status[selectedServer.id] === 'connecting' || status[selectedServer.id] === 'connected'}
                                                className={clsx(
                                                    "w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                                                    status[selectedServer.id] === 'connected'
                                                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 cursor-default"
                                                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
                                                )}
                                            >
                                                {status[selectedServer.id] === 'connected' ? '已连接' : status[selectedServer.id] === 'connecting' ? '连接中...' : '测试连接'}
                                                {status[selectedServer.id] !== 'connected' && <LinkIcon size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 overflow-y-auto p-6">
                                        {/* Tools Tab Content */}
                                        {status[selectedServer.id] !== 'connected' ? (
                                            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
                                                <div className="w-12 h-12 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center">
                                                    <LinkIcon size={24} className="opacity-50" />
                                                </div>
                                                <div className="text-center">
                                                    <h3 className="text-sm font-medium text-slate-600 dark:text-gray-300">尚未连接</h3>
                                                    <p className="text-xs mt-1">请在“通用设置”中连接服务器以查看可用工具</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h3 className="text-sm font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                        <Database size={14} /> 可用工具列表
                                                    </h3>
                                                    <span className="text-xs text-slate-400">
                                                        共 {serverTools.length} 个
                                                    </span>
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
                                                            {serverTools.map((tool, tIdx) => {
                                                                const originalName = tool.name.split('__').slice(2).join('__');
                                                                const srvToolSettings = selectedServer.toolSettings || {};
                                                                const tSetting = srvToolSettings[originalName] || { enabled: true, trustLevel: 'Ask' };

                                                                return (
                                                                    <tr key={tIdx} className={clsx(
                                                                        "hover:bg-slate-50 dark:hover:bg-white/5 transition-colors",
                                                                        !tSetting.enabled && "opacity-60"
                                                                    )}>
                                                                        <td className="px-4 py-4 align-top">
                                                                            <code className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded border border-indigo-100 dark:border-indigo-500/20 font-mono">
                                                                                {originalName}
                                                                            </code>
                                                                        </td>
                                                                        <td className="px-4 py-4 align-top">
                                                                            <button
                                                                                onClick={() => handleToggleTool(selectedServer.id, originalName)}
                                                                                className={clsx(
                                                                                    "w-10 h-5 rounded-full transition-colors relative cursor-pointer",
                                                                                    tSetting.enabled ? "bg-indigo-500" : "bg-slate-200 dark:bg-white/10"
                                                                                )}
                                                                            >
                                                                                <div className={clsx(
                                                                                    "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                                                                                    tSetting.enabled ? "translate-x-5" : "translate-x-0"
                                                                                )} />
                                                                            </button>
                                                                        </td>
                                                                        <td className="px-4 py-4 align-top">
                                                                            <select
                                                                                value={tSetting.trustLevel}
                                                                                onChange={(e) => handleSetToolTrustLevel(selectedServer.id, originalName, e.target.value as 'Ask' | 'Auto')}
                                                                                className={clsx(
                                                                                    "text-xs font-medium rounded-lg px-2 py-1 outline-none border transition-all appearance-none pr-6 relative bg-no-repeat bg-[right_0.4rem_center] bg-[length:0.8rem]",
                                                                                    tSetting.trustLevel === 'Auto'
                                                                                        ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                                                                        : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400"
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
                                                                );
                                                            })}
                                                            {serverTools.length === 0 && (
                                                                <tr>
                                                                    <td colSpan={2} className="px-4 py-12 text-center text-slate-400 italic text-sm">
                                                                        <div className="flex flex-col items-center gap-2">
                                                                            <Database className="opacity-20" size={32} />
                                                                            此服务器未返回任何工具
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
                            <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center">
                                <Settings2 size={32} className="text-slate-300 dark:text-slate-600" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-base font-medium text-slate-600 dark:text-gray-300">未选择服务器</h3>
                                <p className="text-sm text-slate-400 dark:text-gray-500 mt-1">从左侧列表选择一个服务器进行配置</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
