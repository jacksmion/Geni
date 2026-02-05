export interface LLMSettings {
    provider: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
}

export interface AppSettings {
    llm: LLMSettings;
    theme: 'dark' | 'light' | 'system';
}

export const DEFAULT_SETTINGS: AppSettings = {
    llm: {
        provider: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o',
        temperature: 0.7,
    },
    theme: 'dark',
};
