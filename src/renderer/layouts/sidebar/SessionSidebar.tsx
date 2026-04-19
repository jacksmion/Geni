import React, { useState, useMemo } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { useModalStore } from '../../store/useModalStore';
import { useStaffStore } from '../../store/useStaffStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { ArrowLeft, Plus, MessageSquare, Trash2, Edit2, ListChecks, Square, Pin, Search, Sparkles, Clock3, Settings, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { StaffAvatar } from '../../components/StaffAvatar';
import { SETTINGS_SECTIONS } from '../../pages/settings/settingsSections';

export function SessionSidebar() {
    const sessionMetas = useChatStore(s => s.sessionMetas);
    const { profiles, loadProfiles } = useStaffStore();
    const profileMap = useMemo(
        () => new Map(profiles.map(profile => [profile.id, profile])),
        [profiles]
    );

    const activeSessionId = useChatStore(s => s.activeSessionId)
    const activeTab = useChatStore(s => s.activeTab)
    const setActiveTab = useChatStore(s => s.setActiveTab)
    const switchSession = useChatStore(s => s.switchSession)
    const createSession = useChatStore(s => s.createSession)
    const deleteSession = useChatStore(s => s.deleteSession)
    const renameSession = useChatStore(s => s.renameSession)
    const batchDeleteSessions = useChatStore(s => s.batchDeleteSessions)
    const runningSessions = useChatStore(s => s.runningSessions)

    const sidebarCollapsed = useLayoutStore(s => s.sidebarCollapsed)
    const toggleSidebar = useLayoutStore(s => s.toggleSidebar)
    const sidebarWidth = useLayoutStore(s => s.sidebarWidth)
    const setSidebarWidth = useLayoutStore(s => s.setSidebarWidth)
    const setPaletteOpen = useLayoutStore(s => s.setPaletteOpen)
    const activeSettingsSection = useLayoutStore(s => s.activeSettingsSection)
    const setActiveSettingsSection = useLayoutStore(s => s.setActiveSettingsSection)
    const { isMobile } = useBreakpoint();
    const isResizing = React.useRef(false);

    const [searchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [now, setNow] = useState(0);

    // Batch selection state
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const { t } = useTranslation();
    const isSettingsTab = activeTab === 'settings';

    React.useEffect(() => {
        if (profiles.length === 0) loadProfiles()
    }, [profiles.length, loadProfiles])

    // Update current time every minute for relative labels
    React.useEffect(() => {
        setNow(Date.now());
        const interval = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Relative time for session items
    const getRelativeTime = React.useCallback((timestamp: number) => {
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return t('sessionSidebar.relativeTime.justNow');
        if (minutes < 60) return t('sessionSidebar.relativeTime.minutesAgo', { count: minutes });
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return t('sessionSidebar.relativeTime.hoursAgo', { count: hours });
        const d = new Date(timestamp);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }, [now, t]);

    // Filtered sessions (flat list, sorted)
    const filteredSessions = useMemo(() => {
        const normalizedSearch = searchTerm.toLowerCase();
        return sessionMetas
            .filter(s => (s.title || '').toLowerCase().includes(normalizedSearch))
            .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
    }, [searchTerm, sessionMetas]);

    // All visible session IDs (for select all)
    const allVisibleIds = useMemo(() => {
        return filteredSessions
            .filter(s => !runningSessions.has(s.id))
            .map(s => s.id);
    }, [filteredSessions, runningSessions]);

    const handleStartEdit = (e: React.MouseEvent, id: string, currentTitle: string) => {
        e.stopPropagation();
        setEditingId(id);
        setEditTitle(currentTitle);
    };

    const handleSaveEdit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (editingId && editTitle.trim()) {
            renameSession(editingId, editTitle.trim());
        }
        setEditingId(null);
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        useModalStore.getState().showConfirm({
            message: t('sessionSidebar.confirmDelete'),
            onConfirm: () => deleteSession(id),
        });
    };

    const handleTogglePin = (e: React.MouseEvent, id: string, currentPinned: boolean) => {
        e.stopPropagation();
        window.electronAPI.session.save({ id, pinned: !currentPinned });
        // Optimistically update local state
        const metas = useChatStore.getState().sessionMetas.map(m =>
            m.id === id ? { ...m, pinned: !currentPinned } : m
        );
        useChatStore.setState({ sessionMetas: metas });
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedIds.size === allVisibleIds.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(allVisibleIds));
        }
    };

    const exitSelectMode = () => {
        setSelectMode(false);
        setSelectedIds(new Set());
    };

    const handleBatchDelete = () => {
        if (selectedIds.size === 0) return;
        useModalStore.getState().showConfirm({
            message: t('sessionSidebar.confirmBatchDelete', { count: selectedIds.size }),
            onConfirm: async () => {
                await batchDeleteSessions([...selectedIds]);
                exitSelectMode();
            },
        });
    };

    const startResizing = React.useCallback((e: React.MouseEvent) => {
        if (isMobile || sidebarCollapsed) return;

        isResizing.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';

        const initialX = e.clientX;
        const initialWidth = Math.max(sidebarWidth, 252);

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isResizing.current) return;
            const deltaX = moveEvent.clientX - initialX;
            const nextWidth = Math.max(220, Math.min(420, initialWidth + deltaX));
            setSidebarWidth(nextWidth);
        };

        const onMouseUp = () => {
            isResizing.current = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [isMobile, setSidebarWidth, sidebarCollapsed, sidebarWidth]);

    return (
        <>
            {/* Mobile Backdrop */}
            {isMobile && !sidebarCollapsed && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[25] transition-opacity duration-300"
                    onClick={toggleSidebar}
                />
            )}

            <div
                className={clsx(
                    "shrink-0 flex flex-col h-full glass-sidebar-strong glass-noise border-r transition-all duration-300 ease-in-out relative overflow-hidden",
                    sidebarCollapsed ? "w-0 opacity-0 -translate-x-full" : "translate-x-0",
                    isMobile && !sidebarCollapsed && "fixed left-0 top-0 bottom-0 z-30 shadow-2xl",
                )}
                style={{
                    width: sidebarCollapsed ? 0 : isMobile ? 264 : Math.max(sidebarWidth, 252),
                    visibility: sidebarCollapsed ? 'hidden' : 'visible'
                }}
            >
                {!isMobile && !sidebarCollapsed && (
                    <div
                        onMouseDown={startResizing}
                        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize z-20 group"
                    >
                        <div className="absolute inset-y-0 right-0 w-px bg-transparent group-hover:bg-slate-300 dark:group-hover:bg-white/[0.16] transition-colors" />
                    </div>
                )}

                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_68%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_68%)]" />

                <div className="flex flex-col gap-0 px-3 pt-2.5 pb-2 shrink-0">
                    {isSettingsTab ? (
                        <ActionRow
                            icon={ArrowLeft}
                            label="返回"
                            active={false}
                            onClick={() => setActiveTab('chat')}
                        />
                    ) : (
                        <>
                            <ActionRow
                                icon={Plus}
                                label="新建任务"
                                active={false}
                                onClick={() => createSession()}
                            />
                            <ActionRow
                                icon={Search}
                                label={t('sidebar.search', { defaultValue: '搜索' })}
                                active={false}
                                onClick={() => setPaletteOpen(true)}
                            />
                            <ActionRow
                                icon={Sparkles}
                                label={t('sidebar.skills')}
                                active={activeTab === 'skills'}
                                onClick={() => setActiveTab('skills')}
                            />
                            <ActionRow
                                icon={Clock3}
                                label="自动化"
                                active={activeTab === 'scheduler'}
                                onClick={() => setActiveTab('scheduler')}
                            />
                            <ActionRow
                                icon={Users}
                                label={t('sidebar.staff')}
                                active={activeTab === 'staff'}
                                onClick={() => setActiveTab('staff')}
                            />
                        </>
                    )}
                </div>

                <div className={clsx("px-4 pb-2 shrink-0", isSettingsTab ? "pt-1" : "pt-2.5")}>
                    <div className="flex items-center justify-between">
                        <div className="ui-text-label font-medium text-slate-400 dark:text-zinc-500 select-none">
                            {isSettingsTab ? '' : '任务'}
                        </div>
                        <div className="flex items-center gap-1">
                            {!isSettingsTab && sessionMetas.length > 0 && (
                                <button
                                    onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                                    className={clsx(
                                        "p-1.5 rounded-md transition-colors",
                                        selectMode
                                            ? "text-indigo-600 bg-white/42 border border-white/55 dark:text-indigo-400 dark:bg-white/[0.06] dark:border-white/8"
                                            : "text-slate-500 hover:text-slate-700 hover:bg-white/40 hover:border-white/44 border border-transparent dark:hover:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:border-white/[0.08]"
                                    )}
                                    title={t('sessionSidebar.actions.manage')}
                                >
                                    <ListChecks size={14} />
                                </button>
                            )}
                            {!isSettingsTab && (
                                <button
                                    onClick={() => createSession()}
                                    className="p-1.5 -mr-1 rounded-md text-slate-500 hover:text-slate-700 hover:bg-white/40 hover:border-white/44 border border-transparent dark:hover:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:border-white/[0.08] transition-colors"
                                    title="新建任务"
                                >
                                    <Plus size={16} strokeWidth={2.5} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 glass-scroll overflow-x-hidden">
                    {isSettingsTab ? (
                        <div className="space-y-1 px-1">
                            {SETTINGS_SECTIONS.map((section) => (
                                <ActionRow
                                    key={section.id}
                                    icon={section.icon}
                                    label={t(section.labelKey)}
                                    active={activeSettingsSection === section.id}
                                    onClick={() => setActiveSettingsSection(section.id)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {filteredSessions.map((session) => {
                            const isActive = session.id === activeSessionId;
                            const isEditing = editingId === session.id;
                            const isRunning = runningSessions.has(session.id);
                            const isSelected = selectedIds.has(session.id);

                            return (
                                <div
                                    key={session.id}
                                    onClick={() => {
                                        if (selectMode) {
                                            if (!isRunning) toggleSelect(session.id);
                                        } else {
                                            switchSession(session.id);
                                        }
                                    }}
                                    className={clsx(
                                        "group relative flex items-center px-3 py-1.5 rounded-xl text-sm transition-all",
                                        selectMode && !isRunning ? "cursor-pointer" : selectMode ? "cursor-not-allowed" : "cursor-pointer",
                                        isSelected
                                            ? "border border-white/55 bg-white/50 shadow-[0_10px_24px_rgba(90,105,120,0.12)] dark:border-white/8 dark:bg-white/[0.07] dark:shadow-[0_10px_28px_rgba(0,0,0,0.2)]"
                                            : isActive && !selectMode
                                                ? "border border-white/58 bg-white/58 text-slate-900 shadow-[0_12px_26px_rgba(90,105,120,0.13)] dark:border-white/8 dark:bg-white/[0.08] dark:text-white dark:shadow-[0_10px_26px_rgba(0,0,0,0.22)] font-medium glass-active-item"
                                                : "border border-transparent text-slate-600 dark:text-gray-400 hover:border-white/40 hover:bg-white/38 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.07]"
                                    )}
                                >
                                    {/* Checkbox in select mode */}
                                    {selectMode && (
                                        <span className="shrink-0 mr-2.5 flex items-center justify-center">
                                            {isRunning ? (
                                                <Square size={14} className="text-slate-200 dark:text-zinc-700" />
                                            ) : isSelected ? (
                                                <ListChecks size={14} className="text-indigo-500" />
                                            ) : (
                                                <Square size={14} className="text-slate-300 dark:text-zinc-600" />
                                            )}
                                        </span>
                                    )}

                                    {/* Active accent bar */}
                                    {isActive && !selectMode && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-slate-300 dark:bg-zinc-500 rounded-r-full" />
                                    )}

                                                {(() => {
                                                    const staff = session.staffId ? profileMap.get(session.staffId) : undefined;
                                                    return staff ? (
                                                        <span className="shrink-0 mr-2.5 flex items-center justify-center w-[14px]">
                                                            <StaffAvatar
                                                                avatar={staff.avatar}
                                                                name={staff.name}
                                                                size={14}
                                                                className={clsx(
                                                                    "leading-none",
                                                                    isActive && !selectMode ? "opacity-100" : "opacity-60"
                                                                )}
                                                                iconClassName={clsx(
                                                                    isActive && !selectMode ? "text-indigo-500" : "text-slate-400 dark:text-zinc-600"
                                                                )}
                                                            />
                                                        </span>
                                                    ) : (
                                                        <MessageSquare
                                                            size={14}
                                                            className={clsx(
                                                                "shrink-0 mr-2.5",
                                                                isActive && !selectMode ? "text-indigo-500" : "text-slate-400 dark:text-zinc-600"
                                                            )}
                                                        />
                                                    );
                                                })()}

                                                {isEditing && !selectMode ? (
                                                    <form onSubmit={handleSaveEdit} className="flex-1 flex items-center gap-1 min-w-0">
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            value={editTitle}
                                                            onChange={(e) => setEditTitle(e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onBlur={() => handleSaveEdit()}
                                                            className="ui-text-meta flex-1 min-w-0 bg-transparent border-b border-indigo-500 outline-none py-0.5"
                                                        />
                                                    </form>
                                                ) : (
                                                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            {isRunning && (
                                                                <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                            )}
                                                            {session.pinned && (
                                                                <Pin size={10} className="shrink-0 text-indigo-400 dark:text-indigo-500 rotate-45" />
                                                            )}
                                                            <span className={clsx("ui-text-meta truncate select-none", isRunning && selectMode && "opacity-40")} title={session.title || t('sessionSidebar.defaultTitle')}>
                                                                {session.title || t('sessionSidebar.defaultTitle')}
                                                            </span>
                                                        </div>
                                                        {/* Time - visible by default, hidden on hover */}
                                                        <span className={clsx(
                                                            "ui-text-caption shrink-0 tabular-nums group-hover:hidden transition-opacity",
                                                            isActive && !selectMode ? "text-slate-400 dark:text-zinc-500" : "text-slate-300 dark:text-zinc-600"
                                                        )}>
                                                            {getRelativeTime(session.updatedAt)}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Actions (Hover) - hidden in select mode */}
                                                {!isEditing && !selectMode && (
                                                    <div className="absolute right-2 hidden group-hover:flex items-center gap-0.5">
                                                        <button
                                                            onClick={(e) => handleTogglePin(e, session.id, !!session.pinned)}
                                                            className={clsx(
                                                                "p-1 rounded transition-colors",
                                                                session.pinned
                                                                    ? "text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/5"
                                                                    : "text-slate-400 hover:text-slate-600 hover:bg-white/60 dark:hover:text-zinc-300 dark:hover:bg-white/10"
                                                            )}
                                                            title={session.pinned ? t('sessionSidebar.actions.unpin') : t('sessionSidebar.actions.pin')}
                                                        >
                                                            <Pin size={12} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleStartEdit(e, session.id, session.title || t('sessionSidebar.defaultTitle'))}
                                                            className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-white/60 dark:hover:text-zinc-300 dark:hover:bg-white/10 transition-colors"
                                                            title={t('sessionSidebar.actions.rename')}
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDelete(e, session.id)}
                                                            className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                                            title={t('sessionSidebar.actions.delete')}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                    )}

                    {!isSettingsTab && filteredSessions.length === 0 && (
                        <div className="flex flex-col items-center justify-center pt-10 text-slate-400 dark:text-zinc-600 min-w-[200px]">
                            <span className="ui-text-meta">{t('sessionSidebar.noMatch')}</span>
                        </div>
                    )}
                </div>

                {/* Bottom bar: batch actions or session count */}
                {!isSettingsTab && selectMode ? (
                    <div className="px-3 py-2.5 border-t border-white/40 dark:border-white/[0.05] flex items-center justify-between min-w-[200px] bg-white/12 dark:bg-white/[0.012]">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSelectAll}
                                className="ui-text-meta text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium transition-colors"
                            >
                                {selectedIds.size === allVisibleIds.length && allVisibleIds.length > 0 ? t('sessionSidebar.batch.deselectAll') : t('sessionSidebar.batch.selectAll')}
                            </button>
                            <span className="ui-text-caption text-slate-300 dark:text-zinc-600">
                                {t('sessionSidebar.batch.selected', { count: selectedIds.size })}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={exitSelectMode}
                                className="ui-text-meta px-2.5 py-1 rounded-lg font-medium text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/5 transition-colors"
                            >
                                {t('sessionSidebar.batch.cancel')}
                            </button>
                            <button
                                onClick={handleBatchDelete}
                                disabled={selectedIds.size === 0}
                                className={clsx(
                                    "ui-text-meta px-2.5 py-1 rounded-lg font-medium transition-colors",
                                    selectedIds.size > 0
                                        ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                                        : "text-slate-300 dark:text-zinc-700 cursor-not-allowed"
                                )}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    </div>
                ) : !isSettingsTab ? (
                    <div className="mt-auto px-3 pb-2 pt-1.5 min-w-[200px]">
                        <ActionRow
                            icon={Settings}
                            label={t('sidebar.settings')}
                            active={false}
                            compact
                            onClick={() => setActiveTab('settings')}
                        />
                    </div>
                ) : null
                }
            </div>
        </>
    );
}

function ActionRow({
    icon: Icon,
    label,
    active,
    compact = false,
    onClick
}: {
    icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
    label: string;
    active: boolean;
    compact?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "ui-text-label flex w-full items-center rounded-xl transition-all text-left",
                compact ? "gap-2.5 px-3 py-1" : "gap-3 px-3 py-1.5",
                active
                    ? "border border-white/58 bg-white/54 text-slate-900 shadow-[0_10px_22px_rgba(90,105,120,0.12)] dark:border-white/8 dark:bg-white/[0.07] dark:text-white dark:shadow-[0_10px_28px_rgba(0,0,0,0.2)]"
                    : "border border-transparent text-slate-600 hover:border-white/44 hover:bg-white/40 hover:text-slate-900 dark:text-zinc-400 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.06] dark:hover:text-zinc-100"
            )}
        >
            <Icon size={compact ? 15 : 16} strokeWidth={1.8} className={active ? "text-slate-700 dark:text-zinc-200" : "text-slate-400 dark:text-zinc-500"} />
            <span className="font-normal">{label}</span>
        </button>
    );
}
