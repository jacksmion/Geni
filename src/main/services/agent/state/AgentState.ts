/**
 * AgentState.ts - Agent 显式状态机定义
 * 
 * Phase 1.3 实现: 定义 Agent 运行时的所有可能状态
 * 
 * **价值**: 让 UI 能精确展示当前 Agent 在做什么
 * - "正在思考..." (Thinking)
 * - "正在执行命令..." (ExecutingTool)
 * - "等待确认" (AwaitingInput)
 */

/**
 * Agent 运行时状态枚举
 */
export enum AgentState {
    /**
     * 空闲状态 - Agent 未在执行任何任务
     */
    Idle = 'Idle',

    /**
     * 思考状态 - 正在调用 LLM 生成响应
     */
    Thinking = 'Thinking',

    /**
     * 处理输出状态 - 正在解析 LLM 返回的内容
     */
    ExecutingHelper = 'ExecutingHelper',

    /**
     * 执行工具状态 - 正在执行工具调用
     */
    ExecutingTool = 'ExecutingTool',

    /**
     * 等待输入状态 - 等待用户授权敏感操作
     */
    AwaitingInput = 'AwaitingInput',

    /**
     * 错误状态 - Agent 执行过程中遇到错误
     */
    Error = 'Error',

    /**
     * 已终止状态 - Agent 执行被用户中断
     */
    Aborted = 'Aborted'
}

/**
 * Agent 状态转换事件
 */
export interface AgentStateEvent {
    /** 前一状态 */
    previousState: AgentState;
    /** 当前状态 */
    currentState: AgentState;
    /** 状态描述信息 */
    message?: string;
    /** 附加数据（如当前执行的工具名称） */
    metadata?: Record<string, any>;
    /** 时间戳 */
    timestamp: number;
}

/**
 * Agent 状态管理器
 * 
 * 负责:
 * - 维护当前状态
 * - 验证状态转换的合法性
 * - 触发状态变更回调
 */
export class AgentStateManager {
    private currentState: AgentState = AgentState.Idle;
    private onStateChange?: (event: AgentStateEvent) => void;

    constructor(onStateChange?: (event: AgentStateEvent) => void) {
        this.onStateChange = onStateChange;
    }

    /**
     * 获取当前状态
     */
    getState(): AgentState {
        return this.currentState;
    }

    /**
     * 转换到新状态
     * @param newState 目标状态
     * @param message 状态描述信息
     * @param metadata 附加元数据
     */
    transition(newState: AgentState, message?: string, metadata?: Record<string, any>): void {
        const previousState = this.currentState;

        // 验证状态转换的合法性
        if (!this.isValidTransition(previousState, newState)) {
            console.warn(
                `[AgentStateManager] Invalid state transition: ${previousState} -> ${newState}`
            );
            // 允许继续，只记录警告（开发阶段友好）
        }

        this.currentState = newState;

        // 触发状态变更回调
        if (this.onStateChange) {
            this.onStateChange({
                previousState,
                currentState: newState,
                message,
                metadata,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 重置状态到 Idle
     */
    reset(): void {
        this.transition(AgentState.Idle, 'State reset');
    }

    /**
     * 验证状态转换是否合法
     * 
     * 定义允许的状态转换规则:
     * - Idle -> Thinking (开始新任务)
     * - Thinking -> ExecutingHelper|ExecutingTool|AwaitingInput|Idle|Error (LLM 响应处理)
     * - ExecutingHelper -> Thinking|Idle|Error (输出处理完成)
     * - ExecutingTool -> Thinking|Idle|Error (工具执行完成)
     * - AwaitingInput -> ExecutingTool|Idle|Aborted (用户输入处理)
     * - Error -> Idle (错误恢复)
     * - Aborted -> Idle (中断恢复)
     * - 任何状态 -> Aborted (用户可随时中断)
     */
    private isValidTransition(from: AgentState, to: AgentState): boolean {
        // 任何状态都可以转换到 Aborted
        if (to === AgentState.Aborted) {
            return true;
        }

        const validTransitions: Record<AgentState, AgentState[]> = {
            [AgentState.Idle]: [AgentState.Thinking],
            [AgentState.Thinking]: [
                AgentState.Thinking, // 允许状态自我更新（如更新界面显示文字）
                AgentState.ExecutingHelper,
                AgentState.ExecutingTool,
                AgentState.AwaitingInput,
                AgentState.Idle,
                AgentState.Error
            ],
            [AgentState.ExecutingHelper]: [
                AgentState.Thinking,
                AgentState.Idle,
                AgentState.Error
            ],
            [AgentState.ExecutingTool]: [
                AgentState.Thinking,
                AgentState.ExecutingTool, // 允许连续执行多个工具
                AgentState.Idle,
                AgentState.Error
            ],
            [AgentState.AwaitingInput]: [
                AgentState.ExecutingTool,
                AgentState.Idle
            ],
            [AgentState.Error]: [AgentState.Idle],
            [AgentState.Aborted]: [AgentState.Idle]
        };

        return validTransitions[from]?.includes(to) ?? false;
    }
}

/**
 * 获取状态的用户友好描述
 */
export function getStateDescription(state: AgentState): string {
    const descriptions: Record<AgentState, string> = {
        [AgentState.Idle]: '空闲',
        [AgentState.Thinking]: '正在思考...',
        [AgentState.ExecutingHelper]: '正在处理...',
        [AgentState.ExecutingTool]: '正在执行工具...',
        [AgentState.AwaitingInput]: '等待确认...',
        [AgentState.Error]: '执行出错',
        [AgentState.Aborted]: '已中断'
    };
    return descriptions[state] || state;
}
