import { ITool } from '../../../common/types/tool';
import { Skill } from '../../../common/types/skill';
import { AppSettings } from '../../../common/types/settings';

export interface AgentRunOptions {
    model?: string;
    temperature?: number;
    systemPrompt?: string;
    skills?: Skill[]; // 启用的技能列表，其内容将注入 System Prompt
    signal?: AbortSignal;
}

export interface AgentRunResult {
    finalAnswer: string;
    steps: any[]; // To be rigorously typed later
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
        onStream?: (chunk: string) => void,
        onStepUpdate?: (steps: any[]) => void
    ): Promise<AgentRunResult>;

    /**
     * Update settings dynamically
     */
    updateSettings(settings: AppSettings): void;
}
