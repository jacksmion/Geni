# Cowork 功能演进路线图 (Feature Roadmap)

> **创建日期**: 2026-02-07  
> **版本**: v1.0  
> **状态**: 规划中

---

## 概述

本文档记录 Cowork 项目的功能演进计划，包含详细的需求描述、技术方案和验收标准。
按优先级分为 P0 (核心优化)、P1 (体验增强)、P3 (高级功能) 三个阶段。

---

## 📋 功能列表

| 编号 | 功能名称 | 优先级 | 难度 | 状态 |
|:----:|:---------|:------:|:----:|:----:|
| F001 | Token Counter 精确化 | P0 | ⭐⭐ | 📋 待开发 |
| F002 | 流式中断优化 | P0 | ⭐⭐ | 📋 待开发 |
| F003 | 错误恢复机制 | P0 | ⭐⭐⭐ | 📋 待开发 |
| F004 | 响应式布局优化 | P1 | ⭐⭐ | ✅ 已完成 |
| F005 | Multi-Agent 协作 | P3 | ⭐⭐⭐⭐⭐ | 📋 待开发 |
| F006 | 工具执行确认机制 | P0 | ⭐⭐ | ✅ 已完成 |
| F007 | 增强型 Agentic Loop | P0 | ⭐⭐⭐ | 📋 待方案 |


---

## F001: Token Counter 精确化

### 📌 状态: 📋 待开发

### 问题描述

当前 `TokenCounter` 使用简单的字符估算 (`字符数/4`)，误差可达 20-30%，导致：
- 上下文裁剪过度：丢失重要历史信息
- 上下文裁剪不足：超出模型 Token 限制导致 API 错误
- 成本估算不准确

### 当前实现

```typescript
// src/main/services/agent/TokenCounter.ts
static count(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);  // 简单估算
}
```

### 目标

实现精确的 Token 计数，支持不同模型的 Tokenizer。

### 技术方案

#### 方案 A: 使用 `tiktoken` (推荐)

```typescript
import { encoding_for_model, TiktokenModel } from 'tiktoken';

export class TokenCounter {
    private static encoderCache = new Map<string, Tiktoken>();

    static getEncoder(model: string): Tiktoken {
        if (!this.encoderCache.has(model)) {
            try {
                const encoder = encoding_for_model(model as TiktokenModel);
                this.encoderCache.set(model, encoder);
            } catch {
                // 降级到 cl100k_base (GPT-4/3.5 通用)
                const encoder = encoding_for_model('gpt-4');
                this.encoderCache.set(model, encoder);
            }
        }
        return this.encoderCache.get(model)!;
    }

    static count(text: string, model: string = 'gpt-4'): number {
        if (!text) return 0;
        const encoder = this.getEncoder(model);
        return encoder.encode(text).length;
    }

    static countMessages(messages: ChatMessage[], model: string = 'gpt-4'): number {
        const encoder = this.getEncoder(model);
        let total = 0;

        for (const msg of messages) {
            // 每条消息有固定开销
            total += 4; // <|im_start|>{role}\n{content}<|im_end|>
            
            if (msg.content) {
                total += encoder.encode(msg.content).length;
            }
            
            if (msg.tool_calls) {
                for (const call of msg.tool_calls) {
                    total += encoder.encode(call.function.name).length;
                    total += encoder.encode(call.function.arguments).length;
                    total += 10; // 工具调用结构开销
                }
            }
        }

        total += 2; // 对话结束开销
        return total;
    }
}
```

#### 方案 B: 使用 `gpt-tokenizer` (轻量级)

```bash
npm install gpt-tokenizer
```

```typescript
import { encode } from 'gpt-tokenizer';

static count(text: string): number {
    return encode(text).length;
}
```

### 涉及文件

