/**
 * StaffProfile - 数字员工（自定义 Agent）类型定义
 *
 * 核心公式: 数字员工 = Persona + Skills + Tools + Memory
 * 本质上是对 AgentRuntime 配置参数的命名化、持久化封装。
 */

export interface StaffProfile {
    id: string;
    name: string;
    avatar?: string;
    description?: string;
    status: 'idle' | 'busy' | 'off-duty';

    // Brain 模块
    persona: string;               // System Prompt (人格描述)
    provider?: string;             // 可选覆盖 LLM Provider
    model?: string;                // 可选覆盖 Model
    temperature?: number;

    // Skill 模块
    skillIds: string[];

    // Action 模块 - MCP Server 白名单 (空数组 = 使用全局)
    allowedMcpServerIds?: string[];

    // Memory 模块
    memoryFile?: string;           // 默认: memory/staff_{id}.md

    createdAt: number;
    updatedAt: number;
}

/** 列表展示用的精简元数据 */
export type StaffMeta = Pick<StaffProfile, 'id' | 'name' | 'avatar' | 'description' | 'status'>;
