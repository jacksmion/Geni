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

    /**
     * 已知工具的信任级别映射
     * TODO: 未来可从配置文件加载
     */
    private trustLevelMap: Record<string, ToolTrustLevel> = {
        // 安全工具（只读）
        'read_file': ToolTrustLevel.Safe,
        'list_directory': ToolTrustLevel.Safe,
        'read_skill': ToolTrustLevel.Safe,
        'search_files': ToolTrustLevel.Safe,
        'get_file_info': ToolTrustLevel.Safe,

        // 低风险工具
        'write_file': ToolTrustLevel.Low,
        'create_directory': ToolTrustLevel.Low,

        // 中等风险工具
        'delete_file': ToolTrustLevel.Medium,
        'move_file': ToolTrustLevel.Medium,
        'rename_file': ToolTrustLevel.Medium,

        // 高风险工具
        'execute_command': ToolTrustLevel.Dangerous,
        'bash': ToolTrustLevel.Dangerous,
        'python_exec': ToolTrustLevel.Dangerous,
        'run_script': ToolTrustLevel.Dangerous
    };

    constructor(authorizationCallback?: AuthorizationCallback) {
        this.authorizationCallback = authorizationCallback;
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
        // 1. 优先查找已知映射
        if (this.trustLevelMap[toolName]) {
            return this.trustLevelMap[toolName];
        }

        // 2. 检查工具是否声明需要确认
        if (tool?.requireConfirmation) {
            return ToolTrustLevel.High;
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
                    reason: `High risk operation: ${request.toolName}`,
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

        // 需要用户确认，但没有回调
        if (!this.authorizationCallback) {
            console.warn(
                `[ToolGuard] Tool "${request.toolName}" requires user confirmation but no callback is set`
            );
            return true;
        }

        // 请求用户授权
        const userDecision = await this.authorizationCallback(request, decision);

        if (userDecision.approved) {
            // 如果用户选择记住决定，记录批准
            if (userDecision.rememberDecision) {
                this.addApprovedPattern(request, 3600000); // 1 小时有效
            }
            return true;
        }

        return false;
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
