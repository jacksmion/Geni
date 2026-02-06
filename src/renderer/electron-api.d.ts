import { Skill } from '../common/types/skill';

export interface IElectronAPI {
    ping: () => Promise<string>;
    getSkills: () => Promise<Skill[]>;
    toggleSkill: (id: string) => Promise<Skill[]>;
    setTrustLevel: (id: string, level: 'Ask' | 'Auto') => Promise<Skill[]>;
    sendMessage: (text: string, history?: any[]) => Promise<{ finalAnswer: string, steps: any[] }>;
    abortRequest: () => Promise<boolean>;
    getAppSettings: () => Promise<any>;
    saveAppSettings: (settings: any) => Promise<boolean>;
    mcpConnect: (config: { id: string, command?: string, args?: string[], type?: 'stdio' | 'sse', url?: string, apiKey?: string }) => Promise<{ success: boolean, error?: string }>;
    mcpListTools: () => Promise<Array<{ name: string, description: string }>>;
    onReplyStream: (callback: (chunk: string) => void) => () => void;
    onReplyTrace: (callback: (steps: any[]) => void) => () => void;
    selectDirectory: () => Promise<string | null>;
    selectFile: () => Promise<string | null>;

    getSessionList: () => Promise<any[]>;
    getSessionMessages: (id: string) => Promise<any[]>;
    saveSession: (session: any) => Promise<boolean>;
    deleteSession: (id: string) => Promise<boolean>;
    openExplorer: (path: string) => Promise<void>;
}


declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
