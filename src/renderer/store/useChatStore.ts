import { create } from 'zustand'
import { ChatMessage, ChatSession } from '../../common/types/chat'
import { extractPathAndContent } from '../utils/artifact'
import { useSettingsStore } from './useSettingsStore'

interface ActiveArtifact {
    toolName: string;
    path: string;
    content: string;
}

interface ChatState {
    sessions: Record<string, ChatSession>
    sessionMetas: { id: string, title?: string, updatedAt: number, staffId?: string }[]
    activeSessionId: string
    isSending: boolean
    activeTab: 'chat' | 'skills' | 'staff' | 'scheduler' | 'settings'
    pendingAttachments: string[]
    selectedSkillIds: string[] | null
    currentAgentEvent: any | null
    activeArtifact: ActiveArtifact | null
    activeRunId: string | null
    draftSessionId: string | null

    loadHistory: () => Promise<void>
    createSession: (title?: string) => void
    switchSession: (id: string) => void
    deleteSession: (id: string) => void
    renameSession: (id: string, newTitle: string) => void

    addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
    updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void
    setSending: (sending: boolean) => void
    setAgentEvent: (event: any | null) => void
    setActiveTab: (tab: 'chat' | 'skills' | 'staff' | 'scheduler' | 'settings') => void
    addPendingAttachment: (path: string) => void
    removePendingAttachment: (path: string) => void
    clearPendingAttachments: () => void
    setSelectedSkillIds: (ids: string[] | null) => void
    setActiveArtifact: (artifact: ActiveArtifact | null) => void
    startNewChat: () => void
    sendMessage: (input: string, attachments: string[]) => Promise<void>
    assignStaff: (sessionId: string, staffId: string | undefined) => void
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
    sessionMetas: [],
    activeSessionId: '',
    isSending: false,
    activeTab: 'chat',
    pendingAttachments: [],
    selectedSkillIds: null,
    currentAgentEvent: null,
    activeArtifact: null,
    activeRunId: null,
    draftSessionId: null,

