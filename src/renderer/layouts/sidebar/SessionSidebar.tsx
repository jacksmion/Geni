import React, { useState, useMemo } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Plus, MessageSquare, Trash2, Edit2, X, Check, Search, Calendar } from 'lucide-react';
import { clsx } from 'clsx';

export function SessionSidebar() {
    const { sessions, activeSessionId, switchSession, createSession, deleteSession, renameSession } = useChatStore();
    const { sidebarCollapsed, toggleSidebar, sidebarWidth } = useLayoutStore();
    const { isMobile } = useBreakpoint();

    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

    // Grouping helper
    const getGroupLabel = (timestamp: number) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const dateMidnight = new Date(timestamp);
        dateMidnight.setHours(0, 0, 0, 0);

        const diffDays = Math.round((now.getTime() - dateMidnight.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return '今天';
        if (diffDays === 1) return '昨天';
        if (diffDays <= 7) return '最近 7 天';
        if (diffDays <= 30) return '最近 30 天';
        return '更早以前';
    };

    // Filtered and Grouped sessions
    const groupedSessions = useMemo(() => {
        const filtered = Object.values(sessions)
            .filter(s => (s.title || '').toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => b.updatedAt - a.updatedAt);

        const groups: Record<string, typeof filtered> = {};
        filtered.forEach(session => {
            const label = getGroupLabel(session.updatedAt);
            if (!groups[label]) groups[label] = [];
            groups[label].push(session);
        });

        return groups;
    }, [sessions, searchTerm]);

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
        if (confirm('确定要删除这个会话吗？')) {
            deleteSession(id);
        }
    };

    // Custom order for groups
    const groupOrder = ['今天', '昨天', '最近 7 天', '最近 30 天', '更早以前'];

    // If mobile and not collapsed, shown as an overlay. 
    // If tablet/desktop and collapsed, width is 0.

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
                    "shrink-0 flex flex-col h-full border-r border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#18181b] transition-all duration-300 ease-in-out",
                    sidebarCollapsed ? "w-0 opacity-0 -translate-x-full" : "translate-x-0",
                    isMobile && !sidebarCollapsed && "fixed left-[50px] top-0 bottom-0 z-30 shadow-2xl",
                )}
                style={{
                    width: sidebarCollapsed ? 0 : isMobile ? 280 : sidebarWidth,
                    visibility: sidebarCollapsed ? 'hidden' : 'visible'
                }}
            >
                {/* Header: Title + Actions & Search */}
                <div className="px-4 pt-5 pb-3 space-y-4 overflow-hidden">
                    {/* Section Header */}
                    <div className="flex items-center justify-between min-w-[200px]">
                        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-zinc-600 select-none">
                            Recent Chats
                        </h2>
                        <button
                            onClick={() => createSession()}
                            className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-200/60 dark:hover:text-indigo-400 dark:hover:bg-white/5 transition-colors"
                            title="新建话题"
                        >
                            <Plus size={16} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* Search Bar - More integrated */}
                    <div className="relative group min-w-[200px]">
                        <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"
                        />
                        <input
                            type="text"
                            placeholder="搜索对话..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-8.5 pl-9 pr-3 bg-slate-200/50 hover:bg-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.06] border-transparent dark:border-transparent focus:border-indigo-500/30 focus:bg-white dark:focus:bg-white/5 rounded-lg text-xs text-slate-900 dark:text-gray-100 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-600 font-medium"
                        />
                    </div>
                </div>


                {/* List */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin overflow-x-hidden">
                    {groupOrder.map(group => {
                        const sessionsInGroup = groupedSessions[group];
                        if (!sessionsInGroup || sessionsInGroup.length === 0) return null;

                        return (
                            <div key={group} className="mb-4 min-w-[200px]">
                                <div className="px-3 mb-1.5 flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-600">
                                        {group}
                                    </span>
                                    <div className="h-[1px] flex-1 bg-slate-200/50 dark:bg-white/5" />
                                </div>

                                <div className="space-y-0.5">
                                    {sessionsInGroup.map((session) => {
                                        const isActive = session.id === activeSessionId;
                                        const isEditing = editingId === session.id;

                                        return (
                                            <div
                                                key={session.id}
                                                onClick={() => switchSession(session.id)}
                                                className={clsx(
                                                    "group relative flex items-center px-3 py-2 rounded-lg text-sm transition-all cursor-pointer border border-transparent",
                                                    isActive
                                                        ? "bg-white dark:bg-white/10 shadow-sm border-slate-200/50 dark:border-white/5 text-slate-900 dark:text-white font-medium"
                                                        : "text-slate-600 dark:text-gray-400 hover:bg-slate-200/50 dark:hover:bg-white/5"
                                                )}
                                            >
                                                <MessageSquare
                                                    size={14}
                                                    className={clsx(
                                                        "shrink-0 mr-3",
                                                        isActive ? "text-indigo-500" : "text-slate-400 dark:text-gray-600"
                                                    )}
                                                />

                                                {isEditing ? (
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
                                                    <span className="flex-1 truncate pr-6 select-none" title={session.title || '新对话'}>
                                                        {session.title || '新对话'}
                                                    </span>
                                                )}

                                                {/* Actions (Hover) */}
                                                {!isEditing && (
                                                    <div className={clsx(
                                                        "absolute right-2 flex items-center gap-1",
                                                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"
                                                    )}>
                                                        <button
                                                            onClick={(e) => handleStartEdit(e, session.id, session.title)}
                                                            className="p-1 text-slate-400 hover:text-indigo-500 rounded hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                                            title="重命名"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDelete(e, session.id)}
                                                            className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                                            title="删除"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {Object.keys(groupedSessions).length === 0 && (
                        <div className="flex flex-col items-center justify-center pt-10 text-slate-400 dark:text-zinc-600 min-w-[200px]">
                            <Search size={24} className="mb-2 opacity-20" />
                            <span className="text-xs">未找到匹配的对话</span>
                        </div>
                    )}
                </div>

                <div className="px-4 py-3 border-t border-slate-200 dark:border-white/5 text-[10px] text-center text-slate-400 dark:text-zinc-600 font-medium select-none min-w-[200px]">
                    {Object.values(sessions).length} 个活跃对话
                </div>
            </div>
        </>
    );
}

