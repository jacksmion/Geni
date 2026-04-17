
import { Skill } from '../common/types/skill';

export interface ArtifactPreviewResult {
    kind: 'html' | 'pdf';
    path: string;
    previewUrl: string;
    content?: string;
}

export interface IElectronAPI {
    // Agent Namespace
    agent: {
        start: (payload: { sessionId?: string, prompt: string | any[], options?: any }) => Promise<{ success: boolean, sessionId?: string, runId?: string, error?: string }>;
        stop: (sessionId?: string) => Promise<void>;
        getState: () => Promise<string>;
        onStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => () => void;
        onReasoningStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => () => void;
        onStepUpdate: (callback: (sessionId: string, steps: any[]) => void) => () => void;
        onStateChange: (callback: (sessionId: string, state: any) => void) => () => void;
        onError: (callback: (sessionId: string, error: any) => void) => () => void;
        onAuthorizationRequest: (callback: (sessionId: string, request: any) => void) => () => void;
        respondToAuthorization: (response: { requestId: string, approved: boolean, remember?: boolean, runId?: string }) => void;
        onAgentEvent: (callback: (event: any) => void) => () => void;
    };

    // Session Namespace
    session: {
        create: () => Promise<{ id: string, createdAt: number }>;
        list: () => Promise<any[]>;
        getHistory: (id: string) => Promise<any[]>;
        delete: (id: string) => Promise<boolean>;
        save: (session: any) => Promise<boolean>;
        get: (id: string) => Promise<any>;
        addMessage: (sessionId: string, message: any) => Promise<boolean>;
        updateMessage: (sessionId: string, messageId: string, message: any) => Promise<boolean>;
    };

    // System Namespace
    system: {
        getSettings: () => Promise<any>;
        saveSettings: (settings: any) => Promise<boolean>;
        selectFile: (forAttachment?: boolean) => Promise<string | null>;
        selectDirectory: () => Promise<string | null>;
        openExplorer: (path: string) => Promise<void>;
        createArtifactPreview: (path: string) => Promise<ArtifactPreviewResult | null>;
        testLLM: (config: { apiKey: string, baseUrl: string, model: string }) => Promise<{ success: boolean, message: string }>;
        fetchProviderModels: (payload: { providerId: string, config: { apiKey: string, baseUrl: string } }) => Promise<string[]>;
        testTelegram: (config: any) => Promise<{ success: boolean, message: string }>;
        testWeCom: (config: any) => Promise<{ success: boolean, message: string }>;
        testLark: (config: any) => Promise<{ success: boolean, message: string }>;
        testWechat: () => Promise<{ success: boolean, message: string }>;
        readFileBase64: (path: string) => Promise<string>;
        readTextFile: (path: string) => Promise<{ content: string; path: string } | null>;
        addAllowedPath: (filePath: string) => Promise<void>;
        getUsageStats: () => Promise<any>;
        readProfileFile: (name: string) => Promise<string>;
        writeProfileFile: (name: string, content: string) => Promise<void>;
        onSettingsChanged: (callback: (settings: any) => void) => () => void;
        onWechatQr: (callback: (qrUrl: string) => void) => () => void;
    };

    // Tool Namespace
    tools: {
        getSkills: () => Promise<Skill[]>;
        reloadSkills: () => Promise<Skill[]>;
        toggleSkill: (id: string) => Promise<Skill[]>;
        setTrustLevel: (id: string, level: 'Ask' | 'Auto') => Promise<Skill[]>;
        mcpConnect: (config: any) => Promise<{ success: boolean, error?: string }>;
        mcpListTools: () => Promise<Array<{ name: string, description: string }>>;
        mcpToggleTool: (serverId: string, toolName: string) => Promise<{ success: boolean }>;
        mcpSetToolTrustLevel: (serverId: string, toolName: string, level: 'Ask' | 'Auto') => Promise<{ success: boolean }>;
        mcpToggleServer: (serverId: string, enabled: boolean) => Promise<{ success: boolean }>;
        mcpGetStatuses: () => Promise<Record<string, { state: 'disconnected' | 'connecting' | 'connected' | 'error'; error?: string; toolCount: number }>>;
        coreToolList: () => Promise<Array<{ name: string, description: string, enabled: boolean, trustLevel: 'Ask' | 'Auto' }>>;
        coreToolToggle: (toolName: string) => Promise<{ success: boolean }>;
        coreToolSetTrustLevel: (toolName: string, level: 'Ask' | 'Auto') => Promise<{ success: boolean }>;
        importSkill: (filePath: string) => Promise<{ status: 'success' | 'conflict' | 'error'; skillName?: string; targetPath?: string; sourceTempDir?: string; error?: string }>;
        importSkillConfirm: (originalPath: string, sourceTempDir: string | undefined, skillName: string, action: 'overwrite' | 'skip' | 'rename') => Promise<{ status: 'success' | 'error'; skillName?: string; error?: string }>;
        deleteSkill: (id: string) => Promise<{ success: boolean; error?: string }>;
    };

    // Scheduler Namespace
    scheduler: {
        triggerTask: (taskId: string) => Promise<{ success: boolean; finalAnswer?: string; error?: string; durationMs: number }>;
        getStatuses: () => Promise<Array<{ taskId: string; taskName: string; enabled: boolean; isRunning: boolean; lastRunAt?: number; lastRunStatus?: string; lastRunError?: string; lastRunDurationMs?: number; nextRunAt?: number }>>;
        getLogs: (taskId: string, limit?: number) => Promise<Array<{ id: string; taskId: string; taskName: string; startedAt: number; finishedAt: number; durationMs: number; status: 'success' | 'error'; output?: string; error?: string; stepCount?: number }>>;
        validateCron: (expression: string) => Promise<{ valid: boolean; error?: string; nextRuns?: string[] }>;
        deleteLogs: (taskId: string, logIds: string[]) => Promise<void>;
        deleteAllLogs: (taskId: string) => Promise<void>;
    };

    // Tray Namespace
    tray: {
        onNavigateToSettings: (callback: () => void) => () => void;
        onNewTask: (callback: () => void) => () => void;
    };

    // Staff (Digital Employee) Namespace
    staff: {
        list: () => Promise<any[]>;
        get: (id: string) => Promise<any>;
        create: (input: any) => Promise<any>;
        update: (id: string, updates: any) => Promise<any>;
        delete: (id: string) => Promise<boolean>;
        generatePrompt: (name: string, description?: string, modelId?: string) => Promise<string>;
        onGeneratePromptChunk: (callback: (delta: string) => void) => () => void;
        exportProfile: (id: string) => Promise<{ success: boolean; error?: string }>;
        importProfile: () => Promise<{ status: 'success' | 'conflict' | 'error' | 'cancel'; conflictName?: string; conflictId?: string; error?: string }>;
        confirmImport: (action: 'overwrite' | 'rename' | 'skip', conflictId?: string) => Promise<{ status: 'success' | 'error'; error?: string }>;
    };
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
