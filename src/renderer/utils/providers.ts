import {
    OpenAIIcon, AnthropicIcon, DeepSeekIcon, ZhipuIcon,
    MiniMaxIcon, QwenIcon, OllamaIcon, VolcengineIcon,
} from '../components/icons/providers'

export interface ProviderMeta {
    icon: React.ComponentType<{ size?: number; className?: string }>
    color: string
    label: string
}

/**
 * Provider 展示元数据（图标、颜色、显示名称）。
 * 供 ModelSelector 和其他需要展示 provider 信息的组件共享使用。
 */
export const PROVIDER_DISPLAY: Record<string, ProviderMeta> = {
    'OpenAI':      { icon: OpenAIIcon,      color: '#10a37f', label: 'OpenAI' },
    'Anthropic':   { icon: AnthropicIcon,   color: '#d97757', label: 'Anthropic' },
    'DeepSeek':    { icon: DeepSeekIcon,    color: '#4d6df1', label: 'DeepSeek' },
    'ZhipuAI':     { icon: ZhipuIcon,       color: '#343b4d', label: '智谱 AI' },
    'Volcengine':  { icon: VolcengineIcon,   color: '#ff4d4f', label: '火山引擎' },
    'Qwen':        { icon: QwenIcon,         color: '#6340ff', label: '通义千问' },
    'MiniMax':     { icon: MiniMaxIcon,      color: '#ff7a00', label: 'MiniMax' },
    'Ollama':      { icon: OllamaIcon,       color: '#444444', label: 'Ollama' },
}
