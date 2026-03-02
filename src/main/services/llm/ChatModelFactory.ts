/**
 * ChatModelFactory.ts - LLM 适配器工厂
 * 
 * Phase 2: 认知层抽象
 * 
 * 功能:
 * - 根据提供商 ID 创建对应的 IChatModel 实例
 * - 统一管理所有 LLM 适配器
 */

import { IChatModel, ChatModelConfig } from './IChatModel';
import { OpenAIAdapter } from './providers/OpenAIAdapter';
import { AnthropicAdapter } from './providers/AnthropicAdapter';

/**
 * 支持的 LLM 提供商
 */
export type SupportedProvider = 'openai' | 'anthropic' | 'deepseek' | 'local' | 'openai-compatible';

/**
 * 提供商配置映射
 */
export interface ProviderConfigMap {
    openai: ChatModelConfig;
    anthropic: ChatModelConfig;
    deepseek: ChatModelConfig;
    local: ChatModelConfig;
    'openai-compatible': ChatModelConfig;
}

/**
 * 判断是否使用 OpenAI 兼容接口
 * 
 * DeepSeek、Local (Ollama) 等提供商使用 OpenAI 兼容 API
 */
function isOpenAICompatible(providerId: string): boolean {
    const openAICompatibleProviders = [
        'openai',
        'deepseek',
        'local',
        'openai-compatible',
    ];
    return openAICompatibleProviders.includes(providerId.toLowerCase());
}

/**
 * 规范化提供商 ID
 */
function normalizeProviderId(providerId: string): SupportedProvider {
    const normalized = providerId.toLowerCase();

    switch (normalized) {
        case 'openai':
            return 'openai';
        case 'anthropic':
        case 'claude':
            return 'anthropic';
        case 'deepseek':
            return 'deepseek';
        case 'local':
        case 'ollama':
            return 'local';
        default:
            // 默认使用 OpenAI 兼容接口
            return 'openai-compatible';
    }
}

/**
 * ChatModel 缓存字典 (避免重复实例化导致的 TCP/TLS 握手延时)
 */
const modelCache = new Map<string, IChatModel>();

/**
 * 创建 ChatModel 实例
 * 
 * @param providerId - 提供商标识符 (例如: 'openai', 'anthropic', 'deepseek')
 * @param config - 模型配置
 * @returns IChatModel 实例
 */
export function createChatModel(
    providerId: string,
    config: ChatModelConfig
): IChatModel {
    const normalizedId = normalizeProviderId(providerId);

    // 构建 Cache Key (只有实质性配置参数变更才新建)
    const cacheKey = `${normalizedId}:${config.apiKey || ''}:${config.baseUrl || ''}:${config.model || ''}:${config.temperature || 0}`;

    if (modelCache.has(cacheKey)) {
        return modelCache.get(cacheKey)!;
    }

    let model: IChatModel;

    // Anthropic 使用独立的适配器
    if (normalizedId === 'anthropic') {
        model = new AnthropicAdapter(config);
    } else {
        // 其他使用 OpenAI 兼容接口
        model = new OpenAIAdapter(config);
    }

    // 将新实例加入缓存
    modelCache.set(cacheKey, model);
    return model;
}
