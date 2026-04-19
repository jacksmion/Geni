import React, { useState, useRef, useEffect } from 'react'
import { Sparkles, ChevronDown, Search, Check } from 'lucide-react'
import { useChatStore } from '../../store/useChatStore'
import { Skill } from '../../../common/types/skill'
import { cn } from '../../utils/cn'
import { useClickOutside } from '../../hooks/useClickOutside'

export function SkillSelector() {
    const [isOpen, setIsOpen] = useState(false)
    const [skills, setSkills] = useState<Skill[]>([])
    const [search, setSearch] = useState('')
    const selectedSkillIds = useChatStore(s => s.selectedSkillIds)
    const setSelectedSkillIds = useChatStore(s => s.setSelectedSkillIds)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (isOpen) {
            window.electronAPI.tools.getSkills().then(data => setSkills(data))
        }
    }, [isOpen])

    useClickOutside(dropdownRef, () => setIsOpen(false), isOpen)

    const effectiveIds = selectedSkillIds ?? skills.filter(s => s.enabled).map(s => s.id)
    const selectedCount = effectiveIds.length

    const filteredSkills = skills.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase())
    )

    const handleToggle = (id: string) => {
        const ids = [...effectiveIds]
        const newIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
        setSelectedSkillIds(newIds)
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => {
                    const next = !isOpen
                    setIsOpen(next)
                    if (next) setSearch('')
                }}
                className={cn(
                    "flex h-7 items-center gap-1 px-2.5 rounded-full text-[11px] font-medium transition-all max-w-[200px] bg-transparent border-none",
                    "hover:bg-slate-100 dark:hover:bg-white/[0.06]",
                    selectedCount > 0
                        ? "text-slate-500 dark:text-zinc-300"
                        : "text-slate-400 dark:text-zinc-500"
                )}
            >
                    <Sparkles size={12} className="shrink-0 opacity-80" />
                <span className="truncate">
                    {skills.length === 0 ? 'Skills' : `${selectedCount} Skills`}
                </span>
                <ChevronDown size={11} className={cn(
                    "text-slate-400 dark:text-zinc-500 transition-transform shrink-0",
                    isOpen && "rotate-180"
                )} />
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-[#1e1e20] border border-slate-200/60 dark:border-white/10 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5">
                        <div className="flex items-center gap-2">
                            <Search size={12} className="text-slate-400 dark:text-zinc-500 shrink-0" />
                            <input
                                type="text"
                                placeholder="搜索技能..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="flex-1 bg-transparent text-xs text-slate-700 dark:text-zinc-300 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none"
                                autoFocus
                            />
                            <span className="text-[10px] text-slate-300 dark:text-zinc-600 tabular-nums shrink-0">
                                {selectedCount}/{skills.length}
                            </span>
                        </div>
                    </div>

                    <div className="py-1 max-h-56 overflow-y-auto">
                        {filteredSkills.length === 0 ? (
                            <div className="px-3 py-4 text-center">
                                <p className="text-xs text-slate-400 dark:text-zinc-500">
                                    {search ? '未找到相关技能' : '暂无可用技能'}
                                </p>
                            </div>
                        ) : (
                            filteredSkills.map(skill => {
                                const isChecked = effectiveIds.includes(skill.id)
                                return (
                                    <button
                                        key={skill.id}
                                        onClick={() => handleToggle(skill.id)}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                                            isChecked
                                                ? "bg-slate-100 dark:bg-white/[0.07]"
                                                : "hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors",
                                            isChecked
                                                ? "bg-slate-700 border-slate-700 dark:bg-zinc-200 dark:border-zinc-200"
                                                : "border-slate-300 dark:border-zinc-600"
                                        )}>
                                            {isChecked && <Check size={10} className="text-white" strokeWidth={3} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-slate-700 dark:text-zinc-300 truncate">
                                                {skill.name}
                                            </div>
                                            <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                                                {skill.description}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })
                        )}
                    </div>

                    <div className="px-3 py-2 border-t border-slate-100 dark:border-white/5 flex items-center gap-2">
                        <button
                            onClick={() => setSelectedSkillIds(skills.map(s => s.id))}
                            className="text-[10px] text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                        >
                            全选
                        </button>
                        <span className="text-slate-200 dark:text-zinc-700">|</span>
                        <button
                            onClick={() => setSelectedSkillIds([])}
                            className="text-[10px] text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                        >
                            全不选
                        </button>
                        <span className="text-slate-200 dark:text-zinc-700">|</span>
                        <button
                            onClick={() => { setSelectedSkillIds(null); setIsOpen(false) }}
                            className="text-[10px] text-violet-400 dark:text-violet-500 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                        >
                            重置为默认
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