| 文件 | 改动 |
|:-----|:-----|
| `src/main/services/agent/TokenCounter.ts` | 核心重构 |
| `src/main/services/agent/ContextManager.ts` | 传递 model 参数 |
| `src/main/services/agent/Summarizer.ts` | 传递 model 参数 |
| `src/main/services/agent/AgentRuntime.ts` | 传递 model 参数 |
| `package.json` | 添加依赖 |

### 验收标准

- [ ] Token 计数误差 < 5%
- [ ] 支持 GPT-4, GPT-3.5, Claude 不同模型
- [ ] 编码器缓存，避免重复创建
- [ ] 降级机制：未知模型使用默认编码器
- [ ] 单元测试覆盖

### 工作量估算

- 开发: 2-3 小时
- 测试: 1 小时

---

## F002: 流式中断优化

### 📌 状态: 📋 待开发

### 问题描述

用户点击"停止"按钮后，Agent 应立即中断当前操作，但当前可能存在以下问题：
1. LLM API 流未正确接收中断信号
2. 工具执行过程中无法中断
3. 中断后状态未正确清理

### 当前实现分析

```typescript
// AgentController.ts
const controller = new AbortController();
this.abortControllers.set(sid, controller);

// AgentRuntime.ts - 需要检查 signal 是否正确传递
const runOptions: AgentRuntimeOptions = {
    signal: controller.signal,  // ✅ 已传递
    ...
};
```

### 目标

1. 用户点击停止后 < 500ms 内中断响应
2. 中断后 Agent 状态正确重置为 Idle
3. 中断后不再产生任何流式输出

### 技术方案

#### 1. LLM 调用中断

```typescript
// OpenAIAdapter.ts / AnthropicAdapter.ts
async *stream(messages: ChatMessage[], options?: ChatModelOptions): AsyncGenerator<ChatStreamEvent> {
    const response = await this.client.chat.completions.create({
        // ...
        stream: true,
    }, {
        signal: options?.signal  // 传递 AbortSignal
    });

    try {
        for await (const chunk of response) {
            // 检查中断
            if (options?.signal?.aborted) {
                console.log('[Adapter] Abort signal received, breaking stream');
                break;
            }
            yield this.convertChunk(chunk);
        }
    } finally {
        // 确保资源清理
        if (response.controller) {
            response.controller.abort();
        }
    }
}
```

#### 2. 工具执行中断

```typescript
// BashTool.ts
async execute(input: { command: string }, signal?: AbortSignal): Promise<ToolExecutionResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, { shell: true });

        // 监听中断信号
        signal?.addEventListener('abort', () => {
            child.kill('SIGTERM');
            resolve({
                toolName: 'bash',
                isError: true,
                result: 'Command aborted by user'
            });
        });

        // ... 正常执行逻辑
    });
}
```

#### 3. AgentRuntime 中断处理

```typescript
// AgentRuntime.ts
async run(...) {
    try {
        // 在每个关键循环点检查中断
        while (continueLoop) {
            if (options?.signal?.aborted) {
                this.stateManager.transition(AgentState.Aborted, 'User interrupted');
                break;
            }

            // LLM 调用
            for await (const event of this.chatModel.stream(messages, { signal: options?.signal })) {
                if (options?.signal?.aborted) break;
                // ...
            }

            // 工具执行
            for (const toolCall of toolCalls) {
                if (options?.signal?.aborted) break;
                await this.executeTool(toolCall, options?.signal);
            }
        }
    } finally {
        // 确保状态重置
        if (this.stateManager.getState() !== AgentState.Idle) {
            this.stateManager.transition(AgentState.Idle, 'Execution completed');
        }
    }
}
```

### 涉及文件

| 文件 | 改动 |
|:-----|:-----|
| `src/main/services/llm/providers/OpenAIAdapter.ts` | 传递 signal |
| `src/main/services/llm/providers/AnthropicAdapter.ts` | 传递 signal |
| `src/main/services/agent/AgentRuntime.ts` | 循环中断检查 |
| `src/main/services/tools/core/BashTool.ts` | 进程终止 |
| `src/common/types/tool.ts` | ITool.execute 添加 signal 参数 |

