/**
 * AgentRuntime.ts - Runtime 层实现
 *
 * 职责：
 * - 生命周期管理：准备 → 委托 → 后处理
 * - Skill 解析、Tool 过滤、History 加载
 * - Memory 检索、System Prompt 组装
 * - 消息持久化
 *
 * Phase 5: 消费 Executor 的 AsyncGenerator，处理 auth_request 双向通信。
 */

import type { Agent } from '../../../../common/types/agent';
import type { ChatMessage, AgentStep } from '../../../../common/types/chat';
import type { Skill } from '../../../../common/types/skill';
import type { SkillObject } from '../../skills/core/SkillParser';
import { AgentContext, AgentRunRequest, AgentRunResult, AgentEvent } from '../types';
import { AgentExecutor } from '../executor/AgentExecutor';
import { ToolRegistry } from '../../tools/ToolRegistry';
import { SessionManager } from '../../session/SessionManager';
import { SkillRegistry } from '../../skills/core/SkillRegistry';
import { MemoryStore } from '../../memory/MemoryStore';
import { UsageManager } from '../../usage/UsageManager';
import { ConfigManager } from '../../ConfigManager';
import { PromptBuilder } from '../PromptBuilder';
import fs from 'fs';
import path from 'path';
import os from 'os';


export class AgentRuntime {
    private toolRegistry: ToolRegistry;
    private sessionManager: SessionManager;
    private skillRegistry: SkillRegistry;
    private configManager: ConfigManager;
    private memoryStore: MemoryStore;
    private usageManager: UsageManager;
    private executor: AgentExecutor;
    private promptBuilder: PromptBuilder;
    /**
     * Pending auth resolvers: requestId → resolve callback.
     * When Executor yields auth_request, we register a resolver here.
     * When user responds (via Controller/IM emit closure), the resolver is called.
     */
    private pendingAuthResolvers = new Map<string, (approved: boolean) => void>();

    constructor(
        toolRegistry: ToolRegistry,
        sessionManager: SessionManager,
        skillRegistry: SkillRegistry,
        configManager: ConfigManager,
        memoryStore: MemoryStore,
        usageManager: UsageManager,
        executor: AgentExecutor
    ) {
        this.toolRegistry = toolRegistry;
        this.sessionManager = sessionManager;
        this.skillRegistry = skillRegistry;
        this.configManager = configManager;
        this.memoryStore = memoryStore;
        this.usageManager = usageManager;
        this.executor = executor;
        this.promptBuilder = new PromptBuilder();
    }

    /**
     * Resolve a pending auth request. Called by the emit closure when user responds.
     */
    resolveAuth(requestId: string, approved: boolean): void {
        const resolve = this.pendingAuthResolvers.get(requestId);
        if (resolve) {
            this.pendingAuthResolvers.delete(requestId);
            resolve(approved);
        }
    }

