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
import { DEFAULT_SYSTEM_PROMPT } from '../../../common/defaultSystemPrompt';
import type { MemoryStore } from '../memory/MemoryStore';
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
    /** 长期记忆存储（用于分层注入） */
    memoryStore?: MemoryStore;
    /** Agent 身份定义（IDENTITY.md 内容） */
    identity?: string;
    /** Agent 人格/说话风格（SOUL.md 内容） */
    soul?: string;
    /** 用户档案（USER.md 内容） */
    userProfile?: string;
}

/**
 * Prompt 构建配置
 */
export interface PromptBuilderConfig {
    /** 默认基础 Prompt */
    defaultBasePrompt: string;
}

const DEFAULT_CONFIG: PromptBuilderConfig = {
    defaultBasePrompt: DEFAULT_SYSTEM_PROMPT
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

        // 1. Agent 身份 (IDENTITY.md)
        if (context.identity?.trim()) {
            parts.push(`<identity>\n${context.identity.trim()}\n</identity>`);
        }

        // 2. Agent 人格 (SOUL.md)
        if (context.soul?.trim()) {
            parts.push(`<soul>\n${context.soul.trim()}\n</soul>`);
        }

        // 3. 基础 Prompt (Persona)
        parts.push(this.buildPersona(context));

        // 4. 核心环境信息 (Environment Info)
        const envInfo = this.buildEnvironmentInfo(context);
        if (envInfo) {
            parts.push(envInfo);
        }

        // 5. 用户档案 (USER.md)
        if (context.userProfile?.trim()) {
            parts.push(`<user_profile>\n${context.userProfile.trim()}\n</user_profile>`);
        }

        // 6. 长期记忆 (Memory)
        const memory = this.buildMemory(context);
        if (memory) {
            parts.push(memory);
        }

        // 7. 技能摘要 (Skill Summary)
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
            lines.push(`- Workspace: ${context.workspacePath} (available context only; do not inspect or scan it unless the task requires local workspace access)`);
        }

        return lines.join('\n');
    }

    /**
     * 构建 Persona 部分
     */
    private buildPersona(context: AgentContext): string {
        const base = context.basePrompt || this.config.defaultBasePrompt;

        const langInfo = context.language === 'en'
            ? "Default user-facing language: English unless the user explicitly requests another language. Tool arguments and structured fields MUST follow each tool's schema exactly, even when schema values use a different language or fixed identifiers."
            : "Default user-facing language: Chinese unless the user explicitly requests another language. Tool arguments and structured fields MUST follow each tool's schema exactly, even when schema values use a different language or fixed identifiers.";

        if (base.includes('{{LANGUAGE_INFO}}')) {
            return base.replace('{{LANGUAGE_INFO}}', langInfo);
        }

        return `${base}\n\n[Language Instruction]\n${langInfo}`;
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
Only store durable information that is likely to improve future interactions.

**Proactive**: Save stable personal facts, durable preferences, important user decisions, and long-lived project or workflow conventions.

**Do NOT memorize**: one-off requests, temporary paths, logs, transient errors, short-lived task state, or details useful only for the current task.

**Reactive**: When the user explicitly asks you to remember something, usually call the tool. Do not store information blindly if it is clearly temporary, inappropriate for long-term storage, or highly sensitive.

**Update behavior**:
- Avoid duplicates
- Update an existing memory when the new information extends or replaces it
- Prefer newer information when old and new conflict

**Categories**:
- \`preference\`: durable user preferences
- \`workflow\`: recurring ways the user likes to work
- \`project\`: long-lived project facts or conventions
- \`fact\`: other stable facts`;

        // No memory store available — just inject instructions
        if (!context.memoryStore) {
            return `<memory>\n${instructions}\n</memory>`;
        }

        let memorySection = '';

        // Tier 1: Full-load preference memories (must be visible every turn)
        const preferences = context.memoryStore.readByCategory('preference');
        if (preferences) {
            memorySection += '\n' + preferences;
        }

        // Tier 2: Only inject titles for other categories (on-demand retrieval via memorize read)
        const otherTitles = context.memoryStore.listTitles()
            .filter(t => t.category !== 'preference');
        if (otherTitles.length > 0) {
            memorySection += '\nAdditional memories (use memorize tool with action="read" to retrieve):\n';
            for (const t of otherTitles) {
                memorySection += `- ${t.title} [${t.category || 'fact'}]\n`;
            }
        }

        return `<memory>\n${instructions}${memorySection}\n</memory>`;
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
