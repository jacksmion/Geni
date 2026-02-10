import { create } from 'zustand'
import { ChatMessage, ChatSession } from '../../common/types/chat'

interface ChatState {
    sessions: Record<string, ChatSession>
    activeSessionId: string
    isSending: boolean
    activeTab: 'chat' | 'skills' | 'settings'
    pendingAttachments: string[]
    currentAgentEvent: any | null

    loadHistory: () => Promise<void>
    createSession: (title?: string) => void
    switchSession: (id: string) => void
    deleteSession: (id: string) => void
    renameSession: (id: string, newTitle: string) => void

    addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
    updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void
    setSending: (sending: boolean) => void
    setAgentEvent: (event: any | null) => void
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
            content: '你好！我是 Geni，你的个人智能助手。\n专注于创作、办公与代码，随时准备为你提供全方位的支持。',
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
    currentAgentEvent: null,

    loadHistory: async () => {
        try {
            // Load list (metadata only)
            const list = await window.electronAPI.session.list();

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
                const messages = await window.electronAPI.session.getHistory(activeId);
                set(state => ({
                    sessions: {
                        ...state.sessions,
                        [activeId]: { ...state.sessions[activeId], messages }
                    }
                }));
            } else {
                // Init default if empty
                // Create via backend
                const newSes = await window.electronAPI.session.create();

                const welcomeMessage = {
                    id: 'init-1',
                    role: 'assistant' as const,
                    content: '你好！我是 Geni，你的个人智能助手。\n专注于创作、办公与代码，随时准备为你提供全方位的支持。',
                    timestamp: Date.now()
                };

                const defaultSes: ChatSession = {
                    id: newSes.id,
                    title: '新对话',
                    createdAt: newSes.createdAt,
                    updatedAt: newSes.createdAt,
                    messages: [welcomeMessage]
                };

                // 保存标题和欢迎消息到后端
                await window.electronAPI.session.save({ id: defaultSes.id, title: defaultSes.title });
                await window.electronAPI.session.addMessage(defaultSes.id, welcomeMessage);

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
        const backendSes = await window.electronAPI.session.create();
        const sessionTitle = title || '新对话';

        const welcomeMessage = {
            id: 'init-' + backendSes.id,
            role: 'assistant' as const,
            content: '你好！我是 Geni，你的个人智能助手。',
            timestamp: Date.now()
        };

        const newSession: ChatSession = {
            id: backendSes.id,
            title: sessionTitle,
            createdAt: backendSes.createdAt,
            updatedAt: backendSes.createdAt,
            messages: [welcomeMessage]
        };

        // 保存标题和欢迎消息到后端
        await window.electronAPI.session.save({ id: newSession.id, title: newSession.title });
        await window.electronAPI.session.addMessage(newSession.id, welcomeMessage);

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

            // Lazy load if messages empty or partial
            if (!session.messages || session.messages.length === 0) {
                const messages = await window.electronAPI.session.getHistory(id);
                // If backend has messages, use them
                if (messages) {
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
        await window.electronAPI.session.delete(id);

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
                    // Create new locally to avoid async recursion issues if possible, or just call create
                    // Since create is async, we can't easily do it inside reducer seamlessly.
                    // We'll set activeId to empty and let UI handle or trigger creation.
                    // Or cheat:
                    setTimeout(() => get().createSession(), 0);
                    nextActiveId = '';
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
            window.electronAPI.session.save({ id, title: newTitle }); // Async save

            return {
                sessions: { ...state.sessions, [id]: updated }
            };
        });
    },

    addMessage: (msg) => {
        const state = get();
        const session = state.sessions[state.activeSessionId];
        if (!session) return;

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
        if (session.messages.length <= 1 && msg.role === 'user' && msg.content) {
            const potentialTitle = msg.content.trim().slice(0, 20);
            if (potentialTitle) {
                updatedSession.title = potentialTitle;
                window.electronAPI.session.save({ id: session.id, title: potentialTitle });
            }
        }

        // 立即更新本地状态
        set({
            sessions: { ...state.sessions, [state.activeSessionId]: updatedSession }
        });

        // 用户消息立即保存到后端持久化（不等待 Agent 执行）
        if (msg.role === 'user') {
            window.electronAPI.session.addMessage(session.id, newMsg);
        }
    },

    updateLastMessage: (updater) => {
        set(state => {
            const session = state.sessions[state.activeSessionId];
            if (!session || session.messages.length === 0) return state;

            const msgs = [...session.messages];
            const lastIdx = msgs.length - 1;
            msgs[lastIdx] = updater(msgs[lastIdx]);

            const updatedSession = { ...session, messages: msgs, updatedAt: Date.now() };

            // No save needed to backend for streaming updates

            return {
                sessions: { ...state.sessions, [state.activeSessionId]: updatedSession }
            };
        });
    },

    setSending: (isSending) => set({ isSending }),
    setAgentEvent: (currentAgentEvent) => set({ currentAgentEvent }),
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
