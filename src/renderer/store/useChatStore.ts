import { create } from 'zustand'
import { ChatMessage, ChatSession } from '../../common/types/chat'

interface ChatState {
    sessions: Record<string, ChatSession>
    activeSessionId: string
    isSending: boolean
    activeTab: 'chat' | 'skills' | 'settings'
    pendingAttachments: string[]

    loadHistory: () => Promise<void>
    createSession: (title?: string) => void
    switchSession: (id: string) => void
    deleteSession: (id: string) => void
    renameSession: (id: string, newTitle: string) => void

    addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
    updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void
    setSending: (sending: boolean) => void
    setActiveTab: (tab: 'chat' | 'skills' | 'settings') => void
    addPendingAttachment: (path: string) => void
    removePendingAttachment: (path: string) => void
    clearPendingAttachments: () => void
    startNewChat: () => void
}

// Helper: initial default session
const createDefaultSession = (): ChatSession => {
    const id = crypto.randomUUID();
    return {
        id,
        title: '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [{
            id: 'init-1',
            role: 'assistant',
            content: '你好！我是基于 Tool-Use 架构的新一代智能代理。\n我现在支持更复杂的任务拆解及工具调用。',
            timestamp: Date.now()
        }]
    };
}

export const useChatStore = create<ChatState>((set, get) => ({
    sessions: {},
    activeSessionId: '',
    isSending: false,
    activeTab: 'chat',
    pendingAttachments: [],

    loadHistory: async () => {
        try {
            // Load list (metadata only)
            const list = await window.electronAPI.getSessionList();

            // Convert to Record
            const sessions: Record<string, ChatSession> = {};
            list.forEach((meta: any) => {
                // Ensure messages is initialized (even if empty) to satisfy type
                sessions[meta.id] = { ...meta, messages: [] };
            });

            if (list.length > 0) {
                const activeId = list[0].id; // Most recent due to sort in backend
                set({ sessions, activeSessionId: activeId });

                // Lazy load active session messages
                const messages = await window.electronAPI.getSessionMessages(activeId);
                set(state => ({
                    sessions: {
                        ...state.sessions,
                        [activeId]: { ...state.sessions[activeId], messages }
                    }
                }));
            } else {
                // Init default if empty
                const defaultSes = createDefaultSession();
                await window.electronAPI.saveSession(defaultSes);
                set({
                    sessions: { [defaultSes.id]: defaultSes },
                    activeSessionId: defaultSes.id
                });
            }
        } catch (e) {
            console.error('Failed to load history', e);
        }
    },

    createSession: async (title) => {
        const newSession = createDefaultSession();
        if (title) newSession.title = title;

        // Save to backend
        await window.electronAPI.saveSession(newSession);

        set(state => ({
            sessions: { ...state.sessions, [newSession.id]: newSession },
            activeSessionId: newSession.id,
            activeTab: 'chat'
        }));
    },

    switchSession: async (id) => {
        const { sessions } = get();
        const session = sessions[id];

        if (session) {
            set({ activeSessionId: id, activeTab: 'chat' });

            // Lazy load if messages empty
            if (!session.messages || session.messages.length === 0) {
                const messages = await window.electronAPI.getSessionMessages(id);
                if (messages && messages.length > 0) {
                    set(state => ({
                        sessions: {
                            ...state.sessions,
                            [id]: { ...state.sessions[id], messages }
                        }
                    }));
                }
            }
        }
    },

    deleteSession: async (id) => {
        await window.electronAPI.deleteSession(id);

        set(state => {
            const { [id]: deleted, ...rest } = state.sessions;

            let nextActiveId = state.activeSessionId;
            if (id === state.activeSessionId) {
                const remainingIds = Object.keys(rest);
                if (remainingIds.length > 0) {
                    nextActiveId = Object.values(rest).sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
                    // Trigger load for next session
                    get().switchSession(nextActiveId);
                } else {
                    const newSes = createDefaultSession();
                    window.electronAPI.saveSession(newSes);
                    rest[newSes.id] = newSes;
                    nextActiveId = newSes.id;
                }
            }
            return { sessions: rest, activeSessionId: nextActiveId };
        });
    },

    renameSession: (id, newTitle) => {
        set(state => {
            const session = state.sessions[id];
            if (!session) return state;

            const updated = { ...session, title: newTitle };
            window.electronAPI.saveSession(updated); // Async save

            return {
                sessions: { ...state.sessions, [id]: updated }
            };
        });
    },

    addMessage: (msg) => {
        set(state => {
            const session = state.sessions[state.activeSessionId];
            if (!session) return state;

            const newMsg: ChatMessage = {
                ...msg,
                id: crypto.randomUUID(),
                timestamp: Date.now()
            };

            const updatedSession = {
                ...session,
                messages: [...session.messages, newMsg],
                updatedAt: Date.now()
            };

            // Auto-title logic for first user message
            if (session.messages.length <= 1 && msg.role === 'user') {
                const potentialTitle = msg.content.trim().slice(0, 20);
                if (potentialTitle) {
                    updatedSession.title = potentialTitle;
                }
            }

            window.electronAPI.saveSession(updatedSession); // Save single session

            return {
                sessions: { ...state.sessions, [state.activeSessionId]: updatedSession }
            };
        });
    },

    updateLastMessage: (updater) => {
        set(state => {
            const session = state.sessions[state.activeSessionId];
            if (!session || session.messages.length === 0) return state;

            const msgs = [...session.messages];
            const lastIdx = msgs.length - 1;
            msgs[lastIdx] = updater(msgs[lastIdx]);

            const updatedSession = { ...session, messages: msgs, updatedAt: Date.now() };

            window.electronAPI.saveSession(updatedSession);

            return {
                sessions: { ...state.sessions, [state.activeSessionId]: updatedSession }
            };
        });
    },

    setSending: (isSending) => set({ isSending }),
    setActiveTab: (activeTab) => set({ activeTab }),

    addPendingAttachment: (path) => set((state) => ({
        pendingAttachments: state.pendingAttachments.includes(path)
            ? state.pendingAttachments
            : [...state.pendingAttachments, path]
    })),

    removePendingAttachment: (path) => set((state) => ({
        pendingAttachments: state.pendingAttachments.filter(p => p !== path)
    })),

    clearPendingAttachments: () => set({ pendingAttachments: [] }),

    startNewChat: () => {
        get().createSession();
    }
}))
