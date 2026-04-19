import React, { useEffect, useMemo, useState } from 'react'
import { useStaffStore } from '../store/useStaffStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useModalStore } from '../store/useModalStore'
import { useTranslation } from 'react-i18next'
import { Plus, ArrowLeft, Trash2, User, ChevronDown, Check, Search, Sparkles, Loader2, MessageSquare, Download, Upload } from 'lucide-react'
import EmojiPicker, { Categories, Theme, type EmojiClickData } from 'emoji-picker-react'
import { StaffProfile } from '../../common/types/staff'
import { StaffAvatar } from '../components/StaffAvatar'
import { useChatStore } from '../store/useChatStore'
import { clsx } from 'clsx'

function InlineToast({ message, type }: { message: string; type: 'error' | 'success' | 'info' }) {
    return (
        <div
            className={clsx(
                "fixed top-4 right-4 z-[120] px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200",
                type === 'error' && "bg-red-500 text-white",
                type === 'success' && "bg-emerald-500 text-white",
                type === 'info' && "bg-slate-800 text-white dark:bg-white dark:text-slate-800",
            )}
        >
            {message}
        </div>
    )
}

export default function StaffPage() {
    const { profiles, loading, editingId, loadProfiles, setEditingId } = useStaffStore()
    const { t } = useTranslation()
    const showConfirm = useModalStore(s => s.showConfirm)
    const [searchTerm, setSearchTerm] = useState('')
    const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null)

    const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
        setToast({ message, type })
        window.setTimeout(() => setToast(null), 3000)
    }

    useEffect(() => { loadProfiles() }, [loadProfiles])

    const filteredProfiles = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase()
        if (!keyword) return profiles
        return profiles.filter(p =>
            p.name.toLowerCase().includes(keyword) ||
            (p.description && p.description.toLowerCase().includes(keyword))
        )
    }, [profiles, searchTerm])

    const handleImport = async () => {
        try {
            const result = await window.electronAPI.staff.importProfile()

            if (!result || result.status === 'cancel') return

            if (result.status === 'success') {
                await loadProfiles()
            } else if (result.status === 'conflict') {
                showConfirm({
                    message: `已存在同名员工「${result.conflictName}」，如何处理？`,
                    confirmText: '覆盖',
                    cancelText: '跳过',
                    extraActions: [
                        { label: '重命名', value: 'rename' },
                    ],
                    onConfirm: async (action?: string) => {
                        const finalAction = action === 'rename' ? 'rename' : 'overwrite'
                        await window.electronAPI.staff.confirmImport(finalAction, result.conflictId)
                        await loadProfiles()
                    },
                })
            } else {
                showToast(result.error || '导入失败', 'error')
            }
        } catch (e: any) {
            showToast(e.message || '导入失败', 'error')
        }
    }

    if (editingId !== null) {
        return <StaffEditor id={editingId} onBack={() => setEditingId(null)} />
    }

    return (
        <div className="flex h-full flex-col">
            {toast && <InlineToast message={toast.message} type={toast.type} />}
            {/* Draggable Header */}
            <header className="relative z-50 shrink-0 bg-white dark:bg-[#141414] backdrop-blur-xl draggable">
                <div className="px-4 py-4 max-w-5xl mx-auto">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-base font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                            {t('staffPage.title')}
                        </h1>
                        <div className="w-32" />
                    </div>
                    {/* 搜索栏 + 操作按钮 */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                            <input
                                type="text"
                                placeholder={t('staffPage.search', '搜索员工...')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 dark:focus:border-indigo-500/30 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-gray-600"
                            />
                        </div>
                        <button
                            onClick={handleImport}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-all shrink-0"
                        >
                            <Download size={12} />
                            {t('staffPage.import', '导入')}
                        </button>
                        <button
                            onClick={() => setEditingId('new')}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-all shrink-0"
                        >
                            <Plus size={12} />
                            {t('staffPage.create')}
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-4 max-w-5xl mx-auto">
                    {loading ? (
                        <div className="text-center py-20 text-slate-400">{t('loading')}</div>
                    ) : filteredProfiles.length === 0 ? (
                        <div className="text-center py-20">
                            <User size={48} className="mx-auto mb-4 text-slate-300 dark:text-zinc-600" />
                            <h3 className="text-lg font-medium mb-2">{searchTerm ? (t('staffPage.noMatch', '无匹配结果')) : t('staffPage.empty')}</h3>
                            <p className="text-sm text-slate-400 dark:text-zinc-500 max-w-md mx-auto">{searchTerm ? (t('staffPage.noMatchDesc', '尝试其他关键词')) : t('staffPage.emptyDesc')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
                            {filteredProfiles.map(p => (
                                <StaffCard key={p.id} profile={p} onClick={() => setEditingId(p.id)} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function StaffCard({ profile, onClick }: { profile: StaffProfile; onClick: () => void }) {
    const createSession = useChatStore(s => s.createSession)
    const assignStaff = useChatStore(s => s.assignStaff)

    const handleUse = (e: React.MouseEvent) => {
        e.stopPropagation()
        const state = useChatStore.getState()
        if (state.activeSessionId === null) {
            useChatStore.setState({
                activeTab: 'chat',
                newTaskConfig: {
                    ...state.newTaskConfig,
                    title: profile.name,
                }
            })
            assignStaff(null, profile.id)
        } else {
            createSession(profile.name)
            const sessionId = useChatStore.getState().activeSessionId
            assignStaff(sessionId, profile.id)
        }
    }

    const handleExport = async (e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await window.electronAPI.staff.exportProfile(profile.id)
        } catch (err) {
            console.error('Export failed:', err)
        }
    }

    return (
        <button
            onClick={onClick}
            className="relative w-full h-full text-left p-5 rounded-xl bg-white dark:bg-white/[0.02] hover:bg-[#F5F5F7] dark:hover:bg-white/[0.04] transition-all duration-200 group flex flex-col"
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
                        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                            {profile.description}
                        </p>
                    )}
                </div>
            </div>
            {/* Hover actions */}
            <div
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
            >
                <span
                    role="button"
                    tabIndex={0}
                    onClick={handleExport}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-xs bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                    title="导出"
                >
                    <Upload size={13} />
                </span>
                <span
                    role="button"
                    tabIndex={0}
                    onClick={handleUse}
                    onKeyDown={e => { if (e.key === 'Enter') handleUse(e as unknown as React.MouseEvent) }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
                >
                    <MessageSquare size={12} />
                    {profile.name.length > 8 ? '' : '使用'}
                </span>
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
    const [generating, setGenerating] = useState(false)
    const [skillDropdownOpen, setSkillDropdownOpen] = useState(false)
    const [skillSearch, setSkillSearch] = useState('')
    const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null)

    const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
        setToast({ message, type })
        window.setTimeout(() => setToast(null), 3000)
    }

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

    const handleGeneratePrompt = async () => {
        if (!name.trim() || generating) return
        setGenerating(true)
        setPersona('')
        const unsub = window.electronAPI.staff.onGeneratePromptChunk((delta) => {
            setPersona(prev => prev + delta)
        })
        try {
            const result = await window.electronAPI.staff.generatePrompt(name.trim(), description.trim() || undefined, modelId || undefined)
            setPersona(result)
        } catch (err: any) {
            console.error('Failed to generate prompt:', err)
            showToast(err.message || '生成失败，请检查 LLM 配置', 'error')
        } finally {
            unsub()
            setGenerating(false)
        }
    }

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

    const [editorTab, setEditorTab] = useState<'basic' | 'skills'>('basic')

    return (
        <div className="flex h-full flex-col">
            {toast && <InlineToast message={toast.message} type={toast.type} />}
            {/* Draggable Header */}
            <header className="relative z-50 shrink-0 bg-white dark:bg-[#141414] draggable">
                <div className="flex items-center justify-between px-4 h-12">
                    <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors">
                        <ArrowLeft size={16} /> {t('staffPage.back')}
                    </button>
                    <div className="w-32" />
                </div>
                {/* Tab Bar */}
                <div className="flex px-4 gap-1 border-b border-slate-100 dark:border-white/5">
                    {(['basic', 'skills'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setEditorTab(tab)}
                            className={clsx(
                                "px-4 py-2 text-xs font-medium transition-colors relative",
                                editorTab === tab
                                    ? "text-indigo-600 dark:text-indigo-400"
                                    : "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                            )}
                        >
                            {tab === 'basic' ? t('staffPage.tabBasic', '基本信息') : t('staffPage.tabSkills', '技能')}
                            {editorTab === tab && (
                                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-indigo-500 dark:bg-indigo-400 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            </header>

            <div className="flex-1 overflow-y-auto px-8 py-6 max-w-2xl mx-auto w-full">
                {editorTab === 'basic' ? (
                    /* ─── Tab: 基本信息 ─── */
                    <div className="space-y-6">
                        {/* Avatar + Name */}
                        <div className="relative flex items-start gap-4" ref={avatarPickerRef}>
                            <div className="shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setAvatarPickerOpen(!avatarPickerOpen)}
                                    className={clsx(
                                        "w-16 h-16 rounded-2xl flex items-center justify-center transition-all border-2 border-dashed",
                                        avatarPickerOpen
                                            ? "border-indigo-400 dark:border-indigo-500/60 bg-indigo-50/50 dark:bg-indigo-500/5 ring-2 ring-indigo-500/20"
                                            : avatar
                                                ? "border-transparent bg-slate-100 dark:bg-zinc-700/60"
                                                : "border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 bg-slate-100 dark:bg-zinc-700/60"
                                    )}
                                >
                                    <StaffAvatar
                                        avatar={avatar || undefined}
                                        name={name || undefined}
                                        size={24}
                                        className="text-slate-600 dark:text-zinc-300 font-bold"
                                    />
                                </button>

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
                                                theme={useSettingsStore.getState().resolvedTheme === 'dark' ? Theme.DARK : Theme.LIGHT}
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
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-sm font-medium">{t('staffPage.persona')}</label>
                                <button
                                    type="button"
                                    onClick={handleGeneratePrompt}
                                    disabled={!name.trim() || generating}
                                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    {generating
                                        ? <><Loader2 size={12} className="animate-spin" /> 生成中...</>
                                        : <><Sparkles size={12} /> 智能生成</>
                                    }
                                </button>
                            </div>
                            <textarea
                                value={persona} onChange={e => setPersona(e.target.value)}
                                placeholder={t('staffPage.personaPlaceholder')}
                                rows={8}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-y font-mono"
                            />
                        </div>

                        {/* Model */}
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
                        </div>
                    </div>
                ) : (
                    /* ─── Tab: 技能 ─── */
                    <div className="flex flex-col gap-4 -mt-2">
                        {/* 已选标签 */}
                        {skillIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
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

                        {/* 搜索框 */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                            <input
                                type="text"
                                value={skillSearch}
                                onChange={e => setSkillSearch(e.target.value)}
                                placeholder={t('staffPage.skillSearch', '搜索技能...')}
                                className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 dark:focus:border-indigo-500/30 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-gray-600"
                            />
                        </div>

                        {/* 技能网格 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(() => {
                                const keyword = skillSearch.trim().toLowerCase()
                                const filtered = keyword
                                    ? allSkills.filter(s => s.name.toLowerCase().includes(keyword) || (s.description && s.description.toLowerCase().includes(keyword)))
                                    : allSkills
                                if (allSkills.length === 0) {
                                    return <div className="col-span-2 py-8 text-xs text-slate-400 dark:text-zinc-500 text-center">{t('loading')}</div>
                                }
                                if (filtered.length === 0) {
                                    return <div className="col-span-2 py-8 text-xs text-slate-400 dark:text-zinc-500 text-center">{t('staffPage.noSkillMatch', '无匹配技能')}</div>
                                }
                                return filtered.map(skill => {
                                    const isSelected = skillIds.includes(skill.id)
                                    return (
                                        <button
                                            key={skill.id}
                                            type="button"
                                            onClick={() => toggleSkill(skill.id)}
                                            className={clsx(
                                                "w-full px-3 py-2.5 text-left text-sm rounded-lg transition-all flex items-center gap-2.5",
                                                isSelected
                                                    ? "bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-indigo-200 dark:ring-indigo-500/30"
                                                    : "hover:bg-slate-50 dark:hover:bg-white/5"
                                            )}
                                        >
                                            <span className={clsx(
                                                "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                                isSelected
                                                    ? "bg-indigo-500 border-indigo-500 text-white"
                                                    : "border-slate-300 dark:border-zinc-600"
                                            )}>
                                                {isSelected && <Check size={10} strokeWidth={3} />}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-slate-700 dark:text-zinc-200 truncate text-[13px]">{skill.name}</div>
                                                {skill.description && (
                                                    <div className="text-xs text-slate-400 dark:text-zinc-500 truncate mt-0.5">{skill.description}</div>
                                                )}
                                            </div>
                                        </button>
                                    )
                                })
                            })()}
                        </div>
                    </div>
                )}
            </div>

            {/* Fixed Bottom Bar */}
            <div className="shrink-0 px-8 py-3 border-t border-slate-100 dark:border-white/5 bg-white dark:bg-[#141414]">
                <div className="flex items-center gap-3 max-w-2xl mx-auto">
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