### 验收标准

- [ ] 点击停止后 < 500ms 停止所有流式输出
- [ ] 正在执行的 bash 命令被终止
- [ ] Agent 状态正确变为 Idle
- [ ] UI 正确显示"已中断"状态
- [ ] 无内存泄漏 (EventListener 正确清理)

### 工作量估算

- 开发: 3-4 小时
- 测试: 2 小时

---

## F003: 错误恢复机制

### 📌 状态: 📋 待开发

### 问题描述

当前系统对错误的处理较为简单，缺乏：
1. API 调用失败自动重试
2. 工具执行失败重试
3. 网络断开优雅降级
4. 错误分类和针对性处理

### 目标

实现健壮的错误恢复机制，减少因临时故障导致的任务失败。

### 技术方案

#### 1. 重试策略定义

```typescript
// src/main/services/agent/RetryPolicy.ts

export interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    retryableErrors: string[];
}

export const DEFAULT_LLM_RETRY: RetryOptions = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    retryableErrors: ['rate_limit', 'timeout', 'connection_error', '529', '503']
};

export const DEFAULT_TOOL_RETRY: RetryOptions = {
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
};

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions,
    onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            
            // 检查是否可重试
            const isRetryable = options.retryableErrors.some(e => 
                error.message?.includes(e) || error.code?.includes(e)
            );
            
            if (!isRetryable || attempt > options.maxRetries) {
                throw error;
            }
            
            // 指数退避
            const delay = Math.min(
                options.baseDelayMs * Math.pow(2, attempt - 1),
                options.maxDelayMs
            );
            
            onRetry?.(attempt, error);
            await sleep(delay);
        }
    }
    
    throw lastError!;
}
```

#### 2. LLM 调用重试

```typescript
// AgentRuntime.ts
async callLLM(messages: ChatMessage[], options: ChatModelOptions): Promise<AsyncGenerator<ChatStreamEvent>> {
    return withRetry(
        () => this.chatModel.stream(messages, options),
        DEFAULT_LLM_RETRY,
        (attempt, error) => {
            console.log(`[AgentRuntime] LLM call failed, retry ${attempt}:`, error.message);
            this.onStateChange?.({
                currentState: AgentState.Thinking,
                previousState: AgentState.Thinking,
                message: `API 调用失败，正在重试 (${attempt}/${DEFAULT_LLM_RETRY.maxRetries})...`,
                timestamp: Date.now()
            });
        }
    );
}
```

#### 3. 工具执行重试

```typescript
// AgentRuntime.ts
async executeTool(toolCall: ToolCall, signal?: AbortSignal): Promise<ToolExecutionResult> {
    const tool = this.toolRegistry.get(toolCall.function.name);
    
    return withRetry(
        () => tool.execute(JSON.parse(toolCall.function.arguments), signal),
        DEFAULT_TOOL_RETRY,
        (attempt, error) => {
            console.log(`[AgentRuntime] Tool ${toolCall.function.name} failed, retry ${attempt}`);
        }
    );
}
```

#### 4. 错误分类与 UI 反馈

```typescript
// src/main/services/agent/ErrorClassifier.ts

export enum ErrorCategory {
    Network = 'network',
    RateLimit = 'rate_limit',
    Authentication = 'auth',
    ToolExecution = 'tool',
    TokenLimit = 'token_limit',
    Unknown = 'unknown'
}

export interface ClassifiedError {
    category: ErrorCategory;
    message: string;
    isRecoverable: boolean;
    suggestedAction?: string;
}

export function classifyError(error: any): ClassifiedError {
    const msg = error.message || String(error);
    
    if (msg.includes('rate_limit') || msg.includes('429')) {
        return {
            category: ErrorCategory.RateLimit,
            message: 'API 调用频率限制',
            isRecoverable: true,
            suggestedAction: '请稍后重试'
        };
    }
    
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
        return {
            category: ErrorCategory.Network,
            message: '网络连接失败',
            isRecoverable: true,
            suggestedAction: '请检查网络连接'
        };
    }
    
    if (msg.includes('401') || msg.includes('invalid_api_key')) {
        return {
            category: ErrorCategory.Authentication,
            message: 'API Key 无效',
            isRecoverable: false,
            suggestedAction: '请检查设置中的 API Key'
        };
    }
    
    if (msg.includes('context_length') || msg.includes('max_tokens')) {
        return {
            category: ErrorCategory.TokenLimit,
            message: '上下文长度超限',
            isRecoverable: true,
            suggestedAction: '正在自动压缩历史记录...'
        };
    }
    
    return {
        category: ErrorCategory.Unknown,
        message: msg,
        isRecoverable: false
    };
}
```

