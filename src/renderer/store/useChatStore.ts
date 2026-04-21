import { create } from 'zustand'
import { ChatMessage, ChatSession, MessageArtifact } from '../../common/types/chat'
import { DEFAULT_PROVIDER_CONFIGS } from '../../common/types/settings'
import i18n from '../../common/i18n'
import { extractArtifactsFromStep, extractPathAndContent } from '../utils/artifact'
import { useSettingsStore } from './useSettingsStore'
import { useLayoutStore } from './useLayoutStore'
import { useModalStore } from './useModalStore'
import type { ArtifactPreviewResult } from '../electron-api.d'

interface TextArtifact {
    toolName: string;
    path: string;
    kind: 'text';
    content: string;
}

interface HtmlArtifact extends ArtifactPreviewResult {
    toolName: string;
}

export type ActiveArtifact = TextArtifact | HtmlArtifact;

interface NewTaskConfig {
    title: string;
    staffId?: string;
    modelId?: string;
    workspacePath?: string;
}

interface ChatState {
    sessions: Record<string, ChatSession>
    sessionMetas: { id: string, title?: string, updatedAt: number, staffId?: string, modelId?: string, workspacePath?: string, activeSkillIds?: string[], pinned?: boolean }[]
    activeSessionId: string | null
    loadingSessionIds: Set<string>
    activeTab: 'chat' | 'skills' | 'staff' | 'scheduler' | 'settings'
    pendingAttachments: string[]
    selectedSkillIds: string[] | null
    activeArtifact: ActiveArtifact | null
    newTaskConfig: NewTaskConfig
    pendingArtifactsBySession: Map<string, MessageArtifact[]>
    runningSessions: Map<string, {
        runId: string | null;
        agentState: any | null;
    }>

    loadHistory: () => Promise<void>
    createSession: (title?: string) => void
    switchSession: (id: string) => void
    deleteSession: (id: string) => void
    renameSession: (id: string, newTitle: string) => void

    addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
    updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void
    setActiveTab: (tab: 'chat' | 'skills' | 'staff' | 'scheduler' | 'settings') => void
    addPendingAttachment: (path: string) => void
    removePendingAttachment: (path: string) => void
    clearPendingAttachments: () => void
    setSelectedSkillIds: (ids: string[] | null) => void
    setActiveArtifact: (artifact: ActiveArtifact | null) => void
    startNewChat: () => void
    sendMessage: (input: string, attachments: string[]) => Promise<void>
    assignStaff: (sessionId: string | null, staffId: string | undefined) => void
    setSessionConfig: (sessionId: string | null, config: { modelId?: string, workspacePath?: string }) => void
    batchDeleteSessions: (ids: string[]) => Promise<void>
}

const DEFAULT_NEW_TASK_TITLE = '新任务';

const buildNewTaskConfig = (session?: Pick<ChatSession, 'workspacePath' | 'modelId'>, title = DEFAULT_NEW_TASK_TITLE): NewTaskConfig => ({
    title,
    workspacePath: session?.workspacePath,
    staffId: undefined,
});

function findEnabledModel(
    providers: Record<string, any>,
    providerKey: string,
    modelRef?: string
) {
    const config = providers[providerKey];
    if (!config || config.enabled !== true) return null;

    const enabledModels = (config.models || []).filter((model: any) => model.enabled);
    if (enabledModels.length === 0) return null;
    if (!modelRef) {
        return enabledModels.find((model: any) => model.id === config.activeModelId) || enabledModels[0];
    }

    return enabledModels.find((model: any) => model.id === modelRef || model.model === modelRef) || null;
}

function resolveFallbackModel(
    providers: Record<string, any>,
    preferredProvider?: string
): { providerKey: string; model: any } | null {
    const providerKeys = [
        ...(preferredProvider ? [preferredProvider] : []),
        ...Object.keys(providers).filter(key => key !== preferredProvider)
    ];

    for (const providerKey of providerKeys) {
        const model = findEnabledModel(providers, providerKey);
        if (model) {
            return { providerKey, model };
        }
    }

    return null;
}

