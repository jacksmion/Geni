import React, { useEffect, useState } from 'react';
import SkillCard from '../../components/SkillCard';
import { Skill } from '../../../common/types/skill';
import { Search, Loader2 } from 'lucide-react';

const SkillSettings: React.FC = () => {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

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

    const handleSetTrustLevel = async (id: string, level: 'Ask' | 'Auto') => {
        const updated = await window.electronAPI.tools.setTrustLevel(id, level);
        setSkills(updated);
    };

    const filteredSkills = skills.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="animate-in fade-in duration-500 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100 mb-1">技能管理</h2>
                    <p className="text-sm text-slate-500 dark:text-gray-400">管理助手的能力集、信任授权与运行配置</p>
                </div>
                <div className="relative w-64 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500" size={14} />
                    <input
                        type="text"
                        placeholder="搜索技能..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-700 dark:text-gray-200"
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 text-gray-500 gap-4">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                        </div>
                    </div>
                    <span className="text-sm font-medium tracking-wide opacity-70">正在加载技能库...</span>
                </div>
            ) : filteredSkills.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSkills.map(skill => (
                        <SkillCard
                            key={skill.id}
                            skill={skill}
                            onToggle={handleToggle}
                            onSetTrustLevel={handleSetTrustLevel}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10 backdrop-blur-sm">
                    <p className="text-gray-400 font-medium">未发现符合条件的技能</p>
                    <p className="text-xs text-gray-600 mt-2">请尝试更换搜索词或检查 skills 文件夹</p>
                </div>
            )}
        </div>
    );
};

export default SkillSettings;
