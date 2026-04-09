/**
 * Agent 类型定义 — 内部执行层使用的类型
 */

import type { Agent } from '../../../common/types/agent';
import type { ChatMessage, ContentPart, AgentStep } from '../../../common/types/chat';
import type { ToolRegistry } from '../tools/ToolRegistry';
import type { AgentStateEvent } from './state/AgentState';

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
    | { type: 'error'; payload: { message: string; code?: string } }
    | { type: 'state_change'; payload: AgentStateEvent };

// ============================================================================
// AgentRunRequest / AgentRunResult
// ============================================================================

export interface AgentRunRequest {
    sessionId?: string;
    prompt: string | ContentPart[];
    /** 不传 history — Runtime 内部通过 sessionId 加载 */
    signal?: AbortSignal;

    /**
     * 事件转发回调 — 由调用方（Controller / IMServiceManager）提供。
     * Runtime 消费 Executor 的 generator 后，通过此回调将事件转发给上层。
     * Executor 不使用此回调（通过 yield 产出事件）。
     */
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
// AgentContext — 运行上下文（Runtime → Executor 的连接点）
// ============================================================================

/**
 * 由 DefaultAgentRuntime 构建，注入到 AgentExecutor。
 * 生命周期：一次 run() 调用 → 一个 AgentContext 实例。
 *
 * 设计原则：
 * - 不可变：构建后字段不被修改（messages 除外，Executor 追加消息）
 * - 自包含：Executor 拿到 Context 即可执行，不需要其他外部依赖
 * - 隔离性：每个 runId 对应独立的 Context，天然并发安全
 */
export interface AgentContext {
    /** 唯一运行标识，用于日志追踪 */
    runId: string;

    /** Agent 配置（不可变快照） */
    agent: Agent;

    /** 由 Runtime 组装好的完整消息（system prompt 已含 skills + memories） */
    messages: ChatMessage[];

    /** 已按 agent.allowedTools 过滤的工具集 */
    tools: ToolRegistry;

    /** 取消信号 */
    signal?: AbortSignal;
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
