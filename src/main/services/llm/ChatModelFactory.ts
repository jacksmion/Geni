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

    // Anthropic 使用独立的适配器
    if (normalizedId === 'anthropic') {
        return new AnthropicAdapter(config);
    }

    // 其他使用 OpenAI 兼容接口
    return new OpenAIAdapter(config);
}

/**
 * ChatModelManager - 管理多个 LLM 适配器实例
 * 
 * 用于在运行时动态切换模型提供商
 */
export class ChatModelManager {
    private adapters = new Map<string, IChatModel>();
    private configs = new Map<string, ChatModelConfig>();

    /**
     * 注册提供商配置
     */
    registerProvider(providerId: string, config: ChatModelConfig): void {
        this.configs.set(providerId.toLowerCase(), config);
        // 清除缓存的适配器，下次获取时重新创建
        this.adapters.delete(providerId.toLowerCase());
    }

    /**
     * 获取指定提供商的 ChatModel 实例
     * 
     * @param providerId - 提供商标识符
     * @returns IChatModel 实例，如果未注册则返回 null
     */
    getModel(providerId: string): IChatModel | null {
        const normalizedId = providerId.toLowerCase();

        // 检查缓存
        if (this.adapters.has(normalizedId)) {
            return this.adapters.get(normalizedId)!;
        }

        // 检查配置
        const config = this.configs.get(normalizedId);
        if (!config) {
            return null;
        }

        // 创建适配器并缓存
        const adapter = createChatModel(providerId, config);
        this.adapters.set(normalizedId, adapter);
        return adapter;
    }

    /**
     * 检查提供商是否已注册
     */
    hasProvider(providerId: string): boolean {
        return this.configs.has(providerId.toLowerCase());
    }

    /**
     * 获取所有已注册的提供商 ID
     */
    getRegisteredProviders(): string[] {
        return Array.from(this.configs.keys());
    }

    /**
     * 移除提供商
     */
    removeProvider(providerId: string): void {
        const normalizedId = providerId.toLowerCase();
        this.configs.delete(normalizedId);
        this.adapters.delete(normalizedId);
    }

    /**
     * 清除所有缓存的适配器 (配置保留)
     */
    clearCache(): void {
        this.adapters.clear();
    }
}

// 导出单例管理器 (可选使用)
export const chatModelManager = new ChatModelManager();
