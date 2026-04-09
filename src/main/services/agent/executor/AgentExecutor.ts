/**
 * AgentExecutor.ts - Executor 层接口定义
 *
 * 职责：
 * - 推理策略：think → act → observe 循环
 * - LLM 调用、Tool 执行、状态管理、Context 压缩
 */

import type { AgentContext, AgentRunRequest, AgentEvent, AgentRunResult } from '../types';

export interface AgentExecutor {
    execute(
        context: AgentContext,
        request: AgentRunRequest
    ): AsyncGenerator<AgentEvent, AgentRunResult>;
}
