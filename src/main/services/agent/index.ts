/**
 * Agent Module - 核心 Agent 运行时导出
 * 
 * Phase 1 重构完成，包含:
 * - AgentRuntime: 核心执行循环
 * - PromptBuilder: System Prompt 构建器
 * - AgentState: 显式状态机
 * - ToolGuard: 工具执行拦截器
 */

// 核心运行时
export { AgentRuntime, OpenAIAgentService } from './AgentRuntime';
export type { AgentRuntimeOptions } from './AgentRuntime';

// 接口定义
export type { IAgentService, AgentRunOptions, AgentRunResult, IAgent } from './IAgent';

// Prompt 构建器 (Phase 1.2)
export { PromptBuilder, defaultPromptBuilder } from './PromptBuilder';
export type { AgentContext, PromptBuilderConfig } from './PromptBuilder';

// 状态机 (Phase 1.3)
export { AgentState, AgentStateManager, getStateDescription } from './state/AgentState';
export type { AgentStateEvent } from './state/AgentState';

// 工具拦截器 (Phase 1.4)
export { ToolGuard, ToolTrustLevel, defaultToolGuard } from './ToolGuard';
export type {
    ToolExecutionRequest,
    AuthorizationDecision,
    UserApprovalContext,
    AuthorizationCallback
} from './ToolGuard';
