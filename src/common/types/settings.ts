// 单个提供商的配置
export interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
}

// LLM 配置：当前激活的提供商 + 每个提供商的独立配置
export interface LLMSettings {
    activeProvider: string;
    providers: Record<string, ProviderConfig>;
}

export interface AppSettings {
    llm: LLMSettings;
    theme: 'dark' | 'light' | 'system';
}

// 默认的提供商配置
export const DEFAULT_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
    'OpenAI': {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o',
        temperature: 0.7,
    },
    'Anthropic': {
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: '',
        model: 'claude-3-5-sonnet-latest',
        temperature: 0.7,
    },
    'DeepSeek': {
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-chat',
        temperature: 0.7,
    },
    'Local': {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        model: 'llama3:latest',
        temperature: 0.7,
    },
};

export const DEFAULT_SETTINGS: AppSettings = {
    llm: {
        activeProvider: 'OpenAI',
        providers: { ...DEFAULT_PROVIDER_CONFIGS },
    },
    theme: 'dark',
};
