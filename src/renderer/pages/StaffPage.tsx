import React, { useEffect, useState } from 'react'
import { useStaffStore } from '../store/useStaffStore'
import { useTranslation } from 'react-i18next'
import { Plus, ArrowLeft, Trash2, User, Briefcase } from 'lucide-react'
import { StaffProfile } from '../../common/types/staff'

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
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('staffPage.title')}</h1>
                    <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{t('staffPage.subtitle')}</p>
                </div>
                <button
                    onClick={() => setEditingId('new')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
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
    const initial = profile.name.charAt(0).toUpperCase()

    return (
        <button
            onClick={onClick}
            className="text-left p-5 rounded-xl border border-slate-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/50 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-md transition-all duration-200 group"
        >
            <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {initial}
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
                        {profile.persona.slice(0, 80)}{profile.persona.length > 80 ? '...' : ''}
                    </p>
                </div>
            </div>
        </button>
    )
}

function StaffEditor({ id, onBack }: { id: string; onBack: () => void }) {
    const { profiles, createProfile, updateProfile, deleteProfile } = useStaffStore()
    const { t } = useTranslation()
    const isNew = id === 'new'
    const existing = isNew ? null : profiles.find(p => p.id === id)

    const [name, setName] = useState(existing?.name || '')
    const [description, setDescription] = useState(existing?.description || '')
    const [persona, setPersona] = useState(existing?.persona || '')
    const [model, setModel] = useState(existing?.model || '')
    const [skillIds, setSkillIds] = useState<string[]>(existing?.skillIds || [])
    const [allSkills, setAllSkills] = useState<{ id: string, name: string, description: string }[]>([])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        window.electronAPI.tools.getSkills().then(setAllSkills).catch(console.error)
    }, [])

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
                persona: persona.trim(),
                description: description.trim() || undefined,
                model: model.trim() || undefined,
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

    return (
        <div className="h-full overflow-y-auto px-8 py-8 max-w-2xl mx-auto">
            {/* Back */}
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 mb-6 transition-colors">
                <ArrowLeft size={16} /> {t('staffPage.back')}
            </button>

            <div className="space-y-6">
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

                {/* Model Override */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">{t('staffPage.model')}</label>
                    <input
                        value={model} onChange={e => setModel(e.target.value)}
                        placeholder={t('staffPage.modelDesc')}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                    />
                </div>

                {/* Skills */}
                <div>
                    <label className="block text-sm font-medium mb-2">{t('staffPage.skills')}</label>
                    {allSkills.length === 0 ? (
                        <div className="text-xs text-slate-400 dark:text-zinc-500">{t('loading')}</div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {allSkills.map(skill => (
                                <button
                                    key={skill.id}
                                    onClick={() => toggleSkill(skill.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                                        skillIds.includes(skill.id)
                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-400'
                                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                                    }`}
                                >
                                    {skill.name}
                                </button>
                            ))}
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
