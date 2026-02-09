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

// 技能状态配置
export interface SkillState {
    enabled: boolean;
    trustLevel: 'Ask' | 'Auto';
}

// MCP Tool specific configuration
export interface McpToolSetting {
    enabled: boolean;
    trustLevel: 'Ask' | 'Auto';
}

// MCP Server Configuration
export interface IMcpServerConfig {
    id: string;
    type: 'stdio' | 'sse'; // Transport type
    command?: string; // For stdio
    args?: string[];  // For stdio
    url?: string;     // For sse
    apiKey?: string;  // For sse auth
    env?: Record<string, string>;
    enabled: boolean;
    toolSettings?: Record<string, McpToolSetting>; // [originalToolName] -> settings
}

export interface AppSettings {
    llm: LLMSettings;
    skillSettings: Record<string, SkillState>; // 技能ID -> 状态
    mcpServers: IMcpServerConfig[]; // Added MCP servers list
    workspacePath: string; // 当前工作空间路径
    theme: 'dark' | 'light' | 'system';
    accentColor: 'indigo' | 'emerald' | 'blue' | 'rose' | 'orange' | 'violet';
}

// 默认的提供商配置
export const DEFAULT_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
    'OpenAI': {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-3.5-turbo',
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
    skillSettings: {}, // 技能状态默认为空，将在加载技能时填充
    mcpServers: [], // Default empty list
    workspacePath: '', // 将在运行时初始化或由用户选择
    theme: 'dark',
    accentColor: 'indigo',
};
