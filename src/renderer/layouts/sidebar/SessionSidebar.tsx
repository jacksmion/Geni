import React, { useState } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { Plus, MessageSquare, Trash2, Edit2, X, Check, MoreHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { useSettingsStore } from '../../store/useSettingsStore';

export function SessionSidebar() {
    const { sessions, activeSessionId, switchSession, createSession, deleteSession, renameSession } = useChatStore();
    const sortedSessions = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);

    // Rename state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

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

    return (
        <div className="w-64 shrink-0 flex flex-col h-full border-r border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#18181b]">
            {/* Header */}
            <div className="p-4">
                <button
                    onClick={() => createSession()}
                    className="w-full h-10 flex items-center gap-2 px-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-medium text-slate-700 dark:text-gray-200 hover:border-indigo-500/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group shadow-sm"
                >
                    <Plus size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    <span>新建话题</span>
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
                {sortedSessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const isEditing = editingId === session.id;

                    return (
                        <div
                            key={session.id}
                            onClick={() => switchSession(session.id)}
                            className={clsx(
                                "group relative flex items-center px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer border border-transparent",
                                isActive
                                    ? "bg-white dark:bg-white/10 shadow-sm border-slate-200 dark:border-white/5 text-slate-900 dark:text-white font-medium"
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
                                <span className="flex-1 truncate pr-6 select-none" title={session.title}>
                                    {session.title}
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
                                        className="p-1 text-slate-400 hover:text-indigo-500 rounded hover:bg-slate-100 dark:hover:bg-white/10"
                                        title="重命名"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(e, session.id)}
                                        className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-500/10"
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

            <div className="p-4 text-xs text-center text-slate-300 dark:text-zinc-700 font-mono select-none">
                {sortedSessions.length} active sessions
            </div>
        </div>
    );
}