### 涉及文件

| 文件 | 改动 |
|:-----|:-----|
| `src/main/services/agent/RetryPolicy.ts` | 新建 |
| `src/main/services/agent/ErrorClassifier.ts` | 新建 |
| `src/main/services/agent/AgentRuntime.ts` | 集成重试逻辑 |
| `src/main/controllers/AgentController.ts` | 错误分类上报 |
| `src/renderer/components/ErrorToast.tsx` | 新建 (可选) |

### 验收标准

- [ ] LLM 调用 429 错误自动重试 (最多 3 次)
- [ ] 网络超时自动重试 (指数退避)
- [ ] 工具执行失败重试 (最多 2 次)
- [ ] 重试过程中 UI 显示提示
- [ ] 不可恢复错误显示具体建议
- [ ] 重试日志记录完整

### 工作量估算

- 开发: 4-5 小时
- 测试: 2 小时

---

## F004: 响应式布局优化

### 📌 状态: ✅ 已完成

### 问题描述

当前 UI 在不同窗口尺寸下表现不够理想：
1. 窗口过窄时侧边栏挤压聊天区域
2. 消息列表在小屏幕上阅读体验差
3. 缺少布局切换选项

### 目标

1. 支持侧边栏折叠/展开
2. 小窗口自动隐藏侧边栏
3. 消息区域自适应宽度
4. 移动端友好 (如果未来支持)

### 技术方案

#### 1. 侧边栏折叠状态管理

```typescript
// src/renderer/store/useLayoutStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayoutState {
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    toggleSidebar: () => void;
    setSidebarWidth: (width: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
    persist(
        (set) => ({
            sidebarCollapsed: false,
            sidebarWidth: 280,
            toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
            setSidebarWidth: (width) => set({ sidebarWidth: width }),
        }),
        { name: 'layout-storage' }
    )
);
```

#### 2. 响应式断点

```typescript
// src/renderer/hooks/useBreakpoint.ts
import { useState, useEffect } from 'react';

export function useBreakpoint() {
    const [width, setWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return {
        isMobile: width < 640,
        isTablet: width >= 640 && width < 1024,
        isDesktop: width >= 1024,
        isWide: width >= 1280,
    };
}
```

#### 3. 自动折叠逻辑

```typescript
// src/renderer/App.tsx
const { isTablet, isMobile } = useBreakpoint();
const { sidebarCollapsed, toggleSidebar } = useLayoutStore();

// 小屏幕自动折叠
useEffect(() => {
    if (isMobile && !sidebarCollapsed) {
        toggleSidebar();
    }
}, [isMobile]);
```

#### 4. 侧边栏组件改造

```tsx
// Sidebar.tsx
const { sidebarCollapsed, toggleSidebar, sidebarWidth } = useLayoutStore();
const { isMobile } = useBreakpoint();

return (
    <>
        {/* 移动端遮罩 */}
        {isMobile && !sidebarCollapsed && (
            <div 
                className="fixed inset-0 bg-black/50 z-40"
                onClick={toggleSidebar}
            />
        )}
        
        <aside className={cn(
            "flex flex-col h-full bg-slate-50 dark:bg-zinc-900 border-r transition-all duration-300",
            sidebarCollapsed 
                ? "w-0 opacity-0 overflow-hidden" 
                : `w-[${sidebarWidth}px]`,
            isMobile && !sidebarCollapsed && "fixed left-0 top-0 z-50"
        )}>
            {/* 侧边栏内容 */}
        </aside>
    </>
);
```

