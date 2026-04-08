/**
 * ToolGuard.ts - 工具执行拦截器
 * 
 * Phase 1.4 实现: 在执行工具前检查权限，处理敏感操作
 * 
 * 功能:
 * - 根据工具的 trustLevel/dangerLevel 评估风险
 * - 对敏感操作请求用户授权
 * - 记录审计日志
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
 * 用户授权上下文
 */
export interface UserApprovalContext {
    /** 是否批准 */
    approved: boolean;
    /** 用户消息 */
    message?: string;
    /** 是否记住此决定 */
    rememberDecision?: boolean;
}

/**
 * 授权回调函数类型
 */
export type AuthorizationCallback = (
    request: ToolExecutionRequest,
    decision: AuthorizationDecision
) => Promise<UserApprovalContext>;

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
 * ToolGuard - 工具执行拦截器
 * 
 * 实现安全策略:
 * 1. 评估每个工具调用的风险级别
 * 2. 对高风险操作请求用户确认
 * 3. 支持 "记住决定" 以减少打扰
 */
export class ToolGuard {
    private approvedPatterns: ApprovedPattern[] = [];
    private authorizationCallback?: AuthorizationCallback;
    private emit?: (event: any) => void;
    private pendingRequests = new Map<string, (approved: boolean) => void>();

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

    constructor(authorizationCallback?: AuthorizationCallback, emit?: (event: any) => void) {
        this.authorizationCallback = authorizationCallback;
        this.emit = emit;
    }

    /**
     * 设置授权回调
     */
    setAuthorizationCallback(callback: AuthorizationCallback): void {
        this.authorizationCallback = callback;
    }

    /**
     * 获取工具的信任级别
     */
    getToolTrustLevel(toolName: string, tool?: ITool): ToolTrustLevel {
        // 1. 检查工具实例是否明确声明了需要确认 (这来源于用户的配置或工具强制要求)
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
                // 中等风险：可以自动允许，但记录日志
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
     * 检查工具执行是否需要授权，并在需要时请求授权
     *
     * 支持两种授权模式：
     * 1. emit 模式（新）：通过 emit 发出 auth_request 事件，等待 resolve() 调用
     * 2. callback 模式（旧）：通过 authorizationCallback 直接获取用户决策
     *
     * @returns 如果允许执行返回 true，否则返回 false
     */
    async checkAuthorization(request: ToolExecutionRequest): Promise<boolean> {
        const decision = this.evaluateRequest(request);

        if (decision.allowed) {
            return true;
        }

        if (!decision.requiresUserConfirmation) {
            return false;
        }

        // 优先使用 emit 模式（新路径）
        if (this.emit) {
            const requestId = request.requestId || Math.random().toString(36).substring(7);
            this.emit({
                type: 'auth_request',
                payload: {
                    runId: request.runId,
                    requestId,
                    toolName: request.toolName,
                    args: request.args,
                    reason: decision.reason,
                }
            });

            return new Promise<boolean>((resolve) => {
                this.pendingRequests.set(requestId, (approved) => {
                    if (approved) {
                        this.addApprovedPattern(request, 3600000);
                    }
                    resolve(approved);
                });
            });
        }

        // 回退到 callback 模式（旧路径）
        if (!this.authorizationCallback) {
            console.warn(
                `[ToolGuard] Tool "${request.toolName}" requires user confirmation but no callback or emit is set`
            );
            return true;
        }

        // 请求用户授权
        const userDecision = await this.authorizationCallback(request, decision);

        if (userDecision.approved) {
            if (userDecision.rememberDecision) {
                this.addApprovedPattern(request, 3600000);
            }
            return true;
        }

        return false;
    }

    /**
     * 外部调用：解决授权请求
     *
     * 当 emit 模式下用户做出决策后，由调用方通过此方法传递结果。
     *
     * @param requestId 授权请求 ID
     * @param approved 用户是否批准
     */
    resolve(requestId: string, approved: boolean): void {
        const resolve = this.pendingRequests.get(requestId);
        if (resolve) {
            resolve(approved);
            this.pendingRequests.delete(requestId);
        }
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
                // Detect specific dangerous patterns
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
