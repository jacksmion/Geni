
import { Skill } from '../common/types/skill';

export interface IElectronAPI {
    // Agent Namespace
    agent: {
        start: (payload: { sessionId?: string, prompt: string, options?: any }) => Promise<{ success: boolean, error?: string }>;
        stop: (sessionId?: string) => Promise<void>;
        getState: () => Promise<string>;
        onStream: (callback: (chunk: string, reset?: boolean) => void) => () => void;
        onStepUpdate: (callback: (steps: any[]) => void) => () => void;
        onStateChange: (callback: (state: any) => void) => () => void;
        onError: (callback: (error: any) => void) => () => void;
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
    };

    // System Namespace
    system: {
        getSettings: () => Promise<any>;
        saveSettings: (settings: any) => Promise<boolean>;
        selectFile: () => Promise<string | null>;
        selectDirectory: () => Promise<string | null>;
        openExplorer: (path: string) => Promise<void>;
        testLLM: (config: { apiKey: string, baseUrl: string, model: string }) => Promise<{ success: boolean, message: string }>;
    };

    // Tool Namespace
    tools: {
        getSkills: () => Promise<Skill[]>;
        toggleSkill: (id: string) => Promise<Skill[]>;
        setTrustLevel: (id: string, level: 'Ask' | 'Auto') => Promise<Skill[]>;
        mcpConnect: (config: any) => Promise<{ success: boolean, error?: string }>;
        mcpListTools: () => Promise<Array<{ name: string, description: string }>>;
    };
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
