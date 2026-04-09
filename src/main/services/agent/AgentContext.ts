/**
 * AgentContext - Agent 运行上下文（三层架构的核心连接点）
 *
 * 由 DefaultAgentRuntime 构建，注入到 AgentExecutor。
 * 生命周期：一次 run() 调用 → 一个 AgentContext 实例。
 *
 * 设计原则：
 * - 不可变：构建后字段不被修改（messages 除外，Executor 追加消息）
 * - 自包含：Executor 拿到 Context 即可执行，不需要其他外部依赖
 * - 隔离性：每个 runId 对应独立的 Context，天然并发安全
 */

import type { Agent } from '../../../common/types/agent';
import type { ChatMessage } from '../../../common/types/chat';
import type { ToolRegistry } from '../tools/ToolRegistry';
import type { AgentEvent } from './types';
import type { ToolGuard } from './ToolGuard';

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

    /** 事件发射器 — Executor 通过此回调向 Controller 发送事件 */
    emit?: (event: AgentEvent) => void;

    /**
     * Phase 4: ToolGuard 注册回调
     * Executor 创建 ToolGuard 后通过此回调注册到 Runtime，
     * 以便 Runtime 桥接授权响应。Phase 5 切换到 AsyncGenerator 后移除。
     */
    registerToolGuard?: (guard: ToolGuard) => void;
}
