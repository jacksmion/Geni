// 单个模型实例的配置
export interface ModelInstance {
    id: string;          // 唯一标识 (uuid/random)
    label: string;       // 别名 (如 "GPT-4o 顶配")
    model: string;       // 实际模型 ID (如 "gpt-4o")
    temperature: number; // 独立温度参数
    enabled: boolean;    // 是否开启
    supportVision?: boolean; // 是否支持图像输入
    contextWindow?: number; // 预留：上下文窗口大小
    maxOutput?: number;     // 预留：最大输出 token
}

// 单个提供商的配置
export interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
    enabled?: boolean;   // 是否在提供商列表中启用

    // 多模型支持
    models: ModelInstance[];
    activeModelId?: string;

    // 旧字段兼容 (Migration 之后可清理)
    model?: string;
    temperature?: number;
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

// Telegram 配置
export interface TelegramConfig {
    enabled: boolean;
    token: string;
    proxyUrl?: string;
}

// 企业微信 (WeCom) 企业机器人配置
export interface WeComConfig {
    enabled: boolean;
    botId: string;
    secret: string;
}

// 飞书 (Lark) 自建应用配置
export interface LarkConfig {
    enabled: boolean;
    appId: string;
    appSecret: string;
    verificationToken?: string;
    encryptKey?: string;
}

// 定时任务配置
export interface ScheduledTaskConfig {
    id: string;                    // 唯一标识
    name: string;                  // 任务名称
    enabled: boolean;              // 是否启用
    prompt: string;                // 发给 LLM 的 prompt
    cronExpression: string;        // cron 表达式

    // 可选覆盖项
    provider?: string;             // 覆盖使用的 LLM provider（默认使用全局）
    model?: string;                // 覆盖使用的 model
    enableTools?: boolean;         // 是否允许使用工具（默认 true）

    // 上下文管理
    keepHistory?: boolean;         // 是否保留历史对话（默认 false）
    maxHistoryTurns?: number;      // 最大保留轮数（默认 10）
}

export interface AppSettings {
    llm: LLMSettings;
    skillSettings: Record<string, SkillState>; // 技能ID -> 状态
    mcpServers: IMcpServerConfig[]; // Added MCP servers list
    coreToolSettings?: Record<string, McpToolSetting>; // Built-in tools settings
    workspacePath: string; // 当前工作空间路径
    theme: 'dark' | 'light' | 'system';
    accentColor: 'indigo' | 'emerald' | 'blue' | 'rose' | 'orange' | 'violet';
    language: 'zh' | 'en'; // 语言设置
    autoStart: boolean; // 开机自启动
    systemPrompt?: string; // 全局系统提示词
    telegram?: TelegramConfig; // Telegram Bot 配置
    wecom?: WeComConfig; // 企业微信配置
    lark?: LarkConfig; // 飞书配置
    scheduledTasks?: ScheduledTaskConfig[]; // 定时任务配置
    recentWorkspaces?: string[]; // 最近打开的工作目录历史记录
    shortcuts?: Record<string, string>; // 快捷键配置 ID -> Key Combination
    autoOpenArtifact: boolean; // 是否自动打开 Artifact 面板
}

// 默认的提供商配置
// ... (lines 101-196 remain same)
export const DEFAULT_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
    'OpenAI': {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        enabled: false,
        activeModelId: 'gpt-5.2',
        models: [
            { id: 'gpt-5.2', label: 'GPT-5.2', model: 'gpt-5.2', temperature: 0.7, enabled: true },
            { id: 'gpt-4o', label: 'GPT-4o', model: 'gpt-4o', temperature: 0.7, enabled: true },
        ]
    },
    'Anthropic': {
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: '',
        enabled: false,
        activeModelId: 'claude-4-6-sonnet',
        models: [
            { id: 'claude-4-6-sonnet', label: 'Claude 4.6 Sonnet', model: 'claude-4-6-sonnet', temperature: 0.7, enabled: true },
            { id: 'claude-4-6-opus', label: 'Claude 4.6 Opus', model: 'claude-4-6-opus', temperature: 0.7, enabled: true },
        ]
    },
    'DeepSeek': {
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        enabled: false,
        activeModelId: 'deepseek-v3.2',
        models: [
            { id: 'deepseek-v3.2', label: 'DeepSeek V3.2', model: 'deepseek-v3.2', temperature: 0.7, enabled: true },
            { id: 'deepseek-chat', label: 'DeepSeek Chat', model: 'deepseek-chat', temperature: 0.7, enabled: true },
        ]
    },
    'ZhipuAI': {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: '',
        enabled: false,
        activeModelId: 'glm-4',
        models: [
            { id: 'glm-4', label: 'GLM-4', model: 'glm-4', temperature: 0.7, enabled: true },
        ]
    },
    'Volcengine': {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: '',
        enabled: false,
        activeModelId: 'doubao-pro-4k',
        models: [
            { id: 'doubao-pro-4k', label: 'Doubao Pro 4K', model: 'doubao-pro-4k', temperature: 0.7, enabled: true },
        ]
    },
    'Qwen': {
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: '',
        enabled: false,
        activeModelId: 'qwen-3.5',
        models: [
            { id: 'qwen-3.5', label: 'Qwen 3.5', model: 'qwen-3.5', temperature: 0.7, enabled: true },
            { id: 'qwen-3', label: 'Qwen 3', model: 'qwen-3', temperature: 0.7, enabled: true },
        ]
    },
    'MiniMax': {
        baseUrl: 'https://api.minimax.chat/v1',
        apiKey: '',
        enabled: false,
        activeModelId: 'minimax-m2.5',
        models: [
            { id: 'minimax-m2.5', label: 'MiniMax M2.5', model: 'minimax-m2.5', temperature: 1.0, enabled: true },
        ]
    },
    'Ollama': {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        enabled: false,
        activeModelId: 'llama3',
        models: [
            { id: 'llama3', label: 'Llama 3', model: 'llama3:latest', temperature: 0.7, enabled: true },
        ]
    },
    'LM Studio': {
        baseUrl: 'http://localhost:1234/v1',
        apiKey: '',
        enabled: false,
        activeModelId: 'local-model',
        models: [
            { id: 'local-model', label: 'Local Model', model: 'local-model', temperature: 0.7, enabled: true },
        ]
    },
    'Local': {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        enabled: false,
        activeModelId: 'llama3',
        models: [
            { id: 'llama3', label: 'Llama 3', model: 'llama3:latest', temperature: 0.7, enabled: true },
        ]
    },
};

export const DEFAULT_SETTINGS: AppSettings = {
    llm: {
        activeProvider: 'OpenAI',
        providers: { ...DEFAULT_PROVIDER_CONFIGS },
    },
    skillSettings: {}, // 技能状态默认为空，将在加载技能时填充
    mcpServers: [], // Default empty list
    coreToolSettings: {}, // Default empty list
    workspacePath: '', // 将在运行时初始化或由用户选择
    theme: 'dark',
    accentColor: 'indigo',
    language: 'zh',
    autoStart: false,
    telegram: {
        enabled: false,
        token: '',
        proxyUrl: '',
    },
    wecom: {
        enabled: false,
        botId: '',
        secret: '',
    },
    lark: {
        enabled: false,
        appId: '',
        appSecret: '',
    },
    scheduledTasks: [],
    recentWorkspaces: [],
    shortcuts: {
        'new_task': 'Ctrl+N',
        'search_task': 'Ctrl+F',
        'open_settings': 'Ctrl+,',
        'toggle_sidebar': 'Ctrl+B'
    },
    autoOpenArtifact: true
};
