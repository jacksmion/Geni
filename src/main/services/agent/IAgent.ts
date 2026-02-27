/**
 * IAgent.ts - Agent 核心接口和类型定义
 */

import { ITool } from '../../../common/types/tool';
import { Skill } from '../../../common/types/skill';
import { AppSettings } from '../../../common/types/settings';
import { ChatMessage, AgentStep } from '../../../common/types/chat';

export interface AgentRunOptions {
    model?: string;
    temperature?: number;
    systemPrompt?: string;
    skills?: Skill[];
    history?: ChatMessage[];
    signal?: AbortSignal;
}

// Re-export AgentStep from common (Single Source of Truth)
export type { AgentStep } from '../../../common/types/chat';

export interface AgentRunResult {
    finalAnswer: string;
    steps: AgentStep[];
    newMessages?: ChatMessage[];
}

export interface IAgentService {
    run(
        prompt: string,
        tools: ITool[],
        options?: AgentRunOptions,
        onStream?: (chunk: string, reset?: boolean) => void,
        onStepUpdate?: (steps: any[]) => void
    ): Promise<AgentRunResult>;

    updateSettings(settings: AppSettings): void;
}

export type { IAgentService as IAgent };
