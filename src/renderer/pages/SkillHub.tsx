import React, { useEffect, useState } from 'react';
import SkillCard from '../components/SkillCard';
import { Skill } from '../../common/types/skill';
import { Search, Loader2 } from 'lucide-react';

const SkillHub: React.FC = () => {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const fetchSkills = async () => {
        try {
            const data = await window.electronAPI.getSkills();
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
        const updated = await window.electronAPI.toggleSkill(id);
        setSkills(updated);
    };

    const handleSetTrustLevel = async (id: string, level: 'Ask' | 'Auto') => {
        const updated = await window.electronAPI.setTrustLevel(id, level);
        setSkills(updated);
    };

    const filteredSkills = skills.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-xl font-bold text-white mb-1">技能管理中心</h2>
                    <p className="text-xs text-gray-500">管理助手的能力集、信任授权与运行配置</p>
                </div>

                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input
                        type="text"
                        placeholder="搜索已有技能..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded-xl py-2 pl-10 pr-4 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-3">
                    <Loader2 className="animate-spin" size={32} />
                    <span className="text-sm">加载技能库中...</span>
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
                <div className="text-center py-20 bg-[#252526] rounded-3xl border border-dashed border-[#333]">
                    <p className="text-gray-500 text-sm">未发现符合条件的技能</p>
                    <p className="text-xs text-gray-600 mt-1">请尝试更换搜索词或检查 skills 文件夹</p>
                </div>
            )}
        </div>
    );
};

export default SkillHub;
