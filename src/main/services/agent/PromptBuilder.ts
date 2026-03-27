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
import os from 'os';

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
    /** 工作语言 */
    language?: 'zh' | 'en';
    /** 长期记忆内容（由上层传入） */
    memory?: string;
}

/**
 * Prompt 构建配置
 */
export interface PromptBuilderConfig {
    /** 默认基础 Prompt */
    defaultBasePrompt: string;
}

const DEFAULT_CONFIG: PromptBuilderConfig = {
    defaultBasePrompt: `You are Geni, a highly efficient, autonomous general-purpose AI agent.
You excel at complex problem-solving, comprehensive research, data analysis, system operations, and programming.

## Core Guidelines
- Formatting: Speak naturally. Avoid using pure list and bullet-point formats.

## Tone and style
- Anything you say outside of tool use is shown to the user. Do not narrate abstractly; explain what you are doing and why, using plain language.
- Keep your response language consistent with the user's input language by default. Only switch languages when the user explicitly requests a different language.
- When writing a final assistant response, state the solution first before explaining your answer. The complexity of the answer should match the task. If the task is simple, your answer should be short. When you make big or complex changes, walk the user through what you did and why.

## Responsiveness
### Collaboration posture:
- If the user makes a simple request (such as asking for the time) which you can fulfill by running a terminal command (such as date), you should do so.

## Operational Best Practices
- Utilize your tools to interact with the system, fetch data, and orchestrate complex workflows step-by-step.
- File Creation: Use \`write\` for new small/medium files. For large files (>100 lines), use chunked writing: split content evenly into multiple calls with \`chunk_index\` (0-based) and set \`is_last_chunk: true\` on the final call to commit atomically.
- File Updates: For existing files, ALWAYS prefer \`edit\` to perform surgical updates unless a complete rewrite is necessary.

## Task Management
- Use \`todowrite\` and \`todoread\` to track progress on multi-step tasks or complex research.
- Do NOT use Todo tools for simple Q&A, explanations, or quick single-step operations.
- Break complex goals into concrete, actionable steps. Mark tools 'in_progress' and 'completed' as you work.`
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

        // 2. 核心环境信息 (Environment Info)
        const envInfo = this.buildEnvironmentInfo(context);
        if (envInfo) {
            parts.push(envInfo);
        }

        // 3. 长期记忆 (Memory)
        const memory = this.buildMemory(context);
        if (memory) {
            parts.push(memory);
        }

        // 4. 技能摘要 (Skill Summary)
        const skillSummary = this.buildSkillSummary(context);
        if (skillSummary) {
            parts.push(skillSummary);
        }

        return parts.join('\n\n');
    }

    /**
     * 构建核心环境信息
     */
    private buildEnvironmentInfo(context: AgentContext): string {
        const lines: string[] = ['[System Environment]'];
        lines.push(`- OS: ${os.platform()}`);

        // Use YYYY-MM-DD format for date to avoid invalidating cache too frequently
        // while still providing day-level context for git/file operations.
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        lines.push(`- Current Date: ${yyyy}-${mm}-${dd}`);

        if (context.workspacePath) {
            lines.push(`- Workspace: ${context.workspacePath}`);
        }

        return lines.join('\n');
    }

    /**
     * 构建 Persona 部分
     */
    private buildPersona(context: AgentContext): string {
        const base = context.basePrompt || this.config.defaultBasePrompt;

        const langInfo = context.language === 'en'
            ? "English (unless explicitly specified). All inner thoughts, reasoning, and tool arguments MUST be in English."
            : "Chinese (unless explicitly specified). All inner thoughts, reasoning, and tool arguments MUST be in Chinese.";

        return base.replace('{{LANGUAGE_INFO}}', langInfo);
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
     * 构建长期记忆部分
     * 
     * 始终注入使用指引，确保 Agent 知道 memorize 工具的存在。
     * 有已存在记忆时追加内容，包含 token 预算保护。
     */
    private buildMemory(context: AgentContext): string {
        const instructions = `You have a \`memorize\` tool for persisting long-term memories across sessions.
**Proactive**: Automatically detect and save these WITHOUT being asked:
- Personal facts: name, age, occupation, work history, life events
- Preferences: tech choices, communication style, tool/format preferences
- Important decisions: key judgments or choices the user has made
**Reactive**: When a user explicitly asks you to remember something, ALWAYS call the tool. Never just verbally acknowledge.
**Rules**: Do NOT memorize trivial info (one-off questions, temp paths). Check existing memories to avoid duplicates — update existing entries instead of creating new ones.`;

        if (!context.memory) {
            return `<memory>\n${instructions}\n</memory>`;
        }

        const MAX_MEMORY_CHARS = 8000; // ≈ 2000 tokens
        let content = context.memory;
        if (content.length > MAX_MEMORY_CHARS) {
            content = this.truncateMemory(content, MAX_MEMORY_CHARS);
        }

        return `<memory>\n${instructions}\n\n${content}\n</memory>`;
    }

    /**
     * 截断记忆内容，保留最后（最新）的条目
     */
    private truncateMemory(content: string, maxChars: number): string {
        // 按条目分割，保留最新的（靠后的）
        const entries = content.split(/(?=<!-- memory:)/).filter(Boolean);
        const result: string[] = [];
        let totalLen = 0;

        // 从后往前遍历，优先保留最新条目
        for (let i = entries.length - 1; i >= 0; i--) {
            if (totalLen + entries[i].length > maxChars) break;
            result.unshift(entries[i]);
            totalLen += entries[i].length;
        }

        return result.join('').trim();
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
