/**
 * Agent 类型定义 — 内部执行层使用的类型
 */

import type { ChatMessage, ContentPart, AgentStep } from '../../../common/types/chat';

// ============================================================================
// AgentEvent — 内部执行层事件类型
// ============================================================================

export type AgentEvent =
    | { type: 'turn_start'; payload: { turnIndex: number; resetStream: boolean } }
    | { type: 'message_delta'; payload: { delta: string } }
    | { type: 'reasoning_delta'; payload: { delta: string } }
    | { type: 'tool_start'; payload: AgentStep }
    | { type: 'tool_end'; payload: AgentStep }
    | { type: 'auth_request'; payload: { runId: string; requestId: string; toolName: string; args: any; reason: string } }
    | { type: 'agent_end'; payload: { totalSteps: number; newMessages: ChatMessage[] } }
    | { type: 'turn_end'; payload: { turnIndex: number; hadToolCalls: boolean } }
    | { type: 'error'; payload: { message: string; code?: string } };

// ============================================================================
// AgentRunRequest / AgentRunResult
// ============================================================================

export interface AgentRunRequest {
    sessionId?: string;
    prompt: string | ContentPart[];
    /** 不传 history — Runtime 内部通过 sessionId 加载 */
    signal?: AbortSignal;
    emit?: (event: AgentEvent) => void;

    /** 运行时覆盖（覆盖 Agent 配置默认值） */
    skillIds?: string[];
    toolNames?: string[];
}

export interface AgentRunResult {
    finalAnswer: string;
    steps: AgentStep[];
    newMessages: ChatMessage[];
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 从多模态 prompt 中提取文本内容，用于知识记忆检索
 */
export function extractTextFromPrompt(prompt: string | ContentPart[]): string {
    if (typeof prompt === 'string') return prompt;
    return prompt
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join(' ');
}
