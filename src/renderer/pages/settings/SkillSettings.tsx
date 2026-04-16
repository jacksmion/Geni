import React, { useEffect, useRef, useState } from 'react';
import { Skill } from '../../../common/types/skill';
import {
    Search, Loader2, Box, Sparkles, ToggleLeft, ToggleRight, Download, Trash2, ChevronDown, FileArchive, FolderOpen, X, Plus
} from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Switch } from '../../components/Switch';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { useChatStore } from '../../store/useChatStore';

// 统一的低饱和固态颜色
const NEUTRAL_PALETTES = [
    { bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400' },
    { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' },
    { bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400' },
    { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400' },
    { bg: 'bg-cyan-50 dark:bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400' },
    { bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400' },
    { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
    { bg: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400' },
];

function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getPalette(id: string) {
    return NEUTRAL_PALETTES[hashString(id) % NEUTRAL_PALETTES.length];
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

interface SkillDetailDialogProps {
    skill: Skill;
    onClose: () => void;
}

const SkillDetailDialog: React.FC<SkillDetailDialogProps> = ({ skill, onClose }) => {
    const { t } = useTranslation();
    const [mode, setMode] = useState<'preview' | 'source'>('preview');

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-2xl max-h-[80vh] mx-4 flex flex-col animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <span className="text-lg">{getSkillIcon(skill.id)}</span>
                        <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">{skill.name}</h3>
                            <p className="text-[11px] text-slate-400 dark:text-gray-500">{skill.source} · {skill.id}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Preview / Source Toggle */}
                        <div className="flex rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 p-0.5">
                            <button
                                onClick={() => setMode('preview')}
                                className={clsx(
                                    "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                                    mode === 'preview'
                                        ? "bg-white dark:bg-white/10 text-slate-800 dark:text-gray-200 shadow-sm"
                                        : "text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-400"
                                )}
                            >
                                {t('skillSettings.preview', 'Preview')}
                            </button>
                            <button
                                onClick={() => setMode('source')}
                                className={clsx(
                                    "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                                    mode === 'source'
                                        ? "bg-white dark:bg-white/10 text-slate-800 dark:text-gray-200 shadow-sm"
                                        : "text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-400"
                                )}
                            >
                                {t('skillSettings.source', 'Source')}
                            </button>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
                    {mode === 'preview' ? (
                        <MarkdownRenderer content={skill.content || ''} />
                    ) : (
                        <pre className="text-xs leading-relaxed text-slate-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-words">{skill.rawContent || skill.content || ''}</pre>
                    )}
                </div>
            </div>
        </div>
    );
};

interface SkillCardProps {
    skill: Skill;
    palette: typeof NEUTRAL_PALETTES[0];
    onToggle: (id: string) => void;
    onDelete?: (skill: Skill) => void;
    onClick?: (skill: Skill) => void;
}

const SOURCE_LABELS: Record<Skill['source'], string> = {
    builtin: 'Builtin',
    global: 'User',
    project: 'Project',
    dotAgents: '.Agents',
};

const SkillCard: React.FC<SkillCardProps> = ({ skill, palette, onToggle, onDelete, onClick }) => {
    const { t } = useTranslation();
    const icon = getSkillIcon(skill.id);

    return (
        <div
            onClick={() => onClick?.(skill)}
            className={clsx(
                "relative flex flex-col gap-3 p-4 rounded-xl transition-all duration-200 group",
                "bg-white dark:bg-white/[0.02] border border-slate-200/70 dark:border-white/[0.06]",
                "hover:border-slate-300 dark:hover:border-white/[0.12] hover:shadow-sm",
                "cursor-pointer",
                !skill.enabled && "opacity-50"
            )}
        >
            {/* 顶部：图标 + 名称 + 操作按钮 */}
            <div className="flex items-start gap-3">
                <div className={clsx(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg transition-all",
                    "border border-slate-200/50 dark:border-white/5",
                    palette.bg, palette.text,
                    !skill.enabled && "grayscale opacity-70 bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-zinc-500"
                )}>
                    <span>{icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className={clsx(
                            "text-[13px] font-semibold leading-tight truncate",
                            skill.enabled
                                ? "text-slate-800 dark:text-gray-100"
                                : "text-slate-500 dark:text-gray-500"
                        )}>
                            {skill.name}
                        </h3>
                        <span className={clsx(
                            "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none",
                            skill.source === 'builtin' && "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
                            skill.source === 'global' && "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
                            skill.source === 'project' && "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
                            skill.source === 'dotAgents' && "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
                        )}>
                            {SOURCE_LABELS[skill.source]}
                        </span>
                    </div>
                    <p className={clsx(
                        "text-[11px] leading-relaxed mt-1 line-clamp-2",
                        skill.enabled
                            ? "text-slate-400 dark:text-gray-500"
                            : "text-slate-300 dark:text-gray-600"
                    )}>
                        {skill.description || t('skillSettings.noDescription')}
                    </p>
                </div>
            </div>

            {/* 底部：来源路径 + 操作 */}
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                <span className="text-[10px] text-slate-300 dark:text-gray-600 truncate max-w-[60%]" title={skill.path}>
                    {skill.id}
                </span>
                <div className="flex items-center gap-1">
                    {/* Delete Button */}
                    {onDelete && skill.source === 'global' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(skill); }}
                            className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-all"
                            title={t('skillSettings.delete.button')}
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                    {/* Toggle Switch */}
                    <div onClick={(e) => e.stopPropagation()}>
                        <Switch
                            checked={!!skill.enabled}
                            onChange={() => onToggle(skill.id)}
                            size="sm"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

interface ConflictDialogProps {
    skillName: string;
    onAction: (action: 'overwrite' | 'skip' | 'rename') => void;
    onCancel: () => void;
}

const ConflictDialog: React.FC<ConflictDialogProps> = ({ skillName, onAction, onCancel }) => {
    const { t } = useTranslation();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-2">
                    {t('skillSettings.import.conflictTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-5">
                    {t('skillSettings.import.conflictDesc', { name: skillName })}
                </p>
                <div className="flex flex-col gap-2">
                    <button
                        onClick={() => onAction('overwrite')}
                        className="w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors text-left"
                    >
                        <span className="font-semibold">{t('skillSettings.import.overwrite')}</span>
                        <span className="block text-[10px] opacity-60 mt-0.5">{t('skillSettings.import.overwriteDesc')}</span>
                    </button>
                    <button
                        onClick={() => onAction('rename')}
                        className="w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-colors text-left"
                    >
                        <span className="font-semibold">{t('skillSettings.import.rename')}</span>
                        <span className="block text-[10px] opacity-60 mt-0.5">{t('skillSettings.import.renameDesc')}</span>
                    </button>
                    <button
                        onClick={() => onAction('skip')}
                        className="w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-left"
                    >
                        <span className="font-semibold">{t('skillSettings.import.skip')}</span>
                        <span className="block text-[10px] opacity-60 mt-0.5">{t('skillSettings.import.skipDesc')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

interface DeleteConfirmDialogProps {
    skillName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({ skillName, onConfirm, onCancel }) => {
    const { t } = useTranslation();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-2">
                    {t('skillSettings.delete.confirmTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-5">
                    {t('skillSettings.delete.confirmDesc', { name: skillName })}
                </p>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                    >
                        {t('skillSettings.import.skip')}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-xl text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                    >
                        {t('skillSettings.delete.button')}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SkillSettings: React.FC = () => {
    const { t } = useTranslation();
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [importing, setImporting] = useState(false);
    const [conflict, setConflict] = useState<{ skillName: string; targetPath: string; sourceTempDir?: string; originalPath: string } | null>(null);
    const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
    const [importMenuOpen, setImportMenuOpen] = useState(false);
    const [detailSkill, setDetailSkill] = useState<Skill | null>(null);
    const importMenuRef = useRef<HTMLDivElement>(null);

    const fetchSkills = async (reload = false) => {
        try {
            const data = reload
                ? await window.electronAPI.tools.reloadSkills()
                : await window.electronAPI.tools.getSkills();
            setSkills(data);
        } catch (error) {
            console.error('Failed to fetch skills:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Reload from disk on first open to pick up external changes
        fetchSkills(true);
    }, []);

    // Close import menu on outside click
    useEffect(() => {
        if (!importMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
                setImportMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [importMenuOpen]);

    const handleToggle = async (id: string) => {
        const updated = await window.electronAPI.tools.toggleSkill(id);
        setSkills(updated);
    };

    const showImportMessage = (type: 'success' | 'error', text: string) => {
        setImportMessage({ type, text });
        setTimeout(() => setImportMessage(null), 3000);
    };

    const handleImportFromPath = async (selectedPath: string | null) => {
        if (!selectedPath) return;
        setImporting(true);
        setImportMessage(null);
        try {
            const result = await window.electronAPI.tools.importSkill(selectedPath);
            if (result.status === 'success') {
                fetchSkills();
                showImportMessage('success', t('skillSettings.import.success', { name: result.skillName }));
            } else if (result.status === 'conflict') {
                setConflict({
                    skillName: result.skillName!,
                    targetPath: result.targetPath!,
                    sourceTempDir: result.sourceTempDir,
                    originalPath: selectedPath,
                });
            } else {
                showImportMessage('error', result.error || t('skillSettings.import.error'));
            }
        } catch (error: any) {
            showImportMessage('error', error?.message || t('skillSettings.import.error'));
        } finally {
            setImporting(false);
        }
    };

    const handleImport = async () => {
        const result = await window.electronAPI.system.selectFile();
        handleImportFromPath(result);
    };

    const handleImportFolder = async () => {
        const result = await window.electronAPI.system.selectDirectory();
        handleImportFromPath(result);
    };

    const handleConflictAction = async (action: 'overwrite' | 'skip' | 'rename') => {
        if (!conflict) return;
        setImporting(true);
        try {
            const result = await window.electronAPI.tools.importSkillConfirm(
                conflict.originalPath,
                conflict.sourceTempDir,
                conflict.skillName,
                action
            );
            if (result.status === 'success' && action !== 'skip') {
                fetchSkills();
            }
        } catch (error) {
            console.error('Confirm import failed:', error);
        } finally {
            setConflict(null);
            setImporting(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        try {
            const result = await window.electronAPI.tools.deleteSkill(deleteTarget.id);
            if (result.success) {
                fetchSkills();
                showImportMessage('success', t('skillSettings.delete.success', { name: deleteTarget.name }));
            } else {
                showImportMessage('error', result.error || t('skillSettings.delete.error'));
            }
        } catch (error: any) {
            showImportMessage('error', error?.message || t('skillSettings.delete.error'));
        } finally {
            setDeleteTarget(null);
        }
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
                <span className="text-sm font-medium">{t('skillSettings.loading')}</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-white dark:bg-[#141414] overflow-hidden">
            {/* 顶部 Header */}
            <header className="relative z-50 shrink-0 bg-white dark:bg-[#141414] backdrop-blur-xl draggable">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 dark:bg-[#1e1e20] rounded-xl border border-slate-200/50 dark:border-white/5 text-slate-600 dark:text-zinc-400">
                                <Sparkles size={16} />
                            </div>
                            <div>
                                <h1 className="text-base font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                                    {t('skillSettings.title')}
                                </h1>
                                <p className="text-[11px] text-slate-400 dark:text-gray-500">
                                    {t('skillSettings.subtitle')} <span className="text-emerald-500 font-bold">{enabledCount}</span> / {skills.length}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 搜索栏 + 导入按钮 */}
                    <div className="flex items-center gap-2 max-w-xl">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" size={14} />
                            <input
                                type="text"
                                placeholder={t('skillSettings.search')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 dark:focus:border-indigo-500/30 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-gray-600"
                            />
                        </div>
                        <div className="relative" ref={importMenuRef}>
                            <button
                                onClick={() => setImportMenuOpen(!importMenuOpen)}
                                disabled={importing}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-all disabled:opacity-50 shrink-0"
                            >
                                {importing ? (
                                    <Loader2 size={12} className="animate-spin" />
                                ) : (
                                    <Download size={12} />
                                )}
                                {t('skillSettings.import.button')}
                                <ChevronDown size={10} className={clsx("transition-transform", importMenuOpen && "rotate-180")} />
                            </button>
                            {importMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-lg shadow-slate-200/50 dark:shadow-black/30 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                                    <button
                                        onClick={() => { setImportMenuOpen(false); handleImport(); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <FileArchive size={13} className="text-slate-400 dark:text-gray-500" />
                                        <span>{t('skillSettings.import.fromFile')}</span>
                                    </button>
                                    <button
                                        onClick={() => { setImportMenuOpen(false); handleImportFolder(); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <FolderOpen size={13} className="text-slate-400 dark:text-gray-500" />
                                        <span>{t('skillSettings.import.fromFolder')}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                useChatStore.getState().createSession();
                                useChatStore.getState().setSelectedSkillIds(['skill-creator']);
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-all shrink-0"
                        >
                            <Plus size={12} />
                            {t('skillSettings.createSkill', '创建技能')}
                        </button>
                    </div>
                </div>
            </header>

            {/* 导入反馈提示 */}
            {importMessage && (
                <div className={clsx(
                    "mx-4 mt-3 px-4 py-2.5 rounded-xl text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200",
                    importMessage.type === 'success'
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                        : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20"
                )}>
                    {importMessage.text}
                </div>
            )}

            {/* 技能列表 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#09090b]">
                <div className="px-4 py-4 max-w-5xl mx-auto">
                    {filteredSkills.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredSkills.map((skill) => (
                                <SkillCard
                                    key={skill.id}
                                    skill={skill}
                                    palette={getPalette(skill.id)}
                                    onToggle={handleToggle}
                                    onDelete={(s) => setDeleteTarget(s)}
                                    onClick={setDetailSkill}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                            <div className="w-14 h-14 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-4 border border-slate-200 dark:border-white/5">
                                <Box size={28} className="text-slate-300 dark:text-gray-700" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-600 dark:text-gray-300 mb-1">
                                {searchTerm ? t('skillSettings.noMatchTitle') : t('skillSettings.emptyTitle')}
                            </h3>
                            <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs text-center">
                                {searchTerm
                                    ? t('skillSettings.noMatchDesc')
                                    : t('skillSettings.emptyDesc')}
                            </p>
                        </div>
                    )}
                </div>
            </div>
            {conflict && (
                <ConflictDialog
                    skillName={conflict.skillName}
                    onAction={handleConflictAction}
                    onCancel={() => setConflict(null)}
                />
            )}
            {deleteTarget && (
                <DeleteConfirmDialog
                    skillName={deleteTarget.name}
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
            {detailSkill && (
                <SkillDetailDialog
                    skill={detailSkill}
                    onClose={() => setDetailSkill(null)}
                />
            )}
        </div>
    );
};

export default SkillSettings;