async function resolveUsableModelId(session?: ChatSession, newTaskConfig?: NewTaskConfig): Promise<string | null> {
    const settings = useSettingsStore.getState().settings;
    const providers = {
        ...DEFAULT_PROVIDER_CONFIGS,
        ...(settings.llm.providers || {})
    };

    const explicitModelId = session?.modelId || newTaskConfig?.modelId;
    if (explicitModelId) {
        const slashIdx = explicitModelId.indexOf('/');
        const providerKey = slashIdx >= 0 ? explicitModelId.slice(0, slashIdx) : (settings.llm.activeProvider || 'OpenAI');
        const modelRef = slashIdx >= 0 ? explicitModelId.slice(slashIdx + 1) : explicitModelId;
        const model = findEnabledModel(providers, providerKey, modelRef);
        if (model) {
            return `${providerKey}/${model.model}`;
        }
    }

    const staffId = session?.staffId || newTaskConfig?.staffId;
    if (staffId) {
        const { profiles } = await import('./useStaffStore').then(m => m.useStaffStore.getState());
        const staff = profiles.find(profile => profile.id === staffId);
        if (staff?.modelId) {
            const slashIdx = staff.modelId.indexOf('/');
            const providerKey = slashIdx >= 0 ? staff.modelId.slice(0, slashIdx) : (settings.llm.activeProvider || 'OpenAI');
            const modelRef = slashIdx >= 0 ? staff.modelId.slice(slashIdx + 1) : staff.modelId;
            const model = findEnabledModel(providers, providerKey, modelRef);
            if (model) {
                return `${providerKey}/${model.model}`;
            }
        }
    }

    const fallback = resolveFallbackModel(providers, settings.llm.activeProvider || 'OpenAI');
    return fallback ? `${fallback.providerKey}/${fallback.model.model}` : null;
}

function promptConfigureModel() {
    useModalStore.getState().showConfirm({
        message: i18n.t('composer.modelRequiredMessage'),
        confirmText: i18n.t('composer.openModelSettings'),
        cancelText: i18n.t('modelSettings.cancel'),
        onConfirm: () => {
            useLayoutStore.getState().setActiveSettingsSection('models');
            useChatStore.getState().setActiveTab('settings');
        }
    });
}