    async run(agent: Agent, request: AgentRunRequest): Promise<AgentRunResult> {
        const runId = crypto.randomUUID();

        const effectiveSkillIds = request.skillIds ?? agent.skillIds;
        // Fallback: neither request nor agent specified skills → load all enabled skills
        const skills = effectiveSkillIds
            ? this.convertToSkills(effectiveSkillIds)
            : this.convertToAllEnabledSkills();

        const effectiveToolNames = request.toolNames ?? agent.allowedTools;
        const baseTools = effectiveToolNames
            ? this.toolRegistry.filter(effectiveToolNames).getTools()
            : this.toolRegistry.getTools();

        const sessionToolRegistry = new ToolRegistry();
        for (const tool of baseTools) {
            // Clone the tool down to its prototype to isolate state (e.g. currentCwd) per concurrent session
            const clonedTool = Object.create(tool);
            
            // If the user specified a specific workspacePath for this task, inject it
            if (request.workspacePath && typeof (clonedTool as any).setRoot === 'function') {
                try {
                    (clonedTool as any).setRoot(request.workspacePath);
                } catch (e) {
                    console.error('[AgentRuntime] Failed to set session workspace root for tool:', e);
                }
            }
            sessionToolRegistry.register(clonedTool);
        }
        const tools = sessionToolRegistry;

        const history = request.sessionId
            ? await this.sessionManager.getHistory(request.sessionId)
            : [];

        const systemPrompt = this.promptBuilder.buildSystemPrompt({
            basePrompt: agent.systemPrompt,
            workspacePath: request.workspacePath,
            skills: skills,
            language: request.language,
            memoryStore: this.memoryStore,
            identity: this.loadProfileFile('IDENTITY'),
            soul: this.loadProfileFile('SOUL'),
            userProfile: this.loadProfileFile('USER'),
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
            signal: request.signal
        };

        let result: AgentRunResult | undefined;
        const iterator = this.executor.execute(context, request);

        const emit = request.emit;

        let iteration = await iterator.next();

        while (!iteration.done) {
            const event = iteration.value;

            if (event.type === 'auth_request') {
                // Forward auth_request to UI via emit
                emit?.(event);

                // Register a resolver that feeds the user's decision back to the generator
                const { requestId } = event.payload;
                const authPromise = new Promise<boolean>((resolve) => {
                    this.pendingAuthResolvers.set(requestId, resolve);
                });

                const approved = await authPromise;
                iteration = await iterator.next(approved);
            } else {
                // Forward other events via emit
                if (event.type === 'error') {
                    console.error('[AgentRuntime] Executor error:', event.payload.message);
                }
                emit?.(event);
                iteration = await iterator.next();
            }
        }
        result = iteration.value;

        // --- Attach steps to last assistant message before persisting ---
        if (result?.steps && result.steps.length > 0 && result.newMessages) {
            const cleanSteps: AgentStep[] = result.steps.map(s => ({
                thought: s.thought,
                tool: s.tool,
                toolInput: s.toolInput,
                observation: s.observation,
                isComplete: s.isComplete,
                duration: s.duration,
                isError: s.isError,
            }));

            for (let i = result.newMessages.length - 1; i >= 0; i--) {
                if (result.newMessages[i].role === 'assistant') {
                    result.newMessages[i].steps = cleanSteps;
                    break;
                }
            }
        }

        if (request.sessionId && result?.newMessages) {
            for (const msg of result.newMessages) {
                await this.sessionManager.addMessage(request.sessionId, msg);
            }
        }

        // Record token usage
        if (result && (result.promptTokens > 0 || result.completionTokens > 0)) {
            const [providerId, ...rest] = agent.modelId.split('/');
            const modelId = rest.join('/') || agent.modelId;
            this.usageManager.recordUsage({
                sessionId: request.sessionId || '',
                modelId,
                providerId,
                prompt_tokens: result.promptTokens,
                completion_tokens: result.completionTokens,
                total_tokens: result.promptTokens + result.completionTokens,
                isEstimated: true
            });
        }

        return result!;
    }

    private getSkillObjects(skillIds: string[] | undefined): SkillObject[] {
        if (!skillIds || skillIds.length === 0) return [];
        return skillIds
            .map(id => this.skillRegistry.get(id))
            .filter((s): s is SkillObject => s !== undefined);
    }

    /**
     * Load a profile file from ~/.geni/ (IDENTITY.md, SOUL.md, USER.md)
     * Returns empty string if file doesn't exist
     */
    private loadProfileFile(name: string): string {
        const filePath = path.join(os.homedir(), '.geni', `${name}.md`);
        try {
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf-8');
            }
        } catch {
            // Silently ignore read errors
        }
        return '';
    }

    private convertToSkills(skillIds: string[] | undefined): Skill[] {
        const objects = this.getSkillObjects(skillIds);
        return objects.map(obj => ({
            id: obj.id,
            name: obj.name,
            description: obj.description,
            content: obj.instruction,
            rawContent: obj.rawContent,
            path: obj.path || '',
            enabled: true,
            trustLevel: 'Auto' as const,
            source: this.skillRegistry.getSource(obj.id) || 'global'
        }));
    }

    /**
     * Load all enabled skills (fallback when neither request nor agent specifies skillIds).
     */
    private convertToAllEnabledSkills(): Skill[] {
        const allSkills = this.skillRegistry.getAll();
        const settings = this.configManager.load();
        const skillSettings = settings.skillSettings || {};

        return allSkills
            .filter(s => {
                const saved = skillSettings[s.id];
                return saved ? saved.enabled : true; // default enabled
            })
            .map(obj => ({
                id: obj.id,
                name: obj.name,
                description: obj.description,
                content: obj.instruction,
                rawContent: obj.rawContent,
                path: obj.path || '',
                enabled: true,
                trustLevel: 'Auto' as const,
                source: this.skillRegistry.getSource(obj.id) || 'global'
            }));
    }
}
