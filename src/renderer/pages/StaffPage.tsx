import React, { useEffect, useMemo, useState } from 'react'
import { useStaffStore } from '../store/useStaffStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useTranslation } from 'react-i18next'
import { Plus, ArrowLeft, Trash2, User, Briefcase, ChevronDown, Check } from 'lucide-react'
import { StaffProfile } from '../../common/types/staff'
import { StaffAvatar, STAFF_ICONS } from '../components/StaffAvatar'

/** 常用 Emoji 预设，按用途分组 */
const EMOJI_PRESETS = [
    // 人物 & 角色
    '🧑‍💻', '👨‍🎨', '👩‍🔬', '🧙‍♂️', '🦸', '🕵️', '👨‍🏫', '👩‍⚕️', '🤖',
    // 物品 & 工具
    '⚡', '🎯', '💡', '🔬', '🔧', '🛡️', '📊', '📝', '🎨',
    // 自然 & 符号
    '🚀', '🌟', '🔮', '💎', '🌈', '🔥', '❄️', '🌸', '🍀',
    // 动物
    '🦊', '🐱', '🐶', '🦁', '🐼', '🦉', '🐉', '🐝', '🐙',
]

export default function StaffPage() {
    const { profiles, loading, editingId, loadProfiles, setEditingId } = useStaffStore()
    const { t } = useTranslation()

    useEffect(() => { loadProfiles() }, [loadProfiles])

    if (editingId !== null) {
        return <StaffEditor id={editingId} onBack={() => setEditingId(null)} />
    }

    return (
        <div className="h-full overflow-y-auto px-8 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 pr-[140px]">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('staffPage.title')}</h1>
                    <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{t('staffPage.subtitle')}</p>
                </div>
                <button
                    onClick={() => setEditingId('new')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors no-drag"
                >
                    <Plus size={16} />
                    {t('staffPage.create')}
                </button>
            </div>

            {/* Grid */}
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
    )
}

