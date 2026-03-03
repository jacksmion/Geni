import React, { useEffect, useState } from 'react';
import { Skill } from '../../../common/types/skill';
import {
    Search, Loader2, Box, Sparkles, ToggleLeft, ToggleRight
} from 'lucide-react';
import { clsx } from 'clsx';

// 为每个技能分配固定的渐变色
const GRADIENT_PALETTES = [
    { from: 'from-indigo-500', to: 'to-violet-600', bg: 'bg-indigo-500', ring: 'ring-indigo-500/20' },
    { from: 'from-emerald-500', to: 'to-teal-600', bg: 'bg-emerald-500', ring: 'ring-emerald-500/20' },
    { from: 'from-orange-500', to: 'to-amber-600', bg: 'bg-orange-500', ring: 'ring-orange-500/20' },
    { from: 'from-pink-500', to: 'to-rose-600', bg: 'bg-pink-500', ring: 'ring-pink-500/20' },
    { from: 'from-cyan-500', to: 'to-blue-600', bg: 'bg-cyan-500', ring: 'ring-cyan-500/20' },
    { from: 'from-purple-500', to: 'to-fuchsia-600', bg: 'bg-purple-500', ring: 'ring-purple-500/20' },
    { from: 'from-lime-500', to: 'to-green-600', bg: 'bg-lime-500', ring: 'ring-lime-500/20' },
    { from: 'from-sky-500', to: 'to-indigo-600', bg: 'bg-sky-500', ring: 'ring-sky-500/20' },
];

function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getGradient(id: string) {
    return GRADIENT_PALETTES[hashString(id) % GRADIENT_PALETTES.length];
}

// 技能图标 emoji
function getSkillIcon(id: string) {
    const lower = id.toLowerCase();
    if (lower.includes('design') || lower.includes('canvas')) return '🎨';
    if (lower.includes('doc') || lower.includes('pdf')) return '📄';
    if (lower.includes('pptx') || lower.includes('ppt')) return '📊';
    if (lower.includes('xlsx') || lower.includes('excel')) return '�';
    if (lower.includes('git')) return '🔀';
    if (lower.includes('test')) return '🧪';
    if (lower.includes('code') || lower.includes('dev')) return '💻';
    if (lower.includes('skill') || lower.includes('creator')) return '🛠️';
    if (lower.includes('frontend') || lower.includes('ui')) return '🖼️';
    if (lower.includes('api') || lower.includes('fetch') || lower.includes('web')) return '🌐';
    if (lower.includes('data') || lower.includes('db')) return '🗃️';
    if (lower.includes('plan') || lower.includes('todo')) return '📋';
    return '⚡';
}

interface SkillRowProps {
    skill: Skill;
    gradient: typeof GRADIENT_PALETTES[0];
    onToggle: (id: string) => void;
}

const SkillRow: React.FC<SkillRowProps> = ({ skill, gradient, onToggle }) => {
    const icon = getSkillIcon(skill.id);

    return (
        <div
            className={clsx(
                "flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 group",
                "hover:bg-slate-50 dark:hover:bg-white/[0.03]",
                !skill.enabled && "opacity-55"
            )}
        >
            {/* 图标 */}
            <div className={clsx(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base transition-all",
                "bg-gradient-to-br shadow-sm",
                gradient.from, gradient.to,
                !skill.enabled && "grayscale opacity-70"
            )}>
                <span>{icon}</span>
            </div>

            {/* 名称 + 描述 */}
            <div className="flex-1 min-w-0">
                <h3 className={clsx(
                    "text-[13px] font-semibold leading-tight truncate",
                    skill.enabled
                        ? "text-slate-800 dark:text-gray-100"
                        : "text-slate-500 dark:text-gray-500"
                )}>
                    {skill.name}
                </h3>
                <p className={clsx(
                    "text-[11px] leading-snug truncate mt-0.5",
                    skill.enabled
                        ? "text-slate-400 dark:text-gray-500"
                        : "text-slate-300 dark:text-gray-600"
                )}>
                    {skill.description || '暂无描述'}
                </p>
            </div>

            {/* Toggle Switch */}
            <button
                onClick={(e) => { e.stopPropagation(); onToggle(skill.id); }}
                className={clsx(
                    "w-9 h-[20px] rounded-full relative transition-all duration-300 outline-none shrink-0",
                    "focus:ring-2 focus:ring-indigo-500/30",
                    skill.enabled
                        ? "bg-emerald-500 shadow-sm shadow-emerald-500/30"
                        : "bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15"
                )}
                title={skill.enabled ? '点击禁用' : '点击启用'}
            >
                <div className={clsx(
                    "absolute top-[2px] w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300",
                    skill.enabled ? "left-[18px]" : "left-[2px]"
                )} />
            </button>
        </div>
    );
};

const SkillSettings: React.FC = () => {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

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
        fetchSkills();
    }, []);

    const handleToggle = async (id: string) => {
        const updated = await window.electronAPI.tools.toggleSkill(id);
        setSkills(updated);
    };

    const filteredSkills = skills.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const enabledCount = skills.filter(s => s.enabled).length;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <span className="text-sm font-medium">正在加载技能库...</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-black/20 overflow-hidden animate-in fade-in duration-500">
            {/* 顶部 Header */}
            <header className="shrink-0 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#18181b]/80 backdrop-blur-xl draggable">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl shadow-lg shadow-indigo-500/20">
                                <Sparkles size={16} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-base font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                                    技能商店
                                </h1>
                                <p className="text-[11px] text-slate-400 dark:text-gray-500">
                                    为 AI 助手扩展专业能力 · 已启用 <span className="text-emerald-500 font-bold">{enabledCount}</span> / {skills.length}
                                </p>
                            </div>
                        </div>
                        {/* 占位符给窗口控制按钮 */}
                        <div className="w-20" />
                    </div>

                    {/* 搜索栏 */}
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                        <input
                            type="text"
                            placeholder="搜索技能..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 dark:focus:border-indigo-500/30 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-gray-600"
                        />
                    </div>
                </div>
            </header>

            {/* 技能列表 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="px-4 py-4 max-w-5xl mx-auto">
                    {filteredSkills.length > 0 ? (
                        <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden">
                            <div className="grid grid-cols-1 md:grid-cols-2">
                                {filteredSkills.map((skill) => (
                                    <SkillRow
                                        key={skill.id}
                                        skill={skill}
                                        gradient={getGradient(skill.id)}
                                        onToggle={handleToggle}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                            <div className="w-14 h-14 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-4 border border-slate-200 dark:border-white/5">
                                <Box size={28} className="text-slate-300 dark:text-gray-700" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-600 dark:text-gray-300 mb-1">
                                {searchTerm ? '未找到相关技能' : '暂无技能'}
                            </h3>
                            <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs text-center">
                                {searchTerm
                                    ? '尝试使用其他关键词搜索'
                                    : '在项目 .geni/skills 目录下添加技能文件夹即可自动发现'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SkillSettings;
