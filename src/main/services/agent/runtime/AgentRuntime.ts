/**
 * AgentRuntime.ts - Runtime 层接口定义
 *
 * Phase 2: 三层架构 Runtime 层
 *
 * 职责：
 * - 生命周期管理：准备 → 委托 → 后处理
 * - Skill 解析、Tool 过滤、History 加载
 * - Memory 检索、System Prompt 组装
 * - 消息持久化
 */

import type { Agent } from '../../../../common/types/agent';
import type { AgentRunRequest, AgentRunResult } from '../types';
import type { AppSettings } from '../../../../common/types/settings';

export interface AgentRuntime {
    run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult>;
    updateSettings(settings: AppSettings): void;
    /**
     * Phase 4: 桥接授权响应到 Executor 内部的 ToolGuard
     * Phase 5 切换到 AsyncGenerator stream.next() 后移除
     */
    resolveAuth(runId: string, requestId: string, approved: boolean): void;
}
