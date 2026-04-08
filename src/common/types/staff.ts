/**
 * StaffProfile - 数字员工（自定义 Agent）类型定义
 *
 * 核心公式: 数字员工 = Persona + Skills + Tools + Memory
 * 本质上是对 AgentRuntime 配置参数的命名化、持久化封装。
 */

import type { Agent } from './agent';

export interface StaffProfile extends Agent {
    avatar?: string;
    description?: string;
    status: 'idle' | 'busy' | 'off-duty';

    /** @deprecated Use agent.systemPrompt */
    persona?: string;
    /** @deprecated Use agent.modelId (format: 'provider/model') */
    provider?: string;
    /** @deprecated Use agent.modelId (format: 'provider/model') */
    model?: string;
    /** @deprecated Runtime derives path from agent.id */
    memoryFile?: string;
    /** @deprecated Use agent.allowedTools (supports wildcards like 'github/*') */
    allowedMcpServerIds?: string[];

    createdAt: number;
    updatedAt: number;
}

/** 列表展示用的精简元数据 */
export type StaffMeta = Pick<StaffProfile, 'id' | 'name' | 'avatar' | 'description' | 'status'>;