#### 5. 折叠按钮

```tsx
// 添加到 Header 或 Sidebar
<button
    onClick={toggleSidebar}
    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
    title={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
>
    {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
</button>
```

### 涉及文件

| 文件 | 改动 |
|:-----|:-----|
| `src/renderer/store/useLayoutStore.ts` | 新建 |
| `src/renderer/hooks/useBreakpoint.ts` | 新建 |
| `src/renderer/App.tsx` | 集成响应式逻辑 |
| `src/renderer/modules/sidebar/Sidebar.tsx` | 折叠动画 |
| `src/renderer/modules/chat/ChatLayout.tsx` | 自适应宽度 |

### 验收标准

- [x] 侧边栏可手动折叠/展开
- [x] 窗口宽度 < 640px 自动折叠
- [x] 折叠状态持久化 (localStorage)
- [x] 折叠/展开动画流畅 (< 300ms)
- [x] 快捷键 `Ctrl+B` 切换侧边栏

### 工作量估算

- 开发: 3-4 小时
- 测试: 1 小时

---

## F005: Multi-Agent 协作

### 📌 状态: 📋 待开发

### 问题描述

当前系统只支持单个 Agent 执行任务。对于复杂任务（如完整的功能开发），可能需要多个专业角色协作：
- Architect: 设计系统架构
- Coder: 编写代码实现
- Reviewer: 代码审查
- Tester: 编写测试用例

### 目标

实现 Multi-Agent 协作框架，支持：
1. 定义不同角色的 Agent
2. Agent 间消息传递
3. 任务编排和流转
4. 并行/串行执行模式

### 技术方案

#### 1. Agent 角色定义

```typescript
// src/main/services/agent/roles/AgentRole.ts

export interface AgentRole {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    capabilities: string[];  // 可用的工具子集
    model?: string;          // 可指定不同模型
}

export const BUILTIN_ROLES: Record<string, AgentRole> = {
    architect: {
        id: 'architect',
        name: 'Architect',
        description: '系统架构师，负责设计整体架构和模块划分',
        systemPrompt: `你是一位资深系统架构师。
你的职责是：
1. 分析需求，设计系统架构
2. 定义模块边界和接口
3. 选择合适的技术方案
4. 产出架构设计文档

你不直接编写代码，而是产出设计方案供 Coder 实现。`,
        capabilities: ['read_file', 'file_search', 'read_skill'],
    },
    
    coder: {
        id: 'coder',
        name: 'Coder',
        description: '开发工程师，负责编写高质量代码',
        systemPrompt: `你是一位高级开发工程师。
你的职责是：
1. 根据架构设计实现功能
2. 编写清晰、可维护的代码
3. 遵循项目编码规范
4. 处理边界情况和错误

遵循 Architect 的设计方案进行实现。`,
        capabilities: ['read_file', 'write_file', 'replace_content', 'bash', 'file_search'],
    },
    
    reviewer: {
        id: 'reviewer',
        name: 'Reviewer',
        description: '代码审查员，检查代码质量',
        systemPrompt: `你是一位严格的代码审查员。
你的职责是：
1. 审查代码是否符合设计
2. 检查潜在的 Bug 和安全问题
3. 评估代码可读性和可维护性
4. 提出改进建议

产出审查报告，指出需要修改的地方。`,
        capabilities: ['read_file', 'file_search'],
    },
    
    tester: {
        id: 'tester',
        name: 'Tester',
        description: '测试工程师，编写测试用例',
        systemPrompt: `你是一位测试工程师。
