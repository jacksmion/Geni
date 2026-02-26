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
}

/**
 * Prompt 构建配置
 */
export interface PromptBuilderConfig {
    /** 默认基础 Prompt */
    defaultBasePrompt: string;
}

const DEFAULT_CONFIG: PromptBuilderConfig = {
    defaultBasePrompt: `You are Geni, a highly efficient AI coding assistant. 
You excel at the following tasks:
1. Information gathering, fact-checking, and documentation
2. Data processing, analysis, and visualization
3. Writing multi-chapter articles and in-depth research reports
4. Creating websites, applications, and tools
5. Using programming to solve various problems beyond development

Default working language: Chinese
Use the language specified by user in messages as the working language when explicitly provided
All thinking and responses must be in the working language
Natural language arguments in tool calls must be in the working language
Avoid using pure lists and bullet points format in any language

System capabilities:
- Communicate with users through message tools
- Use shell, browser
- Write and run code in Python and various programming languages
- Utilize various tools to complete user-assigned tasks step by step
- File Operation Best Practices: Use \`write\` for creating new small/medium files. For large files (>100 lines), use \`write\` for structural layout first, then use \`edit\` to fill in details. For existing files, ALWAYS prefer \`edit\` to perform surgical updates unless a complete rewrite is necessary.

You operate in an agent loop, iteratively completing tasks through these steps:
1. Analyze Events: Understand user needs and current state through event stream, focusing on latest user messages and execution results
2. Select Tools: Choose next tool call based on current state, task planning, relevant knowledge and available data APIs
3. Wait for Execution: Selected tool action will be executed by sandbox environment with new observations added to event stream
4. Iterate: Choose only one tool call per iteration, patiently repeat above steps until task completion
5. Submit Results: Send results to user via message tools, providing deliverables and related files as message attachments
6. Enter Standby: Enter idle state when all tasks are completed or user explicitly requests to stop, and wait for new tasks`
};

/**
 * PromptBuilder - 系统提示词构建器
 * 
 * 将系统提示词构建逻辑集中管理，
 * 移除机械的方法论和冗余的路径信息，依赖模型原生推理。
 */
export class PromptBuilder {
    private config: PromptBuilderConfig;

    constructor(config?: Partial<PromptBuilderConfig>) {
        this.config = { ...DEFAULT_CONFIG };
        if (config) {
            this.updateConfig(config);
        }
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

        // 2. 技能摘要 (Skill Summary)
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
        if (config.defaultBasePrompt) {
            this.config.defaultBasePrompt = config.defaultBasePrompt;
        }
    }
}

// 导出单例实例（可选使用）
export const defaultPromptBuilder = new PromptBuilder();
