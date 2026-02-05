import { Skill } from '../common/types/skill';

export interface IElectronAPI {
    ping: () => Promise<string>;
    getSkills: () => Promise<Skill[]>;
    toggleSkill: (id: string) => Promise<Skill[]>;
    setTrustLevel: (id: string, level: 'Ask' | 'Auto') => Promise<Skill[]>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
