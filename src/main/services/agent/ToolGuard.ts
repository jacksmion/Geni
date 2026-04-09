/**
 * ToolGuard.ts - 工具执行评估器
 *
 * Phase 5: 纯评估器，不再负责授权等待。
 * 授权流程由 Executor 通过 AsyncGenerator yield/next 双向通信处理。
 *
 * 功能:
 * - 根据工具的 trustLevel/dangerLevel 评估风险
 * - 返回评估结果，由调用方决定如何处理
 * - 支持 "记住决定" 以减少打扰
 */

import { ITool, ToolDefinition } from '../../../common/types/tool';

/**
 * 工具信任级别
 */
export enum ToolTrustLevel {
    /** 安全 - 只读操作，无副作用 */
    Safe = 'Safe',
    /** 低风险 - 可能有轻微副作用，但可逆 */
    Low = 'Low',
    /** 中等风险 - 可能修改系统状态 */
    Medium = 'Medium',
    /** 高风险 - 可能造成不可逆影响（删除文件、网络请求等） */
    High = 'High',
    /** 危险 - 系统级操作（执行命令、安装软件等） */
    Dangerous = 'Dangerous'
}

/**
 * 工具执行请求
 */
export interface ToolExecutionRequest {
    /** 唯一请求 ID（用户关联 UI） */
    requestId?: string;
    /** 运行 ID（并发场景下标识归属 session） */
    runId?: string;
    /** 工具名称 */
    toolName: string;
    /** 工具定义 */
    definition: ToolDefinition;
    /** 执行参数 */
    args: Record<string, any>;
    /** 工具实例 */
    tool: ITool;
}

/**
 * 授权决定
 */
export interface AuthorizationDecision {
    /** 是否允许执行 */
    allowed: boolean;
    /** 决定原因 */
    reason: string;
    /** 是否需要用户确认 */
    requiresUserConfirmation: boolean;
    /** 信任级别 */
    trustLevel: ToolTrustLevel;
}

/**
 * 已授权的工具模式（用于 "记住决定" 功能）
 */
interface ApprovedPattern {
    toolName: string;
    argsPattern?: string; // JSON 序列化的参数模式
    timestamp: number;
    expiresAt?: number; // 过期时间
}

/**
 * ToolGuard - 工具执行评估器
 *
 * 实现安全策略:
 * 1. 评估每个工具调用的风险级别
 * 2. 返回评估结果（是否需要用户确认）
 * 3. 支持 "记住决定" 以减少打扰
 */
export class ToolGuard {
    private approvedPatterns: ApprovedPattern[] = [];

    /**
     * 已知工具的信任级别映射
     * TODO: 未来可从配置文件加载
     */
    private trustLevelMap: Record<string, ToolTrustLevel> = {
        // 安全工具（只读）
        'read': ToolTrustLevel.Safe,
        'list': ToolTrustLevel.Safe,
        'glob': ToolTrustLevel.Safe,
        'grep': ToolTrustLevel.Safe,
        'load_skill': ToolTrustLevel.Safe,
        'read_plan': ToolTrustLevel.Safe,

        // 低风险工具
        'write': ToolTrustLevel.Low,
        'edit': ToolTrustLevel.Low,
        'create_plan': ToolTrustLevel.Low,
        'update_task_status': ToolTrustLevel.Low,

        // 高风险工具
        'bash': ToolTrustLevel.Dangerous,
    };

    /**
     * 获取工具的信任级别
     */
    getToolTrustLevel(toolName: string, tool?: ITool): ToolTrustLevel {
        // 1. 检查工具实例是否明确声明了需要确认
        if (tool?.requireConfirmation !== undefined) {
            return tool.requireConfirmation ? ToolTrustLevel.High : ToolTrustLevel.Safe;
        }

        // 2. 查找已知启发式映射后备字典
        if (this.trustLevelMap[toolName]) {
            return this.trustLevelMap[toolName];
        }

        // 3. 基于工具名称的启发式判断
        const dangerousPatterns = ['exec', 'run', 'delete', 'remove', 'shell', 'bash', 'cmd'];
        const lowercaseName = toolName.toLowerCase();

        for (const pattern of dangerousPatterns) {
            if (lowercaseName.includes(pattern)) {
                return ToolTrustLevel.High;
            }
        }

        // 4. 默认中等信任
        return ToolTrustLevel.Medium;
    }