你的职责是：
1. 根据功能编写单元测试
2. 设计边界测试用例
3. 执行测试并报告结果
4. 确保代码覆盖率达标

使用项目的测试框架编写测试。`,
        capabilities: ['read_file', 'write_file', 'bash', 'file_search'],
    },
};
```

#### 2. Multi-Agent 编排器

```typescript
// src/main/services/agent/MultiAgentOrchestrator.ts

export interface AgentTask {
    id: string;
    roleId: string;
    prompt: string;
    dependencies?: string[];  // 依赖的其他任务 ID
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: string;
}

export interface Workflow {
    id: string;
    name: string;
    description: string;
    tasks: AgentTask[];
}

export class MultiAgentOrchestrator {
    private agents: Map<string, AgentRuntime> = new Map();
    private roles: Map<string, AgentRole>;
    
    constructor(
        private toolRegistry: ToolRegistry,
        private settings: AppSettings
    ) {
        this.roles = new Map(Object.entries(BUILTIN_ROLES));
    }
    
    // 创建角色专用 Agent
    private getAgentForRole(roleId: string): AgentRuntime {
        if (!this.agents.has(roleId)) {
            const role = this.roles.get(roleId);
            if (!role) throw new Error(`Unknown role: ${roleId}`);
            
            // 创建受限工具注册表
            const limitedRegistry = new ToolRegistry();
            for (const cap of role.capabilities) {
                const tool = this.toolRegistry.get(cap);
                if (tool) limitedRegistry.register(tool);
            }
            
            // 创建专用 Agent
            const agent = new AgentRuntime(
                { ...this.settings, systemPrompt: role.systemPrompt },
                limitedRegistry
            );
            
            this.agents.set(roleId, agent);
        }
        
        return this.agents.get(roleId)!;
    }
    
    // 执行工作流
    async executeWorkflow(
        workflow: Workflow,
        onProgress?: (task: AgentTask) => void
    ): Promise<Map<string, string>> {
        const results = new Map<string, string>();
        const completed = new Set<string>();
        
        while (completed.size < workflow.tasks.length) {
            // 找到可执行的任务 (依赖已完成)
            const runnableTasks = workflow.tasks.filter(t => 
                t.status === 'pending' &&
                (t.dependencies || []).every(d => completed.has(d))
            );
            
            // 并行执行无依赖的任务
            await Promise.all(runnableTasks.map(async (task) => {
                task.status = 'running';
                onProgress?.(task);
                
                try {
                    const agent = this.getAgentForRole(task.roleId);
                    
                    // 注入依赖任务的结果到上下文
                    let contextPrompt = task.prompt;
                    if (task.dependencies) {
                        const depResults = task.dependencies
                            .map(d => `[${d} 结果]: ${results.get(d)}`)
                            .join('\n\n');
                        contextPrompt = `${depResults}\n\n${task.prompt}`;
                    }
                    
                    const result = await agent.run(contextPrompt, [], {});
                    task.result = result.finalContent;
                    task.status = 'completed';
                    results.set(task.id, result.finalContent || '');
                    completed.add(task.id);
                } catch (error: any) {
                    task.status = 'failed';
                    task.result = error.message;
                }
                
                onProgress?.(task);
            }));
        }
        
        return results;
    }
}
```

#### 3. 预定义工作流模板

```typescript
// src/main/services/agent/workflows/FeatureDevelopment.ts

export const FEATURE_DEVELOPMENT_WORKFLOW: Workflow = {
    id: 'feature-dev',
    name: '功能开发工作流',
    description: '完整的功能开发流程：设计 -> 实现 -> 审查 -> 测试',
    tasks: [
        {
            id: 'design',
            roleId: 'architect',
            prompt: '请根据需求设计技术方案，包括：模块划分、接口定义、数据结构',
            status: 'pending',
        },
        {
            id: 'implement',
            roleId: 'coder',
            prompt: '请根据架构设计实现功能代码',
            dependencies: ['design'],
            status: 'pending',
        },
        {
            id: 'review',
            roleId: 'reviewer',
            prompt: '请审查实现的代码，检查是否符合设计、有无 Bug',
            dependencies: ['implement'],
            status: 'pending',
        },
        {
            id: 'test',
            roleId: 'tester',
            prompt: '请为实现的功能编写单元测试',
            dependencies: ['implement'],  // 与 review 并行
            status: 'pending',
        },
    ],
};
```

