import React from 'react';
import { ToyBrick as Brick, Check, Shield, AlertCircle } from 'lucide-react';
import { Skill } from '../../common/types/skill';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface SkillCardProps {
    skill: Skill;
    onToggle: (id: string) => void;
    onSetTrustLevel: (id: string, level: 'Ask' | 'Auto') => void;
}

const SkillCard: React.FC<SkillCardProps> = ({ skill, onToggle, onSetTrustLevel }) => {
    return (
        <div className={cn(
            "bg-[#2d2d2d] p-5 rounded-2xl border border-[#3c3c3c] transition-all group",
            skill.enabled ? "hover:border-indigo-500/50 shadow-lg shadow-indigo-500/5" : "opacity-60"
        )}>
            <div className="flex justify-between items-start mb-4">
                <div className={cn(
                    "p-2 rounded-xl transition-colors",
                    skill.enabled ? "bg-indigo-500 text-white" : "bg-[#3c3c3c] text-gray-500"
                )}>
                    <Brick size={20} />
                </div>

                <div className="flex items-center gap-3">
                    {/* Trust Level Toggle */}
                    <div className="flex bg-[#1e1e1e] rounded-lg p-1 border border-[#3c3c3c]">
                        <button
                            onClick={() => onSetTrustLevel(skill.id, 'Ask')}
                            className={cn(
                                "p-1 rounded-md transition-all",
                                skill.trustLevel === 'Ask' ? "bg-[#3c3c3c] text-amber-500 shadow-sm" : "text-gray-500 hover:text-gray-400"
                            )}
                            title="Ask for confirmation"
                        >
                            <AlertCircle size={14} />
                        </button>
                        <button
                            onClick={() => onSetTrustLevel(skill.id, 'Auto')}
                            className={cn(
                                "p-1 rounded-md transition-all",
                                skill.trustLevel === 'Auto' ? "bg-[#3c3c3c] text-emerald-500 shadow-sm" : "text-gray-500 hover:text-gray-400"
                            )}
                            title="Auto-process"
                        >
                            <Shield size={14} />
                        </button>
                    </div>

                    {/* Enable Toggle */}
                    <button
                        onClick={() => onToggle(skill.id)}
                        className={cn(
                            "w-10 h-5 rounded-full relative transition-colors duration-200 outline-none",
                            skill.enabled ? "bg-indigo-600" : "bg-[#3c3c3c]"
                        )}
                    >
                        <div className={cn(
                            "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-200 shadow-sm",
                            skill.enabled ? "right-1" : "left-1"
                        )} />
                    </button>
                </div>
            </div>

            <div className="mb-4">
                <h3 className="font-semibold text-white group-hover:text-indigo-400 transition-colors mb-1">
                    {skill.name}
                </h3>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1 font-bold">
                    {skill.trustLevel === 'Auto' ? (
                        <span className="text-emerald-500 flex items-center gap-1">
                            <Check size={10} /> Trusted
                        </span>
                    ) : (
                        <span className="text-amber-500">Ask Permission</span>
                    )}
                </p>
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 min-h-[2.5rem]">
                    {skill.description}
                </p>
            </div>

            <div className="flex gap-2">
                <span className="px-2 py-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded text-[10px] text-gray-500 font-mono lowercase">
                    {skill.id}
                </span>
                <span className="px-2 py-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded text-[10px] text-gray-500">
                    Claude Skills Ready
                </span>
            </div>
        </div>
    );
};

export default SkillCard;
