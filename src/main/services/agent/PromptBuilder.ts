/**
 * PromptBuilder.ts - System Prompt 构建器
 * 
 * Phase 1.2 实现: 将 System Prompt 构建逻辑从 AgentRuntime 解耦
 * 
 * 负责:
 * - 注入 Persona (System Instruction)
 * - 注入 Time/OS/CWD (Environment Info)
 * - 注入 Skill Summary (从 Context 中获取 enabled skills)
 * - 注入 Methodology (CoT 指引)
 */

import { Skill } from '../../../common/types/skill';

/**
 * Agent 上下文信息，用于构建 System Prompt
 */
export interface AgentContext {
    /** 基础 System Prompt */
    basePrompt?: string;
    /** 工作目录 */
    workspacePath?: string;
    /** 启用的技能列表 */
    skills?: Skill[];
    /** 自定义环境变量 */
    customEnvironment?: Record<string, string>;
    /** 是否包含方法论指引 */
    includeMethodology?: boolean;
}

/**
 * Prompt 构建配置
 */
export interface PromptBuilderConfig {
    /** 默认基础 Prompt */
    defaultBasePrompt: string;
    /** 是否默认包含方法论 */
    defaultIncludeMethodology: boolean;
}

const DEFAULT_CONFIG: PromptBuilderConfig = {
    defaultBasePrompt: 'You are a helpful assistant capable of using tools.',
    defaultIncludeMethodology: true
};

/**
 * PromptBuilder - 系统提示词构建器
 * 
 * 将复杂的 System Prompt 构建逻辑集中管理，
 * 使 AgentRuntime 更专注于执行循环逻辑
 */
export class PromptBuilder {
    private config: PromptBuilderConfig;

    constructor(config?: Partial<PromptBuilderConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 构建完整的 System Prompt
     * 
     * @param context Agent 上下文信息
     * @returns 构建完成的 System Prompt 字符串
     */
    buildSystemPrompt(context: AgentContext): string {
        const parts: string[] = [];

        // 1. 基础 Prompt (Persona)
        parts.push(this.buildPersona(context));

        // 2. 方法论指引 (Methodology/CoT)
        if (context.includeMethodology ?? this.config.defaultIncludeMethodology) {
            parts.push(this.buildMethodology());
        }

        // 3. 环境信息 (Environment Info)
        parts.push(this.buildEnvironmentInfo(context));

        // 4. 技能摘要 (Skill Summary)
        const skillSummary = this.buildSkillSummary(context);
        if (skillSummary) {
            parts.push(skillSummary);
        }

        return parts.join('\n\n');
    }

    /**
     * 构建 Persona 部分
     */
    private buildPersona(context: AgentContext): string {
        return context.basePrompt || this.config.defaultBasePrompt;
    }

    /**
     * 构建方法论指引 (Chain of Thought)
     */
    private buildMethodology(): string {
        return `[Methodology]:
1. **Think**: Before using any tool, you MUST explain your reasoning and plan in a brief thought.
2. **Act**: Call the appropriate tool.
3. **Observe**: Analyze the tool output.
4. **Reflect**: If an error occurs, analyze why and correct your approach.`;
    }

    /**
     * 构建环境信息
     */
    private buildEnvironmentInfo(context: AgentContext): string {
        const now = new Date();
        const lines = [
            '[Environment Info]:',
            `- Current Time: ${now.toLocaleString()}`,
            `- OS: ${process.platform}`,
            `- Working Directory: ${context.workspacePath || process.cwd()}`
        ];

        // 注入自定义环境变量
        if (context.customEnvironment) {
            for (const [key, value] of Object.entries(context.customEnvironment)) {
                lines.push(`- ${key}: ${value}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * 构建技能摘要
     * 
     * 采用渐进式加载策略：
     * - 仅在 System Prompt 中注入技能摘要（名称+描述）
     * - 完整内容通过 load_skill 工具懒加载
     */
    private buildSkillSummary(context: AgentContext): string | null {
        if (!context.skills || context.skills.length === 0) {
            return null;
        }

        const enabledSkills = context.skills.filter(s => s.enabled);
        if (enabledSkills.length === 0) {
            return null;
        }

        const skillList = enabledSkills
            .map(s => `- **${s.id}**: ${s.description}`)
            .join('\n');

        return `<skills>
You have access to the following skills:

${skillList}

**Important**: When you need to apply a skill's methodology, use the \`load_skill\` tool to load its full instructions and discover its associated resources first.
</skills>`;
    }

    /**
     * 更新配置
     */
    updateConfig(config: Partial<PromptBuilderConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

// 导出单例实例（可选使用）
export const defaultPromptBuilder = new PromptBuilder();
