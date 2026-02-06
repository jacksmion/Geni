/**
 * IAgent.ts - Agent 核心接口定义
 * 
 * 重构说明: 
 * - 原文件: IAgentService.ts
 * - 此文件定义 Agent 运行时的核心接口和类型
 * 
 * @deprecated v2.1 架构重构中，此接口将逐步演化为更细粒度的接口:
 *  - IChatModel (认知层)
 *  - IAgentRuntime (运行时)
 */

import { ITool } from '../../../common/types/tool';
import { Skill } from '../../../common/types/skill';
import { AppSettings } from '../../../common/types/settings';
import { ChatMessage } from '../llm/IChatModel';

export interface AgentRunOptions {
    model?: string;
    temperature?: number;
    systemPrompt?: string;
    skills?: Skill[]; // 启用的技能列表，其内容将注入 System Prompt
    history?: ChatMessage[]; // 对话历史
    signal?: AbortSignal;
}

export interface AgentStep {
    thought: string;
    tool: string;
    toolInput: string;
    observation?: string;
    isComplete: boolean;
    duration?: number;
}

export interface AgentRunResult {
    finalAnswer: string;
    steps: AgentStep[];
}

export interface IAgentService {
    /**
     * The core loop: 
     * Prompt -> LLM -> Tool Call -> Tool Exec -> LLM -> Final Answer
     */
    run(
        prompt: string,
        tools: ITool[],
        options?: AgentRunOptions,
        onStream?: (chunk: string, reset?: boolean) => void,
        onStepUpdate?: (steps: any[]) => void
    ): Promise<AgentRunResult>;

    /**
     * Update settings dynamically
     */
    updateSettings(settings: AppSettings): void;
}

// Re-export for backward compatibility
export type { IAgentService as IAgent };
