/**
 * Agent Module - 核心 Agent 运行时导出
 */

// 核心运行时
export { AgentRuntime } from './AgentRuntime';
export type { AgentRuntimeOptions } from './AgentRuntime';

// 接口定义
export type { IAgentService, AgentRunOptions, AgentRunResult, IAgent } from './IAgent';

// AgentStep 从 common 统一导出
export type { AgentStep } from '../../../common/types/chat';

// Prompt 构建器
export { PromptBuilder, defaultPromptBuilder } from './PromptBuilder';
export type { AgentContext, PromptBuilderConfig } from './PromptBuilder';

// 状态机
export { AgentState, AgentStateManager, getStateDescription } from './state/AgentState';
export type { AgentStateEvent } from './state/AgentState';

// 工具拦截器
export { ToolGuard, ToolTrustLevel, defaultToolGuard } from './ToolGuard';
export type {
    ToolExecutionRequest,
    AuthorizationDecision,
    UserApprovalContext,
    AuthorizationCallback
} from './ToolGuard';

// Context & Summarization
export { TokenCounter } from './TokenCounter';
export { ContextManager } from './ContextManager';
export type { ContextManagerOptions } from './ContextManager';
export { Summarizer } from './Summarizer';
