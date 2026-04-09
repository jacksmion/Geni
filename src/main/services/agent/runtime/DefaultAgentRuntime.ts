/**
 * DefaultAgentRuntime.ts - Runtime 层默认实现
 *
 * 职责：
 * - 生命周期管理：准备 → 委托 → 后处理
 * - Skill 解析、Tool 过滤、History 加载
 * - Memory 检索、System Prompt 组装
 * - 消息持久化
 */

import type { Agent } from '../../../../common/types/agent';
import type { AppSettings } from '../../../../common/types/settings';
import type { ChatMessage } from '../../../../common/types/chat';
import type { Skill } from '../../../../common/types/skill';
import type { SkillObject } from '../../skills/core/SkillParser';
import { AgentContext } from '../AgentContext';
import { AgentRunRequest, AgentRunResult, extractTextFromPrompt } from '../types';
import { AgentRuntime } from './AgentRuntime';
import { AgentExecutor } from '../executor/AgentExecutor';
import { ToolRegistry } from '../../tools/ToolRegistry';
import { SessionManager } from '../../session/SessionManager';
import { SkillRegistry } from '../../skills/core/SkillRegistry';
import { MemoryStore } from '../../memory/MemoryStore';
import { UsageManager } from '../../usage/UsageManager';
import { PromptBuilder } from '../PromptBuilder';
import { ToolGuard } from '../ToolGuard';

interface MemoryEntry {
    title: string;
    content: string;
}

interface KnowledgeMemory {
    search(query: string, options?: { agentId?: string; k?: number }): Promise<Array<{ id: string; text: string; score: number }>>;
}

export class DefaultAgentRuntime implements AgentRuntime {
    private settings: AppSettings;
    private toolRegistry: ToolRegistry;
    private sessionManager: SessionManager;
    private skillRegistry: SkillRegistry;
    private memoryStore: MemoryStore;
    private usageManager: UsageManager;
    private executor: AgentExecutor;
    private promptBuilder: PromptBuilder;
    private knowledgeMemory: KnowledgeMemory;
    /** 活跃 ToolGuard 映射 (runId → ToolGuard) */
    private activeGuards = new Map<string, ToolGuard>();

    constructor(
        settings: AppSettings,
        toolRegistry: ToolRegistry,
        sessionManager: SessionManager,
        skillRegistry: SkillRegistry,
        memoryStore: MemoryStore,
        usageManager: UsageManager,
        executor: AgentExecutor
    ) {
        this.settings = settings;
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.skillRegistry = skillRegistry;
        this.memoryStore = memoryStore;
        this.usageManager = usageManager;
        this.executor = executor;
        this.promptBuilder = new PromptBuilder({
            defaultBasePrompt: settings.systemPrompt
        });

        this.knowledgeMemory = {
            search: async (query: string, options?: { agentId?: string; k?: number }): Promise<Array<{ id: string; text: string; score: number }>> => {
                if (!query.trim()) return [];
                const content = this.memoryStore.read();
                if (!content) return [];

                const entries = this.parseEntries(content);
                const results = entries
                    .map(entry => ({
                        id: entry.title,
                        text: entry.content,
                        score: this.scoreQuery(entry, query)
                    }))
                    .filter(c => c.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, options?.k ?? 5);

                return results;
            }
        };
    }

    private parseEntries(content: string): MemoryEntry[] {
        const entries: MemoryEntry[] = [];
        const regex = /<!-- memory: (.+?) -->\n([\s\S]*?)(?=<!-- memory: |$)/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            entries.push({ title: match[1], content: match[2].trim() });
        }
        return entries;
    }

    private scoreQuery(entry: MemoryEntry, query: string): number {
        const lowerQuery = query.toLowerCase();
        const lowerTitle = entry.title.toLowerCase();
        const lowerContent = entry.content.toLowerCase();

        let score = 0;
        if (lowerTitle.includes(lowerQuery)) score += 10;
        if (lowerContent.includes(lowerQuery)) score += 1;

        const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
        for (const word of queryWords) {
            if (lowerTitle.includes(word)) score += 3;
            if (lowerContent.includes(word)) score += 0.5;
        }

        return score;
    }

    updateSettings(settings: AppSettings): void {
        this.settings = settings;
        this.promptBuilder.updateConfig({ defaultBasePrompt: settings.systemPrompt });
    }

    async run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult> {
        const runId = crypto.randomUUID();

        const effectiveSkillIds = request.skillIds ?? agent.skillIds;
        const skills = this.convertToSkills(effectiveSkillIds);

        const effectiveToolNames = request.toolNames ?? agent.allowedTools;
        const tools = effectiveToolNames
            ? this.toolRegistry.filter(effectiveToolNames)
            : this.toolRegistry;

        const history = request.sessionId
            ? await this.sessionManager.getHistory(request.sessionId)
            : [];

        const memories = await this.knowledgeMemory.search(
            extractTextFromPrompt(request.prompt),
            { agentId: agent.id }
        );

        const systemPrompt = this.promptBuilder.buildSystemPrompt({
            basePrompt: agent.systemPrompt || this.settings.systemPrompt,
            workspacePath: this.settings.workspacePath,
            skills: skills,
            language: this.settings.language,
            memory: memories.length > 0 ? memories.map(m => m.text).join('\n\n') : undefined
        });

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: request.prompt }
        ];

        const context: AgentContext = {
            runId,
            agent,
            messages,
            tools,
            signal: request.signal,
            emit: request.emit,
            registerToolGuard: (guard: ToolGuard) => {
                this.activeGuards.set(runId, guard);
            }
        };

        let result: AgentRunResult | undefined;
        const iterator = this.executor.execute(context, request);
        let iteration = await iterator.next();

        while (!iteration.done) {
            const event = iteration.value;
            if (event.type === 'error') {
                console.error('[DefaultAgentRuntime] Executor error:', event.payload.message);
            }
            iteration = await iterator.next();
        }
        result = iteration.value;

        if (request.sessionId && result?.newMessages) {
            for (const msg of result.newMessages) {
                await this.sessionManager.addMessage(request.sessionId, msg);
            }
        }

        // Cleanup guard after execution
        this.activeGuards.delete(runId);

        return result!;
    }

    /**
     * 桥接授权响应到 Executor 内部的 ToolGuard
     */
    resolveAuth(runId: string, requestId: string, approved: boolean): void {
        const guard = this.activeGuards.get(runId);
        if (guard) {
            guard.resolve(requestId, approved);
        }
    }

    private getSkillObjects(skillIds: string[] | undefined): SkillObject[] {
        if (!skillIds || skillIds.length === 0) return [];
        return skillIds
            .map(id => this.skillRegistry.get(id))
            .filter((s): s is SkillObject => s !== undefined);
    }

    private convertToSkills(skillIds: string[] | undefined): Skill[] {
        const objects = this.getSkillObjects(skillIds);
        return objects.map(obj => ({
            id: obj.id,
            name: obj.name,
            description: obj.description,
            content: obj.instruction,
            path: obj.path || '',
            enabled: true,
            trustLevel: 'Auto' as const
        }));
    }
}
