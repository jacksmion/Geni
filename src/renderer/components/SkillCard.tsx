import React from 'react';
import { ToyBrick as Brick } from 'lucide-react';
import { Skill } from '../../common/types/skill';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface SkillCardProps {
    skill: Skill;
    onToggle: (id: string) => void;
}

const SkillCard: React.FC<SkillCardProps> = ({ skill, onToggle }) => {
    return (
        <div className={cn(
            "bg-white/5 backdrop-blur-md p-5 rounded-3xl border border-white/10 transition-all duration-300 group",
            skill.enabled ? "hover:border-indigo-500/50 hover:bg-white/10 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1" : "opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0"
        )}>
            <div className="flex justify-between items-start mb-4">
                <div className={cn(
                    "p-2.5 rounded-2xl transition-all shadow-lg",
                    skill.enabled ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-indigo-500/20" : "bg-white/5 text-gray-500"
                )}>
                    <Brick size={20} />
                </div>

                <div className="flex items-center gap-3">
                    {/* Enable Toggle */}
                    <button
                        onClick={() => onToggle(skill.id)}
                        className={cn(
                            "w-11 h-6 rounded-full relative transition-all duration-300 outline-none border border-transparent focus:ring-2 focus:ring-indigo-500/30",
                            skill.enabled ? "bg-indigo-500" : "bg-white/10 hover:bg-white/20"
                        )}
                    >
                        <div className={cn(
                            "absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-all duration-300 shadow-sm",
                            skill.enabled ? "left-[22px]" : "left-0.5"
                        )} />
                    </button>
                </div>
            </div>

            <div className="mb-4">
                <h3 className="font-bold text-base text-gray-100 group-hover:text-indigo-300 transition-colors mb-1.5">
                    {skill.name}
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 min-h-[2.5rem]">
                    {skill.description}
                </p>
            </div>

            <div className="flex gap-2 flex-wrap">
                <span className="px-2.5 py-1 bg-black/20 border border-white/5 rounded-lg text-[10px] text-gray-500 font-mono">
                    {skill.id}
                </span>
            </div>
        </div>
    );
};

export default SkillCard;
