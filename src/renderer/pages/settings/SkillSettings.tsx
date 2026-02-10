import React, { useEffect, useState } from 'react';
import { Skill } from '../../../common/types/skill';
import { Search, Loader2, Plus, X, ToyBrick as Brick, CheckCircle2, Info, Trash2, Box, Command, FileText } from 'lucide-react';
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
        <div className="flex h-full w-full bg-slate-50 dark:bg-black/20 overflow-hidden animate-in fade-in duration-500">
            {/* Left: Skill List Sidebar */}
            <div className="w-72 shrink-0 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#18181b]/50 flex flex-col">
                <header className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center px-4 draggable shrink-0 bg-white dark:bg-[#18181b]">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg">
                            <Brick size={16} />
                        </div>
                        <h1 className="text-sm font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                            技能库
                        </h1>
                    </div>
                </header>

                <div className="p-4 flex flex-col gap-4 flex-1 overflow-hidden">
                    {/* Search and Add */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                            <input
                                type="text"
                                placeholder="搜索技能..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                            />
                        </div>
                        <button
                            onClick={() => setIsAdding(!isAdding)}
                            className="p-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 transition-colors shadow-sm"
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

                    <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {filteredSkills.map((skill, idx) => {
                            const isSelected = selectedIdx === idx;
                            const isActive = skill.enabled;

                            return (
                                <button
                                    key={skill.id}
                                    onClick={() => setSelectedIdx(idx)}
                                    className={clsx(
                                        "w-full text-left p-3 rounded-xl border transition-all duration-200 group relative mb-1",
                                        isSelected
                                            ? "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 shadow-sm z-10"
                                            : "bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2.5">
                                            <div className={clsx(
                                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                                isSelected ? "bg-indigo-500 text-white shadow-indigo-500/20 shadow-lg" : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400"
                                            )}>
                                                <Brick size={16} />
                                            </div>
                                            <span className={clsx("font-semibold text-sm", isSelected ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-gray-400")}>{skill.name}</span>
                                        </div>
                                        {isActive && (
                                            <div className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">ON</div>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-400 dark:text-gray-500 truncate pl-[42px] font-mono leading-none opacity-80">{skill.id}</p>
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
            </div>

            {/* Right: Detailed View */}
            <main className="flex-1 flex flex-col overflow-hidden relative h-full bg-white dark:bg-[#09090b]">
                {selectedSkill ? (
                    <>
                        {/* Detail Header */}
                        <header className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 draggable shrink-0 z-10 bg-white dark:bg-[#09090b]">
                            <div className="flex items-center gap-4">
                                <h1 className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                                    {selectedSkill.name}
                                </h1>
                                {selectedSkill.enabled ? (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> ACTIVE
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-[10px] font-bold text-slate-400 dark:text-gray-500 flex items-center gap-1">
                                        OFFLINE
                                    </span>
                                )}

                                <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-1" />

                                <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                                    <button
                                        onClick={() => setActiveTab('general')}
                                        className={clsx(
                                            "px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
                                            activeTab === 'general' ? "bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                                        )}
                                    >
                                        常规配置
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('content')}
                                        className={clsx(
                                            "px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
                                            activeTab === 'content' ? "bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                                        )}
                                    >
                                        技能说明
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button disabled className="text-slate-300 dark:text-gray-700 p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-not-allowed group">
                                    <Trash2 size={16} />
                                </button>
                                {/* 占位符给窗口控制按钮 */}
                                <div className="w-12" />
                            </div>
                        </header>

                        {/* Content Scroll Area */}
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <div className="max-w-4xl mx-auto space-y-8">
                                {activeTab === 'general' ? (
                                    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                                        {/* Status Card */}
                                        <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={clsx(
                                                    "w-12 h-12 rounded-xl flex items-center justify-center text-xl",
                                                    selectedSkill.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-200 dark:bg-white/10 text-slate-400"
                                                )}>
                                                    <Brick size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="text-base font-bold text-slate-800 dark:text-white leading-tight">启用此技能</h3>
                                                    <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">关闭后助手将无法调用该技能包含的工具集</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleToggle(selectedSkill.id)}
                                                className={clsx(
                                                    "w-12 h-6 rounded-full transition-all relative cursor-pointer ring-offset-2 focus:ring-2 focus:ring-indigo-500",
                                                    selectedSkill.enabled ? "bg-emerald-500 shadow-lg shadow-emerald-500/20" : "bg-slate-200 dark:bg-white/10"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300",
                                                    selectedSkill.enabled ? "translate-x-6" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>

                                        {/* Info Sections */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest pl-1">
                                                    唯一标识 (ID)
                                                </label>
                                                <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-gray-300 font-mono">
                                                    {selectedSkill.id}
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest pl-1">
                                                    存储路径 (PATH)
                                                </label>
                                                <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-xs text-slate-700 dark:text-gray-300 font-mono break-all leading-relaxed">
                                                    {selectedSkill.path}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-indigo-500/80">
                                                <Info size={16} />
                                                <h3 className="text-xs font-bold uppercase tracking-wider">技能描述</h3>
                                            </div>
                                            <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-gray-300 leading-relaxed shadow-sm">
                                                {selectedSkill.description}
                                            </div>
                                        </div>

                                        {selectedSkill.content && (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 text-slate-400">
                                                    <FileText size={16} />
                                                    <h3 className="text-xs font-bold uppercase tracking-wider">核心指令集 (SKILL.MD)</h3>
                                                </div>
                                                <div className="p-6 bg-slate-900/90 border border-white/5 rounded-2xl text-[13px] text-gray-300 font-mono leading-relaxed whitespace-pre-wrap overflow-x-hidden shadow-2xl relative group">
                                                    <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <div className="px-2 py-1 bg-white/10 rounded text-[10px] text-white/50">READ ONLY</div>
                                                    </div>
                                                    {selectedSkill.content}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-6">
                        <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-3xl flex items-center justify-center rotate-3 border border-slate-200 dark:border-white/10 shadow-sm">
                            <Brick size={40} className="text-slate-300 dark:text-slate-700" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-gray-200">未选择技能</h3>
                            <p className="text-sm text-slate-500 dark:text-gray-500 mt-2 max-w-xs mx-auto">
                                从左侧列表选择一个技能，查看其详细指令、配置及其包含的工具能力。
                            </p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default SkillSettings;
