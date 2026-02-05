import { Skill } from '../common/types/skill';

export interface IElectronAPI {
    ping: () => Promise<string>;
    getSkills: () => Promise<Skill[]>;
    toggleSkill: (id: string) => Promise<Skill[]>;
    setTrustLevel: (id: string, level: 'Ask' | 'Auto') => Promise<Skill[]>;
    sendMessage: (text: string) => Promise<{ finalAnswer: string, steps: any[] }>;
    getAppSettings: () => Promise<any>;
    saveAppSettings: (settings: any) => Promise<boolean>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
