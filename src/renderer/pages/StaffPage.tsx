import React, { useEffect, useMemo, useState } from 'react'
import { useStaffStore } from '../store/useStaffStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useModalStore } from '../store/useModalStore'
import { useTranslation } from 'react-i18next'
import { Plus, ArrowLeft, Trash2, User, Briefcase, ChevronDown, Check, Search } from 'lucide-react'
import EmojiPicker, { Categories, Theme, type EmojiClickData } from 'emoji-picker-react'
import { StaffProfile } from '../../common/types/staff'
import { StaffAvatar } from '../components/StaffAvatar'

export default function StaffPage() {
    const { profiles, loading, editingId, loadProfiles, setEditingId } = useStaffStore()
    const { t } = useTranslation()

    useEffect(() => { loadProfiles() }, [loadProfiles])

    if (editingId !== null) {
        return <StaffEditor id={editingId} onBack={() => setEditingId(null)} />
    }

    return (
        <div className="flex h-full flex-col">
            {/* Draggable Header */}
            <header className="h-12 flex items-center justify-between px-4 draggable shrink-0 z-10 bg-white dark:bg-[#141414]">
                <div className="flex items-center gap-2">
                    <h1 className="text-sm font-semibold">{t('staffPage.title')}</h1>
                    <span className="text-xs text-slate-400 dark:text-zinc-500">{t('staffPage.subtitle')}</span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setEditingId('new')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
                    >
                        <Plus size={14} />
                        {t('staffPage.create')}
                    </button>
                    <div className="w-32" />
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
                {loading ? (
                    <div className="text-center py-20 text-slate-400">{t('loading')}</div>
                ) : profiles.length === 0 ? (
                    <div className="text-center py-20">
                        <User size={48} className="mx-auto mb-4 text-slate-300 dark:text-zinc-600" />
                        <h3 className="text-lg font-medium mb-2">{t('staffPage.empty')}</h3>
                        <p className="text-sm text-slate-400 dark:text-zinc-500 max-w-md mx-auto">{t('staffPage.emptyDesc')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {profiles.map(p => (
                            <StaffCard key={p.id} profile={p} onClick={() => setEditingId(p.id)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function StaffCard({ profile, onClick }: { profile: StaffProfile; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="text-left p-5 rounded-xl border border-slate-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/50 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-md transition-all duration-200 group"
        >
            <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-700/60 flex items-center justify-center shrink-0">
                    <StaffAvatar
                        avatar={profile.avatar}
                        name={profile.name}
                        size={20}
                        className="text-slate-600 dark:text-zinc-300 font-bold"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {profile.name}
                    </h3>
                    {profile.description && (
                        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1">
                            <Briefcase size={11} /> {profile.description}
                        </p>
                    )}
                </div>
            </div>
        </button>
    )
}

function SkillList({ allSkills, skillSearch, skillIds, toggleSkill, t }: {
    allSkills: { id: string; name: string; description: string }[]
    skillSearch: string
    skillIds: string[]
    toggleSkill: (id: string) => void
    t: (key: string) => string
}) {
    const keyword = skillSearch.trim().toLowerCase()
    const filtered = keyword
        ? allSkills.filter(s => s.name.toLowerCase().includes(keyword) || (s.description && s.description.toLowerCase().includes(keyword)))
        : allSkills

    if (allSkills.length === 0) {
        return <div className="px-3 py-4 text-xs text-slate-400 dark:text-zinc-500 text-center">{t('loading')}</div>
    }
    if (filtered.length === 0) {
        return <div className="px-3 py-4 text-xs text-slate-400 dark:text-zinc-500 text-center">无匹配技能</div>
    }
    return <>{filtered.map(skill => {
        const isSelected = skillIds.includes(skill.id)
        return (
            <button
                key={skill.id}
                type="button"
                onClick={() => toggleSkill(skill.id)}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-zinc-700/50 transition-colors"
            >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                        ? 'bg-indigo-500 border-indigo-500 text-white'
                        : 'border-slate-300 dark:border-zinc-600'
                }`}>
                    {isSelected && <Check size={10} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-700 dark:text-zinc-200 truncate">{skill.name}</div>
                    {skill.description && (
                        <div className="text-xs text-slate-400 dark:text-zinc-500 truncate">{skill.description}</div>
                    )}
                </div>
            </button>
        )
    })}</>
}

function StaffEditor({ id, onBack }: { id: string; onBack: () => void }) {
    const { profiles, createProfile, updateProfile, deleteProfile } = useStaffStore()
    const settings = useSettingsStore(s => s.settings)
    const { t } = useTranslation()
    const isNew = id === 'new'
    const existing = isNew ? null : profiles.find(p => p.id === id)

    const [name, setName] = useState(existing?.name || '')
    const [avatar, setAvatar] = useState(existing?.avatar || '')
    const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
    const [description, setDescription] = useState(existing?.description || '')
    const [persona, setPersona] = useState(existing?.systemPrompt || '')
    const [modelId, setModelId] = useState(existing?.modelId || '')
    const [skillIds, setSkillIds] = useState<string[]>(existing?.skillIds || [])
    const [allSkills, setAllSkills] = useState<{ id: string, name: string, description: string }[]>([])
    const [saving, setSaving] = useState(false)
    const [skillDropdownOpen, setSkillDropdownOpen] = useState(false)
    const [skillSearch, setSkillSearch] = useState('')

    // Build available model options from settings
    const modelOptions = useMemo(() => {
        const options: { value: string; label: string; provider: string }[] = []
        const providers = settings.llm?.providers || {}
        for (const [provider, config] of Object.entries(providers)) {
            if (!config.enabled) continue
            for (const m of config.models || []) {
                if (!m.enabled) continue
                options.push({
                    value: `${provider}/${m.model}`,
                    label: m.label || m.model,
                    provider: config.label || provider,
                })
            }
        }
        return options
    }, [settings.llm])

    useEffect(() => {
        window.electronAPI.tools.getSkills().then(setAllSkills).catch(console.error)
    }, [])

    // Close skill dropdown on outside click
    useEffect(() => {
        if (!skillDropdownOpen) return
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            if (!target.closest('[data-skill-dropdown]')) {
                setSkillDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [skillDropdownOpen])

    // Close avatar picker on outside click
    const avatarPickerRef = React.useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!avatarPickerOpen) return
        const handler = (e: MouseEvent) => {
            if (avatarPickerRef.current && !avatarPickerRef.current.contains(e.target as Node)) {
                setAvatarPickerOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [avatarPickerOpen])

    const toggleSkill = (skillId: string) => {
        setSkillIds(prev => prev.includes(skillId) ? prev.filter(id => id !== skillId) : [...prev, skillId])
    }

    const canSave = name.trim() && persona.trim()

    const handleSave = async () => {
        if (!canSave) return
        setSaving(true)
        try {
            const payload = {
                name: name.trim(),
                avatar: avatar.trim() || undefined,
                systemPrompt: persona.trim(),
                description: description.trim() || undefined,
                modelId: modelId || undefined,
                skillIds
            }
            if (isNew) {
                await createProfile(payload)
            } else {
                await updateProfile(id, payload)
            }
            onBack()
        } finally {
            setSaving(false)
        }
    }

    const showConfirm = useModalStore(s => s.showConfirm)

    const handleDelete = () => {
        showConfirm({
            message: t('staffPage.deleteConfirm'),
            onConfirm: async () => {
                await deleteProfile(id)
                onBack()
            }
        })
    }

    const selectedModelOption = modelOptions.find(o => o.value === modelId)

    return (
        <div className="flex h-full flex-col">
            {/* Draggable Header */}
            <header className="h-12 flex items-center justify-between px-4 draggable shrink-0 z-10 bg-white dark:bg-[#141414]">
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors">
                    <ArrowLeft size={16} /> {t('staffPage.back')}
                </button>
                <div className="w-32" />
            </header>

            <div className="flex-1 overflow-y-auto px-8 py-6 max-w-2xl mx-auto w-full">
                <div className="space-y-6">
                {/* Avatar + Name */}
                <div className="relative flex items-start gap-4" ref={avatarPickerRef}>
                    {/* Avatar Picker */}
                    <div className="shrink-0">
                        <button
                            type="button"
                            onClick={() => setAvatarPickerOpen(!avatarPickerOpen)}
                            className={`
                                w-16 h-16 rounded-2xl flex items-center justify-center transition-all border-2 border-dashed
                                ${avatarPickerOpen
                                    ? 'border-indigo-400 dark:border-indigo-500/60 bg-indigo-50/50 dark:bg-indigo-500/5 ring-2 ring-indigo-500/20'
                                    : avatar
                                        ? 'border-transparent'
                                        : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
                                }
                                ${avatar
                                    ? 'bg-slate-100 dark:bg-zinc-700/60 border-transparent'
                                    : ''
                                }
                            `}
                        >
                            <StaffAvatar
                                avatar={avatar || undefined}
                                name={name || undefined}
                                size={24}
                                className="text-slate-600 dark:text-zinc-300 font-bold"
                            />
                        </button>

                        {/* Popup Picker */}
                        {avatarPickerOpen && (
                            <div className="absolute top-full left-0 mt-2 z-50">
                                <div onClick={e => e.stopPropagation()}>
                                    <EmojiPicker
                                        onEmojiClick={(emojiData: EmojiClickData) => {
                                            setAvatar(emojiData.emoji)
                                            setAvatarPickerOpen(false)
                                        }}
                                        width={320}
                                        height={360}
                                        searchPlaceholder="搜索 Emoji..."
                                        previewConfig={{ showPreview: false }}
                                        skinTonesDisabled
                                        theme={settings.theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                                        categories={[
                                            { category: Categories.SUGGESTED, name: '最近使用' },
                                            { category: Categories.SMILEYS_PEOPLE, name: '人物' },
                                            { category: Categories.ANIMALS_NATURE, name: '动物 & 自然' },
                                            { category: Categories.FOOD_DRINK, name: '食物 & 饮料' },
                                            { category: Categories.TRAVEL_PLACES, name: '旅行 & 地点' },
                                            { category: Categories.ACTIVITIES, name: '活动' },
                                            { category: Categories.OBJECTS, name: '物品' },
                                            { category: Categories.SYMBOLS, name: '符号' },
                                            { category: Categories.FLAGS, name: '旗帜' },
                                        ]}
                                    />
                                </div>
                                {avatar && (
                                    <div className="mt-1 text-center">
                                        <button
                                            type="button"
                                            onClick={() => { setAvatar(''); setAvatarPickerOpen(false) }}
                                            className="text-[11px] text-slate-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                        >
                                            移除头像
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                        <label className="block text-sm font-medium mb-1.5">{t('staffPage.name')}</label>
                        <input
                            value={name} onChange={e => setName(e.target.value)}
                            placeholder={t('staffPage.namePlaceholder')}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                        />
                    </div>
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">{t('staffPage.description')}</label>
                    <input
                        value={description} onChange={e => setDescription(e.target.value)}
                        placeholder={t('staffPage.descriptionPlaceholder')}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                    />
                </div>

                {/* Persona */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">{t('staffPage.persona')}</label>
                    <textarea
                        value={persona} onChange={e => setPersona(e.target.value)}
                        placeholder={t('staffPage.personaPlaceholder')}
                        rows={8}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-y font-mono"
                    />
                </div>

                {/* Model Selection Dropdown */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">{t('staffPage.model')}</label>
                    <select
                        value={modelId}
                        onChange={e => setModelId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 appearance-none cursor-pointer"
                    >
                        <option value="">{t('staffPage.modelDefault') || '使用全局默认模型'}</option>
                        {modelOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.provider} / {opt.label}
                            </option>
                        ))}
                    </select>
                    {modelId && selectedModelOption && (
                        <p className="mt-1 text-xs text-slate-400 dark:text-zinc-500">
                            {selectedModelOption.provider} · {selectedModelOption.value}
                        </p>
                    )}
                </div>

                {/* Skills Multi-Select Dropdown */}
                <div data-skill-dropdown>
                    <label className="block text-sm font-medium mb-1.5">{t('staffPage.skills')}</label>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => { setSkillDropdownOpen(!skillDropdownOpen); setSkillSearch('') }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-left flex items-center justify-between hover:border-slate-300 dark:hover:border-zinc-600 transition-colors"
                        >
                            <span className={skillIds.length > 0 ? 'text-slate-700 dark:text-zinc-200' : 'text-slate-400 dark:text-zinc-500'}>
                                {skillIds.length > 0
                                    ? `已选择 ${skillIds.length} 个技能`
                                    : (t('staffPage.skillPlaceholder') || '选择技能（可多选）')
                                }
                            </span>
                            <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${skillDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {skillDropdownOpen && (
                            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg max-h-60 overflow-hidden flex flex-col">
                                {/* Search input */}
                                <div className="p-2 border-b border-slate-100 dark:border-white/5 shrink-0">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                                        <input
                                            type="text"
                                            value={skillSearch}
                                            onChange={e => setSkillSearch(e.target.value)}
                                            placeholder="搜索技能..."
                                            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-400"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                {/* Skill list */}
                                <div className="overflow-y-auto">
                                    <SkillList
                                        allSkills={allSkills}
                                        skillSearch={skillSearch}
                                        skillIds={skillIds}
                                        toggleSkill={toggleSkill}
                                        t={t}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Selected skills tags */}
                    {skillIds.length > 0 && !skillDropdownOpen && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {skillIds.map(sid => {
                                const skill = allSkills.find(s => s.id === sid)
                                if (!skill) return null
                                return (
                                    <span
                                        key={sid}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30"
                                    >
                                        {skill.name}
                                        <button
                                            type="button"
                                            onClick={() => toggleSkill(sid)}
                                            className="hover:text-indigo-900 dark:hover:text-indigo-200"
                                        >
                                            ×
                                        </button>
                                    </span>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                    <button
                        onClick={handleSave} disabled={!canSave || saving}
                        className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium transition-colors"
                    >
                        {saving ? '...' : t('staffPage.save')}
                    </button>
                    <button onClick={onBack} className="px-5 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                        {t('staffPage.cancel')}
                    </button>
                    {!isNew && (
                        <button onClick={handleDelete} className="ml-auto p-2 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            </div>
            </div>
        </div>
    )
}