#### 4. IPC 接口

```typescript
// src/common/ipc/channels.ts
export const MULTI_AGENT_CHANNELS = {
    START_WORKFLOW: 'multi-agent:start-workflow',
    STOP_WORKFLOW: 'multi-agent:stop',
    GET_ROLES: 'multi-agent:get-roles',
    GET_WORKFLOWS: 'multi-agent:get-workflows',
} as const;

export const MULTI_AGENT_EVENTS = {
    TASK_UPDATE: 'multi-agent:task-update',
    WORKFLOW_COMPLETE: 'multi-agent:complete',
} as const;
```

#### 5. UI 组件

```tsx
// 工作流启动对话框
<WorkflowDialog 
    workflows={workflows}
    onStart={(workflowId, userPrompt) => {
        window.electronAPI.multiAgent.startWorkflow(workflowId, userPrompt);
    }}
/>

// 工作流进度视图
<WorkflowProgress 
    tasks={tasks}
    showAgent={(roleId) => <AgentAvatar role={roleId} />}
/>
```

### 涉及文件

| 文件 | 改动 |
|:-----|:-----|
| `src/main/services/agent/roles/AgentRole.ts` | 新建 |
| `src/main/services/agent/MultiAgentOrchestrator.ts` | 新建 |
| `src/main/services/agent/workflows/*.ts` | 新建 |
| `src/main/controllers/MultiAgentController.ts` | 新建 |
| `src/common/ipc/channels.ts` | 添加通道 |
| `src/renderer/components/WorkflowDialog.tsx` | 新建 |
| `src/renderer/components/WorkflowProgress.tsx` | 新建 |

### 验收标准

- [ ] 支持定义自定义 Agent 角色
- [ ] 工作流任务正确按依赖顺序执行
- [ ] 无依赖任务可并行执行
- [ ] 任务结果正确传递给下游任务
- [ ] UI 实时显示各 Agent 执行状态
- [ ] 支持中断整个工作流
- [ ] 提供 2-3 个预定义工作流模板

### 工作量估算

- 设计: 4 小时
- 开发: 12-16 小时
- 测试: 4 小时

---

- 测试: 4 小时

---

## F006: 工具执行确认机制

### 📌 状态: 📋 待开发

### 问题描述

当前 Agent 后端已实现 `ToolGuard` 拦截器和信任级别评估，但当前端未连接授权回调时，高风险操作（如 `bash` 命令、`execute_command`）会被静默拒绝（为了安全），导致 Agent 无法执行合理但有风险的任务，用户也无法感知被拦截的原因。

### 目标

实现用户授权交互流程，使得 Agent 在执行高风险操作前能请求用户许可，用户可以选择单次允许、拒绝或一段时间内允许。

### 技术方案

#### 1. IPC 协议扩展

- **Channel**: `agent:authorization-response` (Renderer -> Main)
- **Event**: `agent:authorization-request` (Main -> Renderer)

#### 2. AgentController 集成

连接 `AgentRuntime` 的 `onAuthorizationRequired` 回调与 IPC 通道。

```typescript
// AgentController.ts
onAuthorizationRequired: async (request, decision) => {
    return new Promise((resolve) => {
        // 发送请求到前端
        this.broadcast(AGENT_EVENTS.AUTHORIZATION_REQUEST, {
            requestId: crypto.randomUUID(),
            toolName: request.toolName,
            args: request.args,
            trustLevel: decision.trustLevel,
            reason: decision.reason
        });

        // 等待响应
        // 注意：需要实现请求 ID 匹配机制以支持并发（虽然通常是串行的）
        ipcMain.once(AGENT_CHANNELS.AUTHORIZATION_RESPONSE, (_, response) => {
            resolve({
                approved: response.approved,
                rememberDecision: response.remember
            });
        });
    });
}
```

