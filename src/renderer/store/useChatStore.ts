import { create } from 'zustand'
import { ChatMessage, ChatSession } from '../../common/types/chat'

interface ActiveArtifact {
    toolName: string;
    path: string;
    content: string;
}

interface ChatState {
    sessions: Record<string, ChatSession>
    activeSessionId: string
    isSending: boolean
    activeTab: 'chat' | 'skills' | 'scheduler' | 'settings'
    pendingAttachments: string[]
    selectedSkillIds: string[] | null
    currentAgentEvent: any | null
    activeArtifact: ActiveArtifact | null

    loadHistory: () => Promise<void>
    createSession: (title?: string) => void
    switchSession: (id: string) => void
    deleteSession: (id: string) => void
    renameSession: (id: string, newTitle: string) => void

    addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
    updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void
    setSending: (sending: boolean) => void
    setAgentEvent: (event: any | null) => void
    setActiveTab: (tab: 'chat' | 'skills' | 'scheduler' | 'settings') => void
    addPendingAttachment: (path: string) => void
    removePendingAttachment: (path: string) => void
    clearPendingAttachments: () => void
    setSelectedSkillIds: (ids: string[] | null) => void
    setActiveArtifact: (artifact: ActiveArtifact | null) => void
    startNewChat: () => void
    sendMessage: (input: string, attachments: string[]) => Promise<void>
}

// Helper: initial default session
const createDefaultSession = (): ChatSession => {
    const id = crypto.randomUUID();
    return {
        id,
        title: '新任务',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
    };
}

