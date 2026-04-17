import React, { useState, useMemo } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { useModalStore } from '../../store/useModalStore';
import { useStaffStore } from '../../store/useStaffStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Plus, MessageSquare, Trash2, Edit2, ListChecks, Square, Pin } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { StaffAvatar } from '../../components/StaffAvatar';

export function SessionSidebar() {
    const sessionMetas = useChatStore(s => s.sessionMetas);
    const { profiles, loadProfiles } = useStaffStore();
    const profileMap = useMemo(
        () => new Map(profiles.map(profile => [profile.id, profile])),
        [profiles]
    );

    const activeSessionId = useChatStore(s => s.activeSessionId)
    const switchSession = useChatStore(s => s.switchSession)
    const createSession = useChatStore(s => s.createSession)
    const deleteSession = useChatStore(s => s.deleteSession)
    const renameSession = useChatStore(s => s.renameSession)
    const batchDeleteSessions = useChatStore(s => s.batchDeleteSessions)
    const runningSessions = useChatStore(s => s.runningSessions)

    const sidebarCollapsed = useLayoutStore(s => s.sidebarCollapsed)
    const toggleSidebar = useLayoutStore(s => s.toggleSidebar)
    const sidebarWidth = useLayoutStore(s => s.sidebarWidth)
    const { isMobile } = useBreakpoint();

    const [searchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [now, setNow] = useState(0);

    // Batch selection state
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const { t } = useTranslation();

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
                    "shrink-0 flex flex-col h-full bg-[#F5F5F7] dark:bg-transparent backdrop-blur-xl border-r border-[#EDEDF0] dark:border-white/[0.03] transition-all duration-300 ease-in-out",
                    sidebarCollapsed ? "w-0 opacity-0 -translate-x-full" : "translate-x-0",
                    isMobile && !sidebarCollapsed && "fixed left-[50px] top-0 bottom-0 z-30 shadow-2xl",
                )}
                style={{
                    width: sidebarCollapsed ? 0 : isMobile ? 280 : sidebarWidth,
                    visibility: sidebarCollapsed ? 'hidden' : 'visible'
                }}
            >
                {/* Header: Title + Actions — 与 ChatLayout header 对齐 (h-11) */}
                <div className="h-11 flex items-center justify-between px-4 shrink-0 pt-2 overflow-hidden min-w-[200px]">
                    <h2 className="text-xs font-semibold text-slate-600 dark:text-zinc-500 select-none">
                        {t('sessionSidebar.title')}
                    </h2>
                    <div className="flex items-center gap-1">
                        {sessionMetas.length > 0 && (
                            <button
                                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                                className={clsx(
                                    "p-1.5 rounded-lg transition-colors",
                                    selectMode
                                        ? "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/10"
                                        : "text-slate-400 hover:text-indigo-600 hover:bg-white/60 dark:hover:text-indigo-400 dark:hover:bg-white/5"
                                )}
                                title={t('sessionSidebar.actions.manage')}
                            >
                                <ListChecks size={14} />
                            </button>
                        )}
                        <button
                            onClick={() => createSession()}
                            className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white/60 dark:hover:text-indigo-400 dark:hover:bg-white/5 transition-colors"
                            title={t('sessionSidebar.actions.new')}
                        >
                            <Plus size={16} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>


                {/* List */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin overflow-x-hidden">
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
                                        "group relative flex items-center px-3 py-2.5 rounded-lg text-sm transition-all",
                                        selectMode && !isRunning ? "cursor-pointer" : selectMode ? "cursor-not-allowed" : "cursor-pointer",
                                        isSelected
                                            ? "bg-indigo-50 dark:bg-indigo-500/10"
                                            : isActive && !selectMode
                                                ? "bg-white/70 dark:bg-indigo-500/10 text-slate-900 dark:text-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                                                : "text-slate-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-white/5"
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
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-indigo-500 rounded-r-full" />
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
                                                            className="flex-1 min-w-0 bg-transparent border-b border-indigo-500 outline-none text-xs py-0.5"
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
                                                            <span className={clsx("truncate select-none text-[13px]", isRunning && selectMode && "opacity-40")} title={session.title || t('sessionSidebar.defaultTitle')}>
                                                                {session.title || t('sessionSidebar.defaultTitle')}
                                                            </span>
                                                        </div>
                                                        {/* Time - visible by default, hidden on hover */}
                                                        <span className={clsx(
                                                            "text-[10px] shrink-0 tabular-nums group-hover:hidden transition-opacity",
                                                            isActive && !selectMode ? "text-indigo-400/70 dark:text-indigo-400/50" : "text-slate-300 dark:text-zinc-600"
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
                                                                    ? "text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                                                                    : "text-slate-400 hover:text-indigo-500 hover:bg-white/60 dark:hover:bg-white/10"
                                                            )}
                                                            title={session.pinned ? t('sessionSidebar.actions.unpin') : t('sessionSidebar.actions.pin')}
                                                        >
                                                            <Pin size={12} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleStartEdit(e, session.id, session.title)}
                                                            className="p-1 text-slate-400 hover:text-indigo-500 rounded hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
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

                    {filteredSessions.length === 0 && (
                        <div className="flex flex-col items-center justify-center pt-10 text-slate-400 dark:text-zinc-600 min-w-[200px]">
                            <span className="text-xs">{t('sessionSidebar.noMatch')}</span>
                        </div>
                    )}
                </div>

                {/* Bottom bar: batch actions or session count */}
                {selectMode ? (
                    <div className="px-3 py-2.5 border-t border-[#EDEDF0] dark:border-white/[0.02] flex items-center justify-between min-w-[200px]">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSelectAll}
                                className="text-[11px] text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium transition-colors"
                            >
                                {selectedIds.size === allVisibleIds.length && allVisibleIds.length > 0 ? t('sessionSidebar.batch.deselectAll') : t('sessionSidebar.batch.selectAll')}
                            </button>
                            <span className="text-[10px] text-slate-300 dark:text-zinc-600">
                                {t('sessionSidebar.batch.selected', { count: selectedIds.size })}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={exitSelectMode}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/5 transition-colors"
                            >
                                {t('sessionSidebar.batch.cancel')}
                            </button>
                            <button
                                onClick={handleBatchDelete}
                                disabled={selectedIds.size === 0}
                                className={clsx(
                                    "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                                    selectedIds.size > 0
                                        ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                                        : "text-slate-300 dark:text-zinc-700 cursor-not-allowed"
                                )}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="px-4 py-3 border-t border-[#EDEDF0] dark:border-white/[0.02] text-[10px] text-center text-slate-400 dark:text-zinc-600 font-medium select-none min-w-[200px]">
                        {t('sessionSidebar.activeSessions', { count: sessionMetas.length })}
                    </div>
                )}
            </div>
        </>
    );
}