#### 3. 前端授权 UI

实现 `AuthorizationModal` 组件，展示：
- 待执行的工具名称
- 参数预览（JSON 格式化）
- 风险提示
- 操作按钮：[拒绝] [允许] [允许并记住(1小时)]

### 涉及文件

| 文件 | 改动 |
|:-----|:-----|
| `src/common/ipc/channels.ts` | 添加常量 |
| `src/main/controllers/AgentController.ts` | 实现回调桥接 |
| `src/renderer/components/modals/AuthorizationModal.tsx` | 新建组件 |
| `src/renderer/App.tsx` | 挂载全局 Modal |

### 验收标准

- [ ] 执行 `bash` 命令时弹出确认框
- [ ] 用户点击"拒绝"后，Agent 收到拒绝信息并尝试其他方式
- [ ] 用户点击"允许"后，命令正常执行
- [ ] "允许并记住"功能生效，1小时内不再询问同类操作
- [ ] 无操作超时处理（可选）

### 工作量估算

- 开发: 2-3 小时
- 测试: 0.5 小时

---

## 附录

### A. 状态说明

| 状态 | 说明 |
|:-----|:-----|
| 📋 待开发 | 需求已确认，等待排期 |
| 🚧 开发中 | 正在开发 |
| 🧪 测试中 | 开发完成，正在测试 |
| ✅ 已完成 | 测试通过，已上线 |
| ❌ 已废弃 | 需求变更，不再开发 |

### B. 变更记录

| 日期 | 版本 | 变更内容 |
|:-----|:-----|:---------|
| 2026-02-07 | v1.1 | 新增 F006 工具执行确认机制 |
| 2026-02-07 | v1.0 | 初始版本，包含 5 个功能需求 |
---

## F007: 增强型 Agentic Loop

### 📌 状态: 📋 待方案 (借鉴 pi-ai 实现)

### 问题描述

当前的 `AgentRuntime` 执行逻辑较为“封闭”且回调分散：
1. **反馈通道不统一**：`onStream`, `onStepUpdate`, `onStateChange` 逻辑并行，前端处理复杂。
2. **缺乏实时干预**：Agent 一旦开始运行，除非强行中止，否则无法在运行中接收新的用户指令。
3. **工具执行死板**：无法在多步工具执行中间动态“切向”或“跳过”。

### 目标

引入 `pi-ai` 风格的高级循环模式，实现：
1. **统一事件流**：所有行为（LLM 流、工具开始/结束、状态切换）通过单一事件总线分发。
2. **实时舵向控制 (Steering)**：允许在 LLM 回合间隙或工具执行间隙注入用户消息，动态修正任务方向。
3. **协作式中断**：支持根据干预指令主动跳过（Skip）无意义的后续工具调用。

### 技术方案

详见：[Requirement_2026_02_10_Enhanced_Agent_Loop.md](./Requirement_2026_02_10_Enhanced_Agent_Loop.md)

- **核心变更**：
    - `AgentRuntime.run` 逻辑重构为 Outer/Inner 双层循环。
    - 引入 `AgentEvent` 类型包装所有回调。
    - 增加 `getSteeringMessages` 轮询机制。

### 验收标准

- [ ] 实现统一的消息处理流，前端渲染无卡顿。
- [ ] Agent 在执行文件读写工具间隙能检测到并处理用户插话。
- [ ] 任务方向改变后，剩余已声明未执行的工具被标记为 `Skipped` 而非报错。
- [ ] 兼容现有的 `IChatModel` 适配层。

### 工作量估算

- 核心架构重构: 6-8 小时
- 前端事件对接: 3-4 小时
- 测试与调优: 2 小时