export const useChatStore = create<ChatState>((set, get) => ({
    sessions: {},
    sessionMetas: [],
    activeSessionId: null,
    loadingSessionIds: new Set(),
    activeTab: 'chat',
    pendingAttachments: [],
    selectedSkillIds: null,
    activeArtifact: null,
    newTaskConfig: buildNewTaskConfig(),
    pendingArtifactsBySession: new Map(),
    runningSessions: new Map(),

    loadHistory: async () => {
        try {
            // Load list (metadata only)
            const list = await window.electronAPI.session.list();

            // Convert to Record
            const sessions: Record<string, ChatSession> = {};
            const sessionMetas: { id: string, title?: string, updatedAt: number, staffId?: string, modelId?: string, workspacePath?: string, activeSkillIds?: string[] }[] = [];
            list.forEach((meta: any) => {
                // Ensure messages is initialized (even if empty) to satisfy type
                sessions[meta.id] = { ...meta, messages: [] };
                sessionMetas.push({ id: meta.id, title: meta.title, updatedAt: meta.updatedAt, staffId: meta.staffId, modelId: meta.modelId, workspacePath: meta.workspacePath, activeSkillIds: meta.activeSkillIds });
            });

            if (list.length > 0) {
                const activeId = list[0].id; // Most recent due to sort in backend

                // Lazy load active session messages BEFORE setting as active to avoid flickering
                const messages = await window.electronAPI.session.getHistory(activeId);
                sessions[activeId].messages = messages;

                set({
                    sessions,
                    sessionMetas,
                    activeSessionId: activeId,
                    selectedSkillIds: null,
                    newTaskConfig: buildNewTaskConfig(sessions[activeId]),
                });
            } else {
                set({
                    sessions,
                    sessionMetas,
                    activeSessionId: null,
                    newTaskConfig: buildNewTaskConfig(),
                });
            }
        } catch (e) {
            console.error('Failed to load history', e);
        }
    },

    createSession: (title) => {
        const { sessionMetas, sessions: allSessions } = get();
        const latestMeta = sessionMetas[0]; // sessionMetas 按 updatedAt 降序
        const prevSession = latestMeta ? allSessions[latestMeta.id] : undefined;
        set({
            activeSessionId: null,
            activeTab: 'chat',
            selectedSkillIds: null,
            activeArtifact: null,
            pendingAttachments: [],
            newTaskConfig: buildNewTaskConfig(prevSession, title || DEFAULT_NEW_TASK_TITLE),
        });
    },

    switchSession: async (id) => {
        const { sessions, activeSessionId } = get();
        if (activeSessionId === id) return;
        const session = sessions[id];

        if (session) {
            // Lazy load if messages empty or partial
            if (!session.messages || session.messages.length === 0) {
                set(state => ({
                    activeSessionId: id,
                    activeTab: 'chat',
                    selectedSkillIds: null,
                    newTaskConfig: buildNewTaskConfig({ workspacePath: state.sessions[id].workspacePath, modelId: state.sessions[id].modelId }),
                    loadingSessionIds: new Set(state.loadingSessionIds).add(id),
                }));

                try {
                    const messages = await window.electronAPI.session.getHistory(id);
                    set(state => ({
                        sessions: {
                            ...state.sessions,
                            [id]: { ...state.sessions[id], messages }
                        },
                        loadingSessionIds: (() => {
                            const next = new Set(state.loadingSessionIds);
                            next.delete(id);
                            return next;
                        })(),
                    }));
                } catch (error) {
                    console.error('Failed to load session history for id', id, ':', error);
                    set(state => ({
                        loadingSessionIds: (() => {
                            const next = new Set(state.loadingSessionIds);
                            next.delete(id);
                            return next;
                        })(),
                    }));
                }
            } else {
                set({ activeSessionId: id, activeTab: 'chat', selectedSkillIds: null, newTaskConfig: buildNewTaskConfig(session) });
            }
        }
    },

    deleteSession: async (id) => {
        try {
            await window.electronAPI.session.delete(id);
        } catch (error) {
            console.error('Failed to delete session', id, ':', error);
            return;
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
                    nextActiveId = null;
                }
            }
            return {
                sessions: rest,
                sessionMetas: state.sessionMetas.filter(m => m.id !== id),
                activeSessionId: nextActiveId,
                newTaskConfig: nextActiveId ? state.newTaskConfig : buildNewTaskConfig(),
            };
        });
    },

    batchDeleteSessions: async (ids) => {
        await Promise.all(
            ids.map(id => window.electronAPI.session.delete(id).catch(err =>
                console.error('Failed to delete session', id, ':', err)
            ))
        );

        set(state => {
            const rest = { ...state.sessions };
            for (const id of ids) delete rest[id];

            const idSet = new Set(ids);
            const newMetas = state.sessionMetas.filter(m => !idSet.has(m.id));

            let nextActiveId = state.activeSessionId;
            if (state.activeSessionId && idSet.has(state.activeSessionId)) {
                const remaining = Object.values(rest).sort((a, b) => b.updatedAt - a.updatedAt);
                if (remaining.length > 0) {
                    nextActiveId = remaining[0].id;
                    // defer switch to avoid calling get() inside set
                    setTimeout(() => get().switchSession(nextActiveId!), 0);
                } else {
                    nextActiveId = null;
                }
            }

            return {
                sessions: rest,
                sessionMetas: newMetas,
                activeSessionId: nextActiveId,
                newTaskConfig: nextActiveId ? state.newTaskConfig : buildNewTaskConfig(),
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
        // Resolve staff profile to get its modelId
        const { profiles } = await import('./useStaffStore').then(m => m.useStaffStore.getState());
        const staff = staffId ? profiles.find(p => p.id === staffId) : undefined;

        set(state => {
            if (!id) {
                const updates: Partial<NewTaskConfig> = { staffId };
                if (staff?.modelId) {
                    updates.modelId = staff.modelId;
                } else if (!staffId) {
                    updates.modelId = undefined;
                }
                return {
                    newTaskConfig: { ...state.newTaskConfig, ...updates }
                };
            }

            const session = state.sessions[id];
            if (!session) return state;

            // If staff has a configured model and user hasn't manually selected one, apply it
            const updates: Partial<typeof session> = { staffId };
            if (staff?.modelId) {
                updates.modelId = staff.modelId;
            } else if (!staffId) {
                // Clearing staff — reset model to global default (remove session-level override)
                updates.modelId = undefined;
            }

            const updated = { ...session, ...updates };
            return {
                sessions: { ...state.sessions, [id]: updated },
                sessionMetas: state.sessionMetas.map(m =>
                    m.id === id ? { ...m, ...updates } : m
                )
            };
        });

        try {
            if (!id) return;
            const session = get().sessions[id];
            const savePayload: any = { id, staffId };
            if (session?.modelId) savePayload.modelId = session.modelId;
            await window.electronAPI.session.save(savePayload);
        } catch (error) {
            console.error('Failed to assign staff to session', id, ':', error);
        }
    },

    setSessionConfig: async (id, config) => {
        set(state => {
            if (!id) {
                return {
                    newTaskConfig: { ...state.newTaskConfig, ...config }
                };
            }

            const session = state.sessions[id];
            if (!session) return state;

            const updated = { ...session, ...config };
            return {
                sessions: { ...state.sessions, [id]: updated },
                sessionMetas: state.sessionMetas.map(m =>
                    m.id === id ? { ...m, ...config } : m
                )
            };
        });

        try {
            if (!id) return;
            await window.electronAPI.session.save({ id, ...config });
        } catch (error) {
            console.error('Failed to save session config', id, ':', error);
        }
    },

    addMessage: (msg) => {
        const state = get();
        const activeSessionId = state.activeSessionId;
        if (!activeSessionId) return;

        const session = state.sessions[activeSessionId];
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
                window.electronAPI.session.save({ id: session.id, title: potentialTitle });

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
            sessions: { ...state.sessions, [activeSessionId]: updatedSession },
            sessionMetas: updatedMetas
        });

        if (msg.role === 'user') {
            window.electronAPI.session.addMessage(session.id, newMsg);
        }
    },

    updateLastMessage: (updater) => {
        set(state => {
            if (!state.activeSessionId) return state;

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
        let state = get();
        const { addMessage, clearPendingAttachments } = state;

        let activeSessionId = state.activeSessionId;

        if (!input.trim() || (activeSessionId ? get().runningSessions.has(activeSessionId) : false)) return;

        const existingSession = activeSessionId ? state.sessions[activeSessionId] : undefined;
        const resolvedModelId = await resolveUsableModelId(existingSession, state.newTaskConfig);
        if (!resolvedModelId) {
            promptConfigureModel();
            return;
        }

        let currentSession = activeSessionId ? state.sessions[activeSessionId] : undefined;
        if (!currentSession) {
            const sessionConfig = state.newTaskConfig;
            const created = await window.electronAPI.session.create();
            const createdSession: ChatSession = {
                id: created.id,
                title: sessionConfig.title || DEFAULT_NEW_TASK_TITLE,
                createdAt: created.createdAt,
                updatedAt: created.createdAt,
                messages: [],
                staffId: sessionConfig.staffId,
                modelId: sessionConfig.modelId,
                workspacePath: sessionConfig.workspacePath,
                activeSkillIds: [],
            };

            set(store => ({
                sessions: { ...store.sessions, [created.id]: createdSession },
                sessionMetas: [{ id: created.id, title: createdSession.title, updatedAt: createdSession.updatedAt, staffId: createdSession.staffId, modelId: createdSession.modelId, workspacePath: createdSession.workspacePath, activeSkillIds: createdSession.activeSkillIds }, ...store.sessionMetas],
                activeSessionId: created.id,
            }));

            activeSessionId = created.id;
            currentSession = createdSession;
            state = get();

            const savePayload: any = { id: created.id, title: createdSession.title };
            if (createdSession.staffId) savePayload.staffId = createdSession.staffId;
            if (createdSession.modelId) savePayload.modelId = createdSession.modelId;
            if (createdSession.workspacePath) savePayload.workspacePath = createdSession.workspacePath;
            await window.electronAPI.session.save(savePayload);
        }

        if (!currentSession || !activeSessionId) return;

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
                        // Allow agent's read tool to access this file
                        try {
                            await (window as any).electronAPI.system.addAllowedPath(path);
                        } catch (e) {
                            console.error('Failed to add allowed path', path, e);
                        }
                    }
                } else {
                    fileAttachments.push(path);
                    // Allow agent's read tool to access this file
                    try {
                        await (window as any).electronAPI.system.addAllowedPath(path);
                    } catch (e) {
                        console.error('Failed to add allowed path', path, e);
                    }
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

        // 1. Add User Message (with selected skills)
        const skillIds = get().selectedSkillIds;
        addMessage({ role: 'user', content: userInput as any, ...(skillIds && skillIds.length > 0 ? { skillIds } : {}) });

        // 2. Add Placeholder for Assistant
        set(state => ({
            runningSessions: new Map(state.runningSessions).set(activeSessionId, { runId: null, agentState: null }),
            pendingArtifactsBySession: (() => {
                const next = new Map(state.pendingArtifactsBySession);
                next.delete(activeSessionId);
                return next;
            })(),
        }));
        addMessage({ role: 'assistant', content: '' });
        clearPendingAttachments();
        get().setActiveArtifact(null); // Clear previous artifact on new message

        // Track the target session ID for streaming updates (fixed, won't change when user switches sessions)
        const targetSessionId = activeSessionId;

        // Helper: update last message of the TARGET session (not activeSessionId)
        const updateTargetMessage = (updater: (msg: ChatMessage) => ChatMessage) => {
            set(state => {
                const session = state.sessions[targetSessionId];
                if (!session || session.messages.length === 0) return state;

                const msgs = [...session.messages];
                const lastIdx = msgs.length - 1;
                msgs[lastIdx] = updater(msgs[lastIdx]);

                return {
                    sessions: { ...state.sessions, [targetSessionId]: { ...session, messages: msgs } }
                };
            });
        };

        const mergeArtifacts = (existing: MessageArtifact[] | undefined, incoming: MessageArtifact[]): MessageArtifact[] => {
            const merged = [...(existing || [])];
            for (const artifact of incoming) {
                if (!merged.some(item => item.path === artifact.path)) {
                    merged.push(artifact);
                }
            }
            return merged;
        };

        const appendPendingArtifacts = (sessionId: string, incoming: MessageArtifact[]) => {
            if (incoming.length === 0) return;
            set(state => {
                const next = new Map(state.pendingArtifactsBySession);
                const current = next.get(sessionId) || [];
                next.set(sessionId, mergeArtifacts(current, incoming));
                return { pendingArtifactsBySession: next };
            });
        };

        const flushPendingArtifactsToMessage = (sessionId: string) => {
            set(state => {
                const pending = state.pendingArtifactsBySession.get(sessionId) || [];
                if (pending.length === 0) return state;

                const session = state.sessions[sessionId];
                if (!session || session.messages.length === 0) {
                    const nextPending = new Map(state.pendingArtifactsBySession);
                    nextPending.delete(sessionId);
                    return { pendingArtifactsBySession: nextPending };
                }

                const msgs = [...session.messages];
                const lastIdx = msgs.length - 1;
                msgs[lastIdx] = {
                    ...msgs[lastIdx],
                    artifacts: mergeArtifacts(msgs[lastIdx].artifacts, pending),
                };

                const nextPending = new Map(state.pendingArtifactsBySession);
                nextPending.delete(sessionId);

                return {
                    sessions: { ...state.sessions, [sessionId]: { ...session, messages: msgs } },
                    pendingArtifactsBySession: nextPending,
                };
            });
        };

        const persistLastAssistantArtifacts = async (sessionId: string) => {
            const session = get().sessions[sessionId];
            const lastLocalMessage = session?.messages[session.messages.length - 1];
            if (lastLocalMessage?.role !== 'assistant' || !lastLocalMessage.artifacts?.length) return;

            try {
                const history = await window.electronAPI.session.getHistory(sessionId);
                const lastPersistedAssistant = [...history].reverse().find(message => message.role === 'assistant' && message.id);
                if (!lastPersistedAssistant?.id) return;

                await window.electronAPI.session.updateMessage(sessionId, lastPersistedAssistant.id, {
                    artifacts: lastLocalMessage.artifacts,
                });
            } catch (error) {
                console.error('Failed to persist assistant artifacts', error);
            }
        };

        const collectArtifactsFromSteps = (steps: any[]): MessageArtifact[] => {
            const artifacts: MessageArtifact[] = [];
            for (const step of steps) {
                artifacts.push(...extractArtifactsFromStep(step));
            }
            return artifacts;
        };

        // --- Unified Stream Mechanism ---
        // Merges content, reasoning, and step updates into a single RAF loop.
        // Reduces React re-renders from ~180/sec to ~60/sec during streaming.
        let contentBuf = '';
        let reasoningBuf = '';
        let pendingSteps: any[] | null = null;
        let isFlushing = false;
        let lastStepFlushTime = 0;
        const STEP_THROTTLE_MS = 16;

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

            // 注意: 先重置 isFlushing，后续若还有 buffer 内容再由下方决定是否继续

            const chunkContent = contentBuf;
            const chunkReasoning = reasoningBuf;
            const stepsToFlush = shouldFlushSteps ? pendingSteps : null;

            contentBuf = '';
            reasoningBuf = '';
            if (shouldFlushSteps) {
                pendingSteps = null;
                lastStepFlushTime = now;
            }

            updateTargetMessage((msg) => {
                const parts = msg.reasoning_parts || [''];
                const updatedParts = hasReasoning
                    ? [...parts.slice(0, -1), (parts[parts.length - 1] || '') + chunkReasoning]
                    : parts;

                return {
                    ...msg,
                    ...(hasContent ? { content: msg.content + chunkContent } : {}),
                    ...(hasReasoning ? { reasoning_parts: updatedParts } : {}),
                    ...(shouldFlushSteps && stepsToFlush ? { steps: stepsToFlush } : {}),
                };
            });

            if (shouldFlushSteps && stepsToFlush) {
                appendPendingArtifacts(targetSessionId, collectArtifactsFromSteps(stepsToFlush));
            }

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
                                    kind: 'text',
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
                                kind: 'text',
                                content: step.observation || step.streamingObservation || 'Running...'
                            };
                        }
                    } else if (step.tool === 'read') {
                        if (step.observation) {
                            const { path } = extractPathAndContent(step.toolInput || '{}');
                            latestArtifact = {
                                toolName: step.tool,
                                path: path || '...',
                                kind: 'text',
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

            // 只有 buffer 还有内容才继续轮询下一帧，否则停止避免空转
            if (contentBuf || reasoningBuf || pendingSteps !== null) {
                requestAnimationFrame(flushUnified);
            } else {
                isFlushing = false;
            }
        };

        const cleanupStream = window.electronAPI.agent.onStream((sid, chunk, reset) => {
            if (sid !== targetSessionId) return;
            if (reset) {
                contentBuf = '';
                updateTargetMessage((msg) => ({ ...msg, content: chunk }));
            } else {
                contentBuf += chunk;
                scheduleFlush();
            }
        });

        const cleanupReasoningStream = window.electronAPI.agent.onReasoningStream((sid, chunk, reset) => {
            if (sid !== targetSessionId) return;
            if (reset) {
                reasoningBuf = '';
                // 新轮次：在 reasoning_parts 末尾追加空字符串，开始新一轮思考
                updateTargetMessage((msg) => ({
                    ...msg,
                    reasoning_parts: [...(msg.reasoning_parts || []), ''],
                }));
            } else {
                reasoningBuf += chunk;
                scheduleFlush();
            }
        });

        const cleanupTrace = window.electronAPI.agent.onStepUpdate((sid, steps) => {
            if (sid !== targetSessionId) return;
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

        const cleanupError = window.electronAPI.agent.onError((sid, err) => {
            if (sid !== targetSessionId) return;
            if (isAbortError(err)) return
            updateTargetMessage((msg) => ({
                ...msg,
                content: `Error: ${err.message || JSON.stringify(err)}`,
                isError: true
            }));
        });

        const cleanupAll = () => {
            cleanupStream();
            cleanupReasoningStream();
            cleanupTrace();
            cleanupError();
            cleanupState();
            cleanupAuth();
            set(state => {
                const next = new Map(state.runningSessions);
                next.delete(targetSessionId);
                const nextPending = new Map(state.pendingArtifactsBySession);
                nextPending.delete(targetSessionId);
                return { runningSessions: next, pendingArtifactsBySession: nextPending };
            });
        };

        const cleanupState = window.electronAPI.agent.onStateChange((sid, event) => {
            if (sid !== targetSessionId) return;
            console.log('[Store] Received state change:', event.currentState, event.message);
            set(state => {
                const next = new Map(state.runningSessions);
                const current = next.get(targetSessionId);
                if (current) {
                    next.set(targetSessionId, { ...current, agentState: event });
                }
                return { runningSessions: next };
            });
            // Agent finished — clean up listeners and running state
            if (event.currentState === 'Idle') {
                flushPendingArtifactsToMessage(targetSessionId);
                setTimeout(() => {
                    persistLastAssistantArtifacts(targetSessionId);
                }, 0);
                cleanupAll();
            }
        });

        // Track activeRunId from auth_request events (needed for ThoughtTrace inline auth)
        const cleanupAuth = window.electronAPI.agent.onAuthorizationRequest((sid, req) => {
            if (sid !== targetSessionId) return;
            if (req?.runId) {
                set(state => {
                    const next = new Map(state.runningSessions);
                    const current = next.get(targetSessionId);
                    if (current) {
                        next.set(targetSessionId, { ...current, runId: req.runId });
                    }
                    return { runningSessions: next };
                });
            }
        });

        try {
            // Start Agent
            const skillIds = get().selectedSkillIds;
            // Save selected skills to session for display
            if (skillIds !== null && skillIds.length > 0) {
                set(state => {
                    const session = state.sessions[activeSessionId];
                    if (session) {
                        return { sessions: { ...state.sessions, [activeSessionId]: { ...session, activeSkillIds: skillIds } }, selectedSkillIds: null };
                    }
                    return state;
                });
                window.electronAPI.session.save({ id: activeSessionId, activeSkillIds: skillIds }).catch(() => { });
            } else {
                set({ selectedSkillIds: null });
            }
            const options: any = {};
            if (skillIds !== null) options.skills = skillIds;
            if (currentSession.staffId) options.staffId = currentSession.staffId;
            if (currentSession.modelId) {
                options.model = currentSession.modelId;
            } else if (resolvedModelId) {
                options.model = resolvedModelId;
            }
            if (currentSession.workspacePath) options.workspacePath = currentSession.workspacePath;

            const result = await window.electronAPI.agent.start({
                sessionId: activeSessionId,
                prompt: userInput,
                options: Object.keys(options).length > 0 ? options : undefined
            });
            void result;
        } catch (err: any) {
            // 用户主动终止不是错误，静默处理
            if (!isAbortError(err)) {
                updateTargetMessage((msg) => ({
                    ...msg,
                    content: `Error: ${err.message}`,
                    isError: true
                }));
            }
            cleanupAll();
        }
    }
}))