    loadHistory: async () => {
        try {
            // Load list (metadata only)
            const list = await window.electronAPI.session.list();

            // Convert to Record
            const sessions: Record<string, ChatSession> = {};
            const sessionMetas: { id: string, title?: string, updatedAt: number, staffId?: string }[] = [];
            list.forEach((meta: any) => {
                // Ensure messages is initialized (even if empty) to satisfy type
                sessions[meta.id] = { ...meta, messages: [] };
                sessionMetas.push({ id: meta.id, title: meta.title, updatedAt: meta.updatedAt, staffId: meta.staffId });
            });

            if (list.length > 0) {
                const activeId = list[0].id; // Most recent due to sort in backend

                // Lazy load active session messages BEFORE setting as active to avoid flickering
                const messages = await window.electronAPI.session.getHistory(activeId);
                sessions[activeId].messages = messages;

                set({ sessions, sessionMetas, activeSessionId: activeId });
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
                    sessionMetas: [{ id: defaultSes.id, title: defaultSes.title, updatedAt: defaultSes.updatedAt }],
                    activeSessionId: defaultSes.id
                });
            }
        } catch (e) {
            console.error('Failed to load history', e);
        }
    },

    createSession: (title) => {
        // 如果当前已经是 draft 空白页，不重复创建
        const { draftSessionId, activeSessionId } = get();
        if (draftSessionId && draftSessionId === activeSessionId) return;

        const tempId = crypto.randomUUID();
        const newSession: ChatSession = {
            id: tempId,
            title: title || '新任务',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
        };

        // 只建本地 state，不加入 sessionMetas（侧边栏不显示）
        set(state => ({
            sessions: { ...state.sessions, [tempId]: newSession },
            activeSessionId: tempId,
            draftSessionId: tempId,
            activeTab: 'chat'
        }));
    },

    switchSession: async (id) => {
        // 切走时静默丢弃 draft（draft 不在 sessionMetas 中，无需过滤）
        const { draftSessionId } = get();
        if (draftSessionId && draftSessionId !== id) {
            set(state => {
                const { [draftSessionId]: _, ...rest } = state.sessions;
                return { sessions: rest, draftSessionId: null };
            });
        }

        const { sessions } = get();
        const session = sessions[id];

        if (session) {
            // Lazy load if messages empty or partial
            if (!session.messages || session.messages.length === 0) {
                try {
                    const messages = await window.electronAPI.session.getHistory(id);
                    set(state => ({
                        sessions: {
                            ...state.sessions,
                            [id]: { ...state.sessions[id], messages }
                        },
                        activeSessionId: id,
                        activeTab: 'chat'
                    }));
                } catch (error) {
                    console.error('Failed to load session history for id', id, ':', error);
                    // Fallback to switching anyway
                    set({ activeSessionId: id, activeTab: 'chat' });
                }
            } else {
                set({ activeSessionId: id, activeTab: 'chat' });
            }
        }
    },

    deleteSession: async (id) => {
        const isDraft = get().draftSessionId === id;

        // Draft 只存在于本地，不需要调后端删除
        if (!isDraft) {
            try {
                await window.electronAPI.session.delete(id);
            } catch (error) {
                console.error('Failed to delete session', id, ':', error);
                return;
            }
        }

        set(state => {
            const { [id]: deleted, ...rest } = state.sessions;

            let nextActiveId = state.activeSessionId;
            if (id === state.activeSessionId) {
                const remainingIds = Object.keys(rest);
                if (remainingIds.length > 0) {
                    nextActiveId = Object.values(rest).sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
                    get().switchSession(nextActiveId);
                } else {
                    setTimeout(() => get().createSession(), 0);
                    nextActiveId = '';
                }
            }
            return {
                sessions: rest,
                sessionMetas: state.sessionMetas.filter(m => m.id !== id),
                activeSessionId: nextActiveId,
                draftSessionId: isDraft ? null : state.draftSessionId,
            };
        });
    },

    renameSession: async (id, newTitle) => {
        set(state => {
            const session = state.sessions[id];
            if (!session) return state;

            const updated = { ...session, title: newTitle };
            
            const newMetas = state.sessionMetas.map(m => 
                m.id === id ? { ...m, title: newTitle } : m
            );

            return {
                sessions: { ...state.sessions, [id]: updated },
                sessionMetas: newMetas
            };
        });

        try {
            await window.electronAPI.session.save({ id, title: newTitle }); // Async save
        } catch (error) {
            console.error('Failed to rename session', id, ':', error);
        }
    },

    assignStaff: async (id, staffId) => {
        set(state => {
            const session = state.sessions[id];
            if (!session) return state;

            const updated = { ...session, staffId };
            return {
                sessions: { ...state.sessions, [id]: updated },
                sessionMetas: state.sessionMetas.map(m =>
                    m.id === id ? { ...m, staffId } : m
                )
            };
        });

        try {
            // we should also save to backend, passing staffId
            await window.electronAPI.session.save({ id, staffId });
        } catch (error) {
            console.error('Failed to assign staff to session', id, ':', error);
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

        let updatedMetas = state.sessionMetas;
        // Auto-title logic for first user message
        if (session.messages.length <= 1 && msg.role === 'user' && msg.content) {
            const textContent = typeof msg.content === 'string' 
                ? msg.content 
                : (Array.isArray(msg.content) ? msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n') : '');
            const potentialTitle = textContent.trim().slice(0, 20);
            if (potentialTitle) {
                updatedSession.title = potentialTitle;
                if (!get().draftSessionId) {
                    window.electronAPI.session.save({ id: session.id, title: potentialTitle });
                }
                
                updatedMetas = state.sessionMetas.map(m => 
                    m.id === session.id ? { ...m, title: potentialTitle, updatedAt: updatedSession.updatedAt } : m
                );
            }
        } else {
            // Update the timestamp for the active session in metas
            updatedMetas = state.sessionMetas.map(m => 
                m.id === session.id ? { ...m, updatedAt: updatedSession.updatedAt } : m
            );
        }

        // 立即更新本地状态
        set({
            sessions: { ...state.sessions, [state.activeSessionId]: updatedSession },
            sessionMetas: updatedMetas
        });

        // 用户消息保存到后端持久化（draft 尚无后端记录，跳过，由 sendMessage 统一处理）
        if (msg.role === 'user' && !get().draftSessionId) {
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

            // Do not update `updatedAt` here to avoid massive UI re-renders 
            // of the sidebar and layout during high-frequency streaming updates.
            const updatedSession = { ...session, messages: msgs };

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
        const { isSending, sessions, addMessage, updateLastMessage, setSending, setAgentEvent, clearPendingAttachments } = state;

        let activeSessionId = state.activeSessionId;

        if (!input.trim() || isSending) return;

        const currentSession = sessions[activeSessionId];
        if (!currentSession) return;

        let finalPrompt = input;
        const finalContent: any[] = [];
        const fileAttachments: string[] = [];

        // 如果有附件，在 Prompt 前面追加上下文说明
        if (attachments.length > 0) {
            for (const path of attachments) {
                const ext = path.split('.').pop()?.toLowerCase();
                if (ext && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const base64Data = await (window as any).electronAPI.system.readFileBase64(path);
                        const mimeType = ext === 'jpg' ? 'jpeg' : ext;
                        finalContent.push({
                            type: 'image_url',
                            image_url: { url: `data:image/${mimeType};base64,${base64Data}` }
                        });
                    } catch (e) {
                        console.error('Failed to read image', path, e);
                        fileAttachments.push(path);
                    }
                } else {
                    fileAttachments.push(path);
                }
            }

            if (fileAttachments.length > 0) {
                const attachmentInfo = fileAttachments.map(p => `- ${p}`).join('\n');
                finalPrompt = `[用户分享了以下文件供你参考，你可以使用工具读取其内容]:\n${attachmentInfo}\n\n${input}`;
            }
        }

        if (finalContent.length > 0) {
            finalContent.push({ type: 'text', text: finalPrompt });
        }

        const userInput = finalContent.length > 0 ? finalContent : finalPrompt;

        // 1. Add User Message
        addMessage({ role: 'user', content: userInput as any });

        // 2. Add Placeholder for Assistant
        setSending(true);
        addMessage({ role: 'assistant', content: '' });
        clearPendingAttachments();
        get().setActiveArtifact(null); // Clear previous artifact on new message

        // 3. Draft 立即加入侧边栏显示（不等后端返回）
        const isDraft = get().draftSessionId === activeSessionId;
        if (isDraft) {
            const session = get().sessions[activeSessionId];
            set(state => ({
                sessionMetas: [{ id: activeSessionId, title: session.title, updatedAt: session.updatedAt }, ...state.sessionMetas],
            }));
        }

        // --- Unified Stream Mechanism ---
        // Merges content, reasoning, and step updates into a single RAF loop.
        // Reduces React re-renders from ~180/sec to ~60/sec during streaming.
        let contentBuf = '';
        let reasoningBuf = '';
        let pendingSteps: any[] | null = null;
        let isFlushing = false;
        let lastStepFlushTime = 0;
        const STEP_THROTTLE_MS = 250;

        const scheduleFlush = () => {
            if (!isFlushing) {
                isFlushing = true;
                requestAnimationFrame(flushUnified);
            }
        };

        const flushUnified = () => {
            const now = Date.now();
            const hasContent = !!contentBuf;
            const hasReasoning = !!reasoningBuf;
            const shouldFlushSteps = pendingSteps !== null && (now - lastStepFlushTime >= STEP_THROTTLE_MS);

            if (!hasContent && !hasReasoning && !shouldFlushSteps) {
                isFlushing = false;
                // Safety: ensure pending steps get flushed when throttle expires
                if (pendingSteps) {
                    setTimeout(scheduleFlush, STEP_THROTTLE_MS - (now - lastStepFlushTime));
                }
                return;
            }

            const chunkContent = contentBuf;
            const chunkReasoning = reasoningBuf;
            const stepsToFlush = shouldFlushSteps ? pendingSteps : null;

            contentBuf = '';
            reasoningBuf = '';
            if (shouldFlushSteps) {
                pendingSteps = null;
                lastStepFlushTime = now;
            }

            get().updateLastMessage((msg) => ({
                ...msg,
                ...(hasContent ? { content: msg.content + chunkContent } : {}),
                ...(hasReasoning ? { reasoning_content: (msg.reasoning_content || '') + chunkReasoning } : {}),
                ...(shouldFlushSteps && stepsToFlush ? { steps: stepsToFlush } : {}),
            }));

            // Artifact logic (only when steps are flushed)
            if (stepsToFlush) {
                let latestArtifact: ActiveArtifact | null = get().activeArtifact;
                for (const step of stepsToFlush) {
                    if (step.tool === 'write' || step.tool === 'edit') {
                        if (step.toolInput) {
                            const { path, content } = extractPathAndContent(step.toolInput, step.tool);
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

                if (latestArtifact) {
                    const { autoOpenArtifact } = useSettingsStore.getState().settings;
                    const currentArtifact = get().activeArtifact;
                    const isDifferent = latestArtifact.path !== currentArtifact?.path || latestArtifact.content !== currentArtifact?.content;

                    if (isDifferent) {
                        if (autoOpenArtifact || currentArtifact !== null) {
                            get().setActiveArtifact(latestArtifact);
                        }
                    }
                }
            }

            requestAnimationFrame(flushUnified);
        };

        const cleanupStream = window.electronAPI.agent.onStream((chunk: string, reset?: boolean) => {
            if (reset) {
                contentBuf = '';
                get().updateLastMessage((msg) => ({ ...msg, content: chunk }));
            } else {
                contentBuf += chunk;
                scheduleFlush();
            }
        });

        const cleanupReasoningStream = window.electronAPI.agent.onReasoningStream((chunk: string, reset?: boolean) => {
            if (reset) {
                reasoningBuf = '';
                get().updateLastMessage((msg) => ({ ...msg, reasoning_content: '' }));
            } else {
                reasoningBuf += chunk;
                scheduleFlush();
            }
        });

        const cleanupTrace = window.electronAPI.agent.onStepUpdate((steps: any[]) => {
            pendingSteps = steps;
            const now = Date.now();
            if (now - lastStepFlushTime >= STEP_THROTTLE_MS) {
                scheduleFlush();
            } else if (!isFlushing) {
                setTimeout(scheduleFlush, STEP_THROTTLE_MS - (now - lastStepFlushTime));
            }
        });

        const isAbortError = (e: any) => {
            const msg = (e?.message || '').toLowerCase()
            return e?.name === 'AbortError' || msg.includes('aborted') || msg.includes('取消') || msg.includes('cancel')
        }

        const cleanupError = window.electronAPI.agent.onError((err: any) => {
            // 用户主动终止不是错误，保留已有内容不做额外处理
            if (isAbortError(err)) return
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

        // Track activeRunId from auth_request events (needed for ThoughtTrace inline auth)
        const cleanupAuth = window.electronAPI.agent.onAuthorizationRequest((req: any) => {
            if (req?.runId) {
                set({ activeRunId: req.runId });
            }
        });

        try {
            // Start Agent
            const isDraft = get().draftSessionId === activeSessionId;
            const skillIds = get().selectedSkillIds;
            const options: any = {};
            if (skillIds !== null) options.skills = skillIds;
            if (currentSession.staffId) options.staffId = currentSession.staffId;

            const result = await window.electronAPI.agent.start({
                sessionId: isDraft ? undefined : activeSessionId,
                prompt: userInput,
                options: Object.keys(options).length > 0 ? options : undefined
            });

            // Draft → 真实 session：替换临时 ID
            if (isDraft && result?.sessionId) {
                const realId = result.sessionId;
                const tempId = activeSessionId;
                set(state => {
                    const session = state.sessions[tempId];
                    const { [tempId]: _, ...rest } = state.sessions;
                    return {
                        sessions: { ...rest, [realId]: { ...session, id: realId } },
                        sessionMetas: state.sessionMetas.map(m =>
                            m.id === tempId ? { ...m, id: realId } : m
                        ),
                        activeSessionId: realId,
                        draftSessionId: null,
                    };
                });
                activeSessionId = realId;

                // 持久化标题和用户消息到后端
                const realSession = get().sessions[realId];
                if (realSession) {
                    window.electronAPI.session.save({ id: realId, title: realSession.title });
                    const userMsg = realSession.messages.find(m => m.role === 'user');
                    if (userMsg) {
                        window.electronAPI.session.addMessage(realId, userMsg);
                    }
                }
            }
        } catch (err: any) {
            // 用户主动终止不是错误，静默处理
            if (!isAbortError(err)) {
                get().updateLastMessage((msg) => ({
                    ...msg,
                    content: `Error: ${err.message}`,
                    isError: true
                }));
            }
        } finally {
            cleanupStream();
            cleanupReasoningStream();
            cleanupTrace();
            cleanupError();
            cleanupState();
            cleanupAuth();
            get().setAgentEvent(null);
            get().setSending(false);
            set({ activeRunId: null });
        }
    }
}))
