/**
 * AgentExecutor.ts - Executor 层接口定义
 *
 * Phase 2: 三层架构 Executor 层
 *
 * 职责：
 * - 推理策略：think → act → observe 循环
 * - LLM 调用、Tool 执行、状态管理、Context 压缩
 *
 * 设计说明：
 * - Executor 是行为载体，ToolGuard 属于其内部实现
 * - Phase 2 初期实现可以内部用 emit callback + return Promise
 * - Phase 5 才完全切换到 AsyncGenerator
 */

import type { AgentContext } from '../AgentContext';
import type { AgentRunRequest, AgentEvent, AgentRunResult } from '../types';

export interface AgentExecutor {
    execute(
        context: AgentContext,
        request: AgentRunRequest
    ): AsyncGenerator<AgentEvent, AgentRunResult>;
}