function StaffCard({ profile, onClick }: { profile: StaffProfile; onClick: () => void }) {
    const hasIcon = profile.avatar && STAFF_ICONS[profile.avatar]
    return (
        <button
            onClick={onClick}
            className="text-left p-5 rounded-xl border border-slate-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/50 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-md transition-all duration-200 group"
        >
            <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className={hasIcon
                    ? "w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-700/60 flex items-center justify-center shrink-0"
                    : "w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0"
                }>
                    <StaffAvatar
                        avatar={profile.avatar}
                        name={profile.name}
                        size={hasIcon ? 22 : 20}
                        iconClassName={hasIcon ? "text-slate-600 dark:text-zinc-300" : undefined}
                        className={hasIcon ? undefined : "text-white font-bold"}
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
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-2 line-clamp-2">
                        {(profile.systemPrompt || '').slice(0, 80)}{((profile.systemPrompt || '').length > 80) ? '...' : ''}
                    </p>
                </div>
            </div>
        </button>
    )
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
    const [avatarTab, setAvatarTab] = useState<'icon' | 'emoji'>('icon')
    const [description, setDescription] = useState(existing?.description || '')
    const [persona, setPersona] = useState(existing?.systemPrompt || '')
    const [modelId, setModelId] = useState(existing?.modelId || '')
    const [skillIds, setSkillIds] = useState<string[]>(existing?.skillIds || [])
    const [allSkills, setAllSkills] = useState<{ id: string, name: string, description: string }[]>([])
    const [saving, setSaving] = useState(false)
    const [skillDropdownOpen, setSkillDropdownOpen] = useState(false)

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

    const handleDelete = async () => {
        if (!confirm(t('staffPage.deleteConfirm'))) return
        await deleteProfile(id)
        onBack()
    }

    const selectedModelOption = modelOptions.find(o => o.value === modelId)

    return (
        <div className="h-full overflow-y-auto px-8 py-8 max-w-2xl mx-auto">
            {/* Back */}
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 mb-6 transition-colors">
                <ArrowLeft size={16} /> {t('staffPage.back')}
            </button>

            <div className="space-y-6">
                {/* Avatar Picker */}
                <div className="relative" ref={avatarPickerRef}>
                    <label className="block text-sm font-medium mb-2">头像</label>
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => { setAvatarPickerOpen(!avatarPickerOpen); setAvatarTab('icon') }}
                            className={`
                                w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-all border-2 border-dashed
                                ${avatarPickerOpen
                                    ? 'border-indigo-400 dark:border-indigo-500/60 bg-indigo-50/50 dark:bg-indigo-500/5 ring-2 ring-indigo-500/20'
                                    : avatar
                                        ? 'border-transparent'
                                        : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
                                }
                                ${avatar && STAFF_ICONS[avatar]
                                    ? 'bg-slate-100 dark:bg-zinc-700/60 border-transparent'
                                    : avatar
                                        ? 'bg-gradient-to-br from-indigo-500 to-purple-500 border-transparent'
                                        : ''
                                }
                            `}
                        >
                            <StaffAvatar
                                avatar={avatar || undefined}
                                name={name || undefined}
                                size={avatar && STAFF_ICONS[avatar] ? 26 : 24}
                                iconClassName={avatar && STAFF_ICONS[avatar] ? "text-slate-600 dark:text-zinc-300" : "text-slate-400 dark:text-zinc-500"}
                                className={avatar && STAFF_ICONS[avatar] ? undefined : "text-white font-bold"}
                            />
                        </button>
                        <div className="text-xs text-slate-400 dark:text-zinc-500">
                            点击头像选择图标或 Emoji
                        </div>
                    </div>

                    {/* Popup Picker */}
                    {avatarPickerOpen && (
                        <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-[#1e1e20] border border-slate-200/60 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                            {/* Tab Switch */}
                            <div className="flex border-b border-slate-100 dark:border-white/5">
                                <button
                                    type="button"
                                    onClick={() => setAvatarTab('icon')}
                                    className={`flex-1 py-2.5 text-xs font-medium transition-colors ${avatarTab === 'icon' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300'}`}
                                >
                                    图标
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAvatarTab('emoji')}
                                    className={`flex-1 py-2.5 text-xs font-medium transition-colors ${avatarTab === 'emoji' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300'}`}
                                >
                                    Emoji
                                </button>
                            </div>

                            {/* Icon Grid */}
                            {avatarTab === 'icon' && (
                                <div className="p-3">
                                    <div className="grid grid-cols-9 gap-1.5">
                                        {Object.entries(STAFF_ICONS).map(([iconName, Icon]) => {
                                            const isSelected = avatar === iconName
                                            return (
                                                <button
                                                    key={iconName}
                                                    type="button"
                                                    onClick={() => { setAvatar(isSelected ? '' : iconName); setAvatarPickerOpen(false) }}
                                                    className={`
                                                        w-9 h-9 rounded-lg flex items-center justify-center transition-all border
                                                        ${isSelected
                                                            ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20'
                                                            : 'bg-slate-50 dark:bg-white/5 border-slate-200/60 dark:border-white/5 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-white/10 hover:text-slate-700 dark:hover:text-zinc-200'
                                                        }
                                                    `}
                                                    title={iconName}
                                                >
                                                    <Icon size={16} />
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Emoji Grid */}
                            {avatarTab === 'emoji' && (
                                <div className="p-3">
                                    <div className="grid grid-cols-9 gap-1.5">
                                        {EMOJI_PRESETS.map(emoji => {
                                            const isSelected = avatar === emoji
                                            return (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    onClick={() => { setAvatar(isSelected ? '' : emoji); setAvatarPickerOpen(false) }}
                                                    className={`
                                                        w-9 h-9 rounded-lg flex items-center justify-center transition-all border text-base leading-none
                                                        ${isSelected
                                                            ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/40 ring-1 ring-indigo-500/20'
                                                            : 'bg-slate-50 dark:bg-white/5 border-slate-200/60 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10'
                                                        }
                                                    `}
                                                >
                                                    {emoji}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Footer: clear selection */}
                            {avatar && (
                                <div className="px-3 py-2 border-t border-slate-100 dark:border-white/5">
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
                <div>
                    <label className="block text-sm font-medium mb-1.5">{t('staffPage.name')}</label>
                    <input
                        value={name} onChange={e => setName(e.target.value)}
                        placeholder={t('staffPage.namePlaceholder')}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                    />
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
                            onClick={() => setSkillDropdownOpen(!skillDropdownOpen)}
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
                            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg max-h-60 overflow-y-auto">
                                {allSkills.length === 0 ? (
                                    <div className="px-3 py-4 text-xs text-slate-400 dark:text-zinc-500 text-center">{t('loading')}</div>
                                ) : (
                                    allSkills.map(skill => {
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
                                    })
                                )}
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
    )
}
