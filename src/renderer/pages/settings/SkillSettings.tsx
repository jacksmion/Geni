import React, { useEffect, useState } from 'react';
import { Skill } from '../../../common/types/skill';
import { Search, Loader2, Plus, X, ToyBrick as Brick, CheckCircle2, Shield, AlertCircle, Info, Trash2, Box, Command, FileText } from 'lucide-react';
import { clsx } from 'clsx';

const SkillSettings: React.FC = () => {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'content'>('general');
    const [isAdding, setIsAdding] = useState(false);
    const [newSkillName, setNewSkillName] = useState('');

    const fetchSkills = async () => {
        try {
            const data = await window.electronAPI.tools.getSkills();
            setSkills(data);
        } catch (error) {
            console.error('Failed to fetch skills:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSkills().then(() => {
            // Default select the first skill if available
            // Note: fetchSkills doesn't return data directly but updates state, 
            // but we can handle it in the fetchSkills logic or a separate effect.
        });
    }, []);

    useEffect(() => {
        if (skills.length > 0 && selectedIdx === null) {
            setSelectedIdx(0);
        }
    }, [skills]);

    const handleToggle = async (id: string) => {
        const updated = await window.electronAPI.tools.toggleSkill(id);
        setSkills(updated);
    };

    const handleSetTrustLevel = async (id: string, level: 'Ask' | 'Auto') => {
        const updated = await window.electronAPI.tools.setTrustLevel(id, level);
        setSkills(updated);
    };

    const handleAddSkill = () => {
        // Since skills are file-based, this might just be a UI placeholder 
        // or a way to trigger local creation in the future.
        alert("目前技能通过在项目 .agent/skills 目录下添加 .md 文件来自动发现。");
        setIsAdding(false);
        setNewSkillName('');
    };

    const filteredSkills = skills.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedSkill = (selectedIdx !== null && filteredSkills[selectedIdx]) ? filteredSkills[selectedIdx] : null;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                <span className="text-sm font-medium">正在加载技能库...</span>
            </div>
        );
    }

    return (
        <div className="flex h-full gap-6 animate-in fade-in duration-500">
            {/* Left: Skill List */}
            <div className="w-64 shrink-0 flex flex-col gap-4">
                {/* Search and Add */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                        <input
                            type="text"
                            placeholder="搜索技能..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        />
                    </div>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="p-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 transition-colors"
                        title="录入新技能"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                {isAdding && (
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl space-y-2 animate-in slide-in-from-top-2">
                        <input
                            type="text"
                            autoFocus
                            placeholder="技能名称"
                            value={newSkillName}
                            onChange={(e) => setNewSkillName(e.target.value)}
                            className="w-full bg-white dark:bg-black/20 border border-indigo-200 dark:border-indigo-500/30 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-slate-900 dark:text-slate-100"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddSkill()}
                        />
                        <div className="flex gap-2">
                            <button onClick={handleAddSkill} className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs py-1.5 rounded-lg transition-colors">添加</button>
                            <button onClick={() => setIsAdding(false)} className="flex-1 bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-gray-400 text-xs py-1.5 rounded-lg hover:bg-slate-300 transition-colors">取消</button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {filteredSkills.map((skill, idx) => {
                        const isSelected = selectedIdx === idx;
                        const isActive = skill.enabled;

                        return (
                            <button
                                key={skill.id}
                                onClick={() => setSelectedIdx(idx)}
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
                                            <Brick size={18} />
                                        </div>
                                        <span className={clsx("font-medium text-sm", isSelected ? "text-slate-800 dark:text-white" : "text-slate-600 dark:text-gray-400")}>{skill.name}</span>
                                    </div>
                                    {isActive && (
                                        <div className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">ON</div>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 dark:text-gray-500 truncate pl-[42px]">{skill.id}</p>
                            </button>
                        );
                    })}

                    {filteredSkills.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            <Box className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">{searchTerm ? '未找到相关技能' : '暂无技能'}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Detailed View */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/5 rounded-2xl flex-1 flex flex-col shadow-sm">
                    {selectedSkill ? (
                        <>
                            {/* Detail Header & Tabs */}
                            <div className="border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#18181b] z-10 shrink-0">
                                <div className="px-6 py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{selectedSkill.name}</h2>
                                        {selectedSkill.enabled && (
                                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                                <CheckCircle2 size={12} /> Active
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                                            <button
                                                onClick={() => setActiveTab('general')}
                                                className={clsx(
                                                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                                                    activeTab === 'general' ? "bg-white dark:bg-[#18181b] text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                                                )}
                                            >
                                                常规配置
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('content')}
                                                className={clsx(
                                                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                                                    activeTab === 'content' ? "bg-white dark:bg-[#18181b] text-slate-800 dark:text-white shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                                                )}
                                            >
                                                技能说明
                                            </button>
                                        </div>

                                        <div className="w-px h-4 bg-slate-200 dark:bg-white/10" />

                                        <button disabled className="text-slate-300 dark:text-gray-700 p-1.5 cursor-not-allowed" title="暂不支持直接删除">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-hidden relative">
                                {activeTab === 'general' ? (
                                    <div className="absolute inset-0 overflow-y-auto p-6 space-y-6">
                                        {/* Status Toggle */}
                                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className={clsx("p-2 rounded-lg", selectedSkill.enabled ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-slate-200 dark:bg-white/10 text-slate-500")}>
                                                    <Brick size={18} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-slate-800 dark:text-white">启用此技能</div>
                                                    <div className="text-xs text-slate-500 dark:text-gray-400">关闭后助手将无法使用包含的工具</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleToggle(selectedSkill.id)}
                                                className={clsx(
                                                    "w-12 h-6 rounded-full transition-colors relative cursor-pointer",
                                                    selectedSkill.enabled ? "bg-emerald-500" : "bg-slate-200 dark:bg-white/10"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                                                    selectedSkill.enabled ? "translate-x-6" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>

                                        {/* Trust Level */}
                                        <div className="space-y-4">
                                            <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                <Shield size={14} /> 权限与隐私
                                            </label>
                                            <div className="grid grid-cols-2 gap-4">
                                                <button
                                                    onClick={() => handleSetTrustLevel(selectedSkill.id, 'Ask')}
                                                    className={clsx(
                                                        "p-4 rounded-xl border flex flex-col gap-2 text-left transition-all",
                                                        selectedSkill.trustLevel === 'Ask'
                                                            ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30"
                                                            : "bg-white dark:bg-white/5 border-slate-100 dark:border-white/5 hover:border-slate-200"
                                                    )}
                                                >
                                                    <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", selectedSkill.trustLevel === 'Ask' ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600" : "bg-slate-100 dark:bg-white/10 text-slate-400")}>
                                                        <AlertCircle size={18} />
                                                    </div>
                                                    <span className={clsx("text-sm font-semibold", selectedSkill.trustLevel === 'Ask' ? "text-amber-800 dark:text-amber-400" : "text-slate-600 dark:text-gray-400")}>执行前确认</span>
                                                    <span className="text-xs text-slate-400 leading-tight">助手运行该技能的工具前需获得您的许可</span>
                                                </button>

                                                <button
                                                    onClick={() => handleSetTrustLevel(selectedSkill.id, 'Auto')}
                                                    className={clsx(
                                                        "p-4 rounded-xl border flex flex-col gap-2 text-left transition-all",
                                                        selectedSkill.trustLevel === 'Auto'
                                                            ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30"
                                                            : "bg-white dark:bg-white/5 border-slate-100 dark:border-white/5 hover:border-slate-200"
                                                    )}
                                                >
                                                    <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center", selectedSkill.trustLevel === 'Auto' ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600" : "bg-slate-100 dark:bg-white/10 text-slate-400")}>
                                                        <Shield size={18} />
                                                    </div>
                                                    <span className={clsx("text-sm font-semibold", selectedSkill.trustLevel === 'Auto' ? "text-emerald-800 dark:text-emerald-400" : "text-slate-600 dark:text-gray-400")}>高度信任</span>
                                                    <span className="text-xs text-slate-400 leading-tight">助手可以无须询问直接执行此技能包含的工具</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Skill Metadata */}
                                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                    <Box size={14} /> 唯一标识 (ID)
                                                </label>
                                                <div className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-gray-300 font-mono">
                                                    {selectedSkill.id}
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                    <Command size={14} /> 存储路径 (Path)
                                                </label>
                                                <div className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-gray-300 font-mono break-all">
                                                    {selectedSkill.path}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 overflow-y-auto p-6 space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-indigo-500 font-semibold mb-2">
                                                <Info size={16} />
                                                <h3 className="text-sm">技能描述</h3>
                                            </div>
                                            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 text-sm text-slate-600 dark:text-gray-300 leading-relaxed">
                                                {selectedSkill.description}
                                            </div>
                                        </div>

                                        {selectedSkill.content && (
                                            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
                                                <div className="flex items-center gap-2 text-slate-500 font-semibold mb-2">
                                                    <FileText size={16} />
                                                    <h3 className="text-sm">核心指令 (SKILL.md)</h3>
                                                </div>
                                                <div className="p-4 bg-slate-50 dark:bg-black/30 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-gray-400 font-mono leading-normal whitespace-pre-wrap overflow-x-hidden">
                                                    {selectedSkill.content}
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
                                <Brick size={32} className="text-slate-300 dark:text-slate-600" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-base font-medium text-slate-600 dark:text-gray-300">未选择技能</h3>
                                <p className="text-sm text-slate-400 dark:text-gray-500 mt-1">从左侧列表选择一个技能进行查看和配置</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SkillSettings;