    /**
     * 评估工具执行请求
     */
    evaluateRequest(request: ToolExecutionRequest): AuthorizationDecision {
        const trustLevel = this.getToolTrustLevel(request.toolName, request.tool);

        // 检查是否已有批准记录
        if (this.isAlreadyApproved(request)) {
            return {
                allowed: true,
                reason: 'Previously approved by user',
                requiresUserConfirmation: false,
                trustLevel
            };
        }

        // 根据信任级别决定是否需要确认
        switch (trustLevel) {
            case ToolTrustLevel.Safe:
                return {
                    allowed: true,
                    reason: 'Tool is marked as safe (read-only)',
                    requiresUserConfirmation: false,
                    trustLevel
                };

            case ToolTrustLevel.Low:
                return {
                    allowed: true,
                    reason: 'Low risk operation',
                    requiresUserConfirmation: false,
                    trustLevel
                };

            case ToolTrustLevel.Medium:
                return {
                    allowed: true,
                    reason: 'Medium risk operation - proceeding with caution',
                    requiresUserConfirmation: false,
                    trustLevel
                };

            case ToolTrustLevel.High:
            case ToolTrustLevel.Dangerous:
                return {
                    allowed: false,
                    reason: this.getHumanReadableReason(request),
                    requiresUserConfirmation: true,
                    trustLevel
                };

            default:
                return {
                    allowed: false,
                    reason: 'Unknown trust level',
                    requiresUserConfirmation: true,
                    trustLevel
                };
        }
    }

    /**
     * 标记工具已被批准（由外部授权流程调用）
     */
    markApproved(request: ToolExecutionRequest, ttl?: number): void {
        this.addApprovedPattern(request, ttl ?? 3600000);
    }

    /**
     * 检查请求是否已有批准记录
     */
    private isAlreadyApproved(request: ToolExecutionRequest): boolean {
        const now = Date.now();

        // 清理过期的批准
        this.approvedPatterns = this.approvedPatterns.filter(
            p => !p.expiresAt || p.expiresAt > now
        );

        // 查找匹配的批准记录
        return this.approvedPatterns.some(
            p => p.toolName === request.toolName
        );
    }

    /**
     * 添加批准记录
     */
    private addApprovedPattern(request: ToolExecutionRequest, ttl?: number): void {
        this.approvedPatterns.push({
            toolName: request.toolName,
            timestamp: Date.now(),
            expiresAt: ttl ? Date.now() + ttl : undefined
        });
    }

    /**
     * 根据工具类型和参数生成人类可读的安全提示
     */
    private getHumanReadableReason(request: ToolExecutionRequest): string {
        const name = request.toolName.toLowerCase();
        const args = request.args || {};

        // Bash / shell commands
        if (name.includes('bash') || name.includes('shell') || name.includes('cmd') || name === 'exec') {
            const cmd = args.command || args.cmd || '';
            if (cmd) {
                if (/\brm\b.*-rf?\b/.test(cmd) || /\bdel\b/i.test(cmd) || /Remove-Item/i.test(cmd)) {
                    return '即将执行删除操作，请确认命令内容';
                }
                if (/\bnpm\s+install\b|\bpip\s+install\b|\bapt\s+install\b|\bbrew\s+install\b/i.test(cmd)) {
                    return '即将安装软件包，请确认是否允许';
                }
                if (/\bcurl\b|\bwget\b|\bfetch\b/i.test(cmd)) {
                    return '即将发起网络请求，请确认目标地址';
                }
            }
            return '即将在终端执行命令，请确认命令内容';
        }

        // Delete / remove operations
        if (name.includes('delete') || name.includes('remove')) {
            return '此操作可能删除数据，且不可撤销';
        }

        // Run / exec operations
        if (name.includes('run') || name.includes('exec')) {
            return '即将执行外部程序，请确认操作安全';
        }

        // Generic fallback
        return `此工具 (${request.toolName}) 涉及敏感操作，请确认是否允许`;
    }

    /**
     * 注册自定义信任级别
     */
    registerToolTrustLevel(toolName: string, level: ToolTrustLevel): void {
        this.trustLevelMap[toolName] = level;
    }

    /**
     * 批量注册信任级别
     */
    registerToolTrustLevels(mappings: Record<string, ToolTrustLevel>): void {
        Object.assign(this.trustLevelMap, mappings);
    }

    /**
     * 清除所有批准记录
     */
    clearApprovedPatterns(): void {
        this.approvedPatterns = [];
    }
}

// 导出默认实例
export const defaultToolGuard = new ToolGuard();
