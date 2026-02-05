import { ITool } from '../../../common/types/tool';

export interface AgentRunOptions {
    model?: string;
    temperature?: number;
    systemPrompt?: string;
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
}