export const useChatStore = create<ChatState>((set, get) => ({
    sessions: {},
    activeSessionId: '',
    isSending: false,
    activeTab: 'chat',
    pendingAttachments: [],
    selectedSkillIds: null,
    currentAgentEvent: null,
    activeArtifact: null,

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

                const defaultSes: ChatSession = {
                    id: newSes.id,
                    title: '新任务',
                    createdAt: newSes.createdAt,
                    updatedAt: newSes.createdAt,
                    messages: []
                };

                // 保存标题到后端
                await window.electronAPI.session.save({ id: defaultSes.id, title: defaultSes.title });

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
        try {
            const backendSes = await window.electronAPI.session.create();
            const sessionTitle = title || '新任务';

            const newSession: ChatSession = {
                id: backendSes.id,
                title: sessionTitle,
                createdAt: backendSes.createdAt,
                updatedAt: backendSes.createdAt,
                messages: []
            };

            // 保存标题到后端
            await window.electronAPI.session.save({ id: newSession.id, title: newSession.title });

            set(state => ({
                sessions: { ...state.sessions, [newSession.id]: newSession },
                activeSessionId: newSession.id,
                activeTab: 'chat'
            }));
        } catch (error) {
            console.error('Failed to create session:', error);
        }
    },

    switchSession: async (id) => {
        const { sessions } = get();
        const session = sessions[id];

        if (session) {
            set({ activeSessionId: id, activeTab: 'chat' });

            // Lazy load if messages empty or partial
            if (!session.messages || session.messages.length === 0) {
                try {
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
                } catch (error) {
                    console.error('Failed to load session history for id', id, ':', error);
                }
            }
        }
    },

    deleteSession: async (id) => {
        try {
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
        } catch (error) {
            console.error('Failed to delete session', id, ':', error);
        }
    },

    renameSession: async (id, newTitle) => {
        set(state => {
            const session = state.sessions[id];
            if (!session) return state;

            const updated = { ...session, title: newTitle };

            return {
                sessions: { ...state.sessions, [id]: updated }
            };
        });

        try {
            await window.electronAPI.session.save({ id, title: newTitle }); // Async save
        } catch (error) {
            console.error('Failed to rename session', id, ':', error);
        }
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

    setSelectedSkillIds: (ids) => set({ selectedSkillIds: ids }),
    setActiveArtifact: (artifact) => set({ activeArtifact: artifact }),

    startNewChat: () => {
        get().createSession();
    },

    sendMessage: async (input: string, attachments: string[]) => {
        const state = get();
        const { isSending, sessions, activeSessionId, addMessage, updateLastMessage, setSending, setAgentEvent, clearPendingAttachments } = state;

        if (!input.trim() || isSending) return;

        const currentSession = sessions[activeSessionId];
        if (!currentSession) return;

        let finalPrompt = input;

        // 如果有附件，在 Prompt 前面追加上下文说明
        if (attachments.length > 0) {
            const attachmentInfo = attachments.map(p => `- ${p}`).join('\n');
            finalPrompt = `[用户分享了以下文件供你参考，你可以使用工具读取其内容]:\n${attachmentInfo}\n\n${input}`;
        }

        const userInput = input;

        // 1. Add User Message
        addMessage({ role: 'user', content: userInput });

        // 2. Add Placeholder for Assistant
        setSending(true);
        addMessage({ role: 'assistant', content: '' });
        clearPendingAttachments();
        get().setActiveArtifact(null); // Clear previous artifact on new message

        // --- Throttled Stream Mechanism ---
        let streamBuffer = '';
        let isFlushingStream = false;

        const flushStream = () => {
            if (!streamBuffer) {
                isFlushingStream = false;
                return;
            }

            const chunkToFlush = streamBuffer;
            streamBuffer = '';

            get().updateLastMessage((msg) => ({
                ...msg,
                content: msg.content + chunkToFlush
            }));

            requestAnimationFrame(flushStream);
        };

        const cleanupStream = window.electronAPI.agent.onStream((chunk: string, reset?: boolean) => {
            if (reset) {
                streamBuffer = '';
                get().updateLastMessage((msg) => ({ ...msg, content: chunk }));
            } else {
                streamBuffer += chunk;
                if (!isFlushingStream) {
                    isFlushingStream = true;
                    requestAnimationFrame(flushStream);
                }
            }
        });

        // --- Throttled Step Update Mechanism ---
        let pendingSteps: any[] | null = null;
        let isFlushingSteps = false;

        // Parse partial JSON to extract path and content
        const extractPathAndContent = (jsonStr: string) => {
            let pathResult = '';
            let contentResult = '';
            try {
                const parsed = JSON.parse(jsonStr);
                pathResult = parsed.path || '';
                contentResult = parsed.content || parsed.replacement || '';
            } catch {
                const pathMatch = jsonStr.match(/"path"\s*:\s*"([^"]*)/);
                if (pathMatch) pathResult = pathMatch[1];

                const contentMatch = jsonStr.match(/"(?:content|replacement)"\s*:\s*"/);
                if (contentMatch) {
                    const startIndex = contentMatch.index! + contentMatch[0].length;
                    let extracted = jsonStr.slice(startIndex);
                    // Extract up to the last unescaped quote (or just take the rest if not closed)
                    // We'll do a simple unescape
                    extracted = extracted.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\t/g, '\t');
                    // Strip trailing quotes or brace from incomplete json string
                    extracted = extracted.replace(/(?:")?\s*}\s*$/, '');
                    if (extracted.endsWith('"')) extracted = extracted.slice(0, -1);
                    contentResult = extracted;
                }
            }
            return { path: pathResult, content: contentResult };
        };

        const flushSteps = () => {
            if (!pendingSteps) {
                isFlushingSteps = false;
                return;
            }

            const stepsToFlush = pendingSteps;
            pendingSteps = null;

            get().updateLastMessage((msg) => ({
                ...msg,
                steps: stepsToFlush
            }));

            // Check for active artifact (write, edit, read, bash)
            let latestArtifact: ActiveArtifact | null = get().activeArtifact;
            for (const step of stepsToFlush) {
                if (step.tool === 'write' || step.tool === 'edit') {
                    if (step.toolInput) {
                        const { path, content } = extractPathAndContent(step.toolInput);
                        if (path || content) {
                            latestArtifact = {
                                toolName: step.tool,
                                path: path || '...',
                                content: content
                            };
                        }
                    }
                } else if (step.tool === 'bash') {
                    let cmd = '> bash';
                    try {
                        const parsed = JSON.parse(step.toolInput || '{}');
                        if (parsed.command || parsed.cmd) cmd = '> ' + (parsed.command || parsed.cmd);
                    } catch {
                        const cmdMatch = (step.toolInput || '').match(/"(?:command|cmd)"\s*:\s*"([^"]*)/);
                        if (cmdMatch) cmd = '> ' + cmdMatch[1];
                    }

                    if (step.observation || step.streamingObservation || step.toolInput) {
                        latestArtifact = {
                            toolName: step.tool,
                            path: cmd,
                            content: step.observation || step.streamingObservation || 'Running...'
                        };
                    }
                } else if (step.tool === 'read') {
                    if (step.observation) {
                        const { path } = extractPathAndContent(step.toolInput || '{}');
                        latestArtifact = {
                            toolName: step.tool,
                            path: path || '...',
                            content: step.observation
                        };
                    }
                }
            }

            if (latestArtifact &&
                (latestArtifact.path !== get().activeArtifact?.path ||
                    latestArtifact.content !== get().activeArtifact?.content)) {
                get().setActiveArtifact(latestArtifact);
            }

            // Limit step UI updates more heavily since they're large objects
            setTimeout(() => {
                if (pendingSteps) flushSteps();
                else isFlushingSteps = false;
            }, 100);
        };

        const cleanupTrace = window.electronAPI.agent.onStepUpdate((steps: any[]) => {
            pendingSteps = steps;
            if (!isFlushingSteps) {
                isFlushingSteps = true;
                flushSteps();
            }
        });

        const cleanupError = window.electronAPI.agent.onError((err: any) => {
            get().updateLastMessage((msg) => ({
                ...msg,
                content: `Error: ${err.message || JSON.stringify(err)}`,
                isError: true
            }));
        });

        const cleanupState = window.electronAPI.agent.onStateChange((event: any) => {
            console.log('[Store] Received state change:', event.currentState, event.message);
            get().setAgentEvent(event);
        });

        try {
            // Start Agent
            const skillIds = get().selectedSkillIds;
            await window.electronAPI.agent.start({
                sessionId: activeSessionId,
                prompt: finalPrompt,
                options: skillIds !== null ? { skills: skillIds } : undefined
            });
            // Result comes via stream/events
        } catch (err: any) {
            get().updateLastMessage((msg) => ({
                ...msg,
                content: `Error: ${err.message}`,
                isError: true
            }));
        } finally {
            cleanupStream();
            cleanupTrace();
            cleanupError();
            cleanupState();
            get().setAgentEvent(null);
            get().setSending(false);
        }
    }
}))
