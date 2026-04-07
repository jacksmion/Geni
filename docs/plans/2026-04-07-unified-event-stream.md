# Unified Event Stream Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 AgentRuntime 的 4 个散装 Callback（onStream、onStepUpdate、setStateChangeCallback、setAuthorizationCallback）替换为单一的 `emit(AgentEvent)` 管道，Controller 层适配为现有 IPC 协议作为兼容桥。

**Architecture:** AgentRuntime 只产出语义事件（AgentEvent 辨识联合类型），Controller 订阅 emit 并翻译为现有 IPC 通道（agent:stream、agent:step、agent:state、agent:error），前端 useChatStore 无感知变化。采用双写策略：Phase 1 Runtime 同时调 emit + 旧 callback，Phase 4 才删旧 callback，降低重构风险。

**Tech Stack:** TypeScript, Electron IPC, Zustand

---

## Task 1: 定义 AgentEvent 联合类型

**Files:**
- Modify: `src/common/types/agentEvents.ts`
- Modify: `src/main/services/agent/IAgent.ts`

**Step 1: 替换 agentEvents.ts**

```typescript
// src/common/types/agentEvents.ts
import { ChatMessage } from './chat';
import { ErrorCategory } from '../../main/services/agent/ErrorClassifier';

/**
 * IPC Payload Definitions（保持不变）
 */
export interface AgentStartRequest {
    sessionId?: string;
    prompt: string;
    options?: {
        model?: string;
        skills?: string[];
    };
}

export interface AgentStartResponse {
    success: boolean;
    sessionId?: string;
    error?: string;
}

export interface SessionCreateResponse {
    id: string;
    createdAt: number;
}

/** Legacy IPC payloads - 兼容期保留 */
export interface AgentStreamEventPayload {
    content: string;
    isReset?: boolean;
}

export interface AgentStepEventPayload {
    steps: any[];
}

// ===== 传输信封 =====
export interface AgentEventEnvelope {
    sessionId: string;
    timestamp: number;
    event: AgentEvent;
}

// ===== AgentStateEvent 内联定义（避免循环依赖 common -> main）=====
export interface AgentStateEvent {
    previousState: string;
    currentState: string;
    message?: string;
    metadata?: Record<string, any>;
    timestamp: number;
}

// ===== 语义事件联合类型 =====
export type AgentEvent =
    | { type: 'agent_start';       payload: { taskDescription?: string } }
    | { type: 'turn_start';        payload: { turnIndex: number } }
    | { type: 'message_delta';     payload: { delta: string } }
    | { type: 'reasoning_delta';   payload: { delta: string } }
    | { type: 'tool_start';        payload: { toolCallId: string; toolName: string; args: Record<string, any> } }
    | { type: 'tool_end';          payload: { toolCallId: string; result: string; isError: boolean; duration: number } }
    | { type: 'turn_end';          payload: { turnIndex: number; hadToolCalls: boolean } }
    | { type: 'state_change';      payload: AgentStateEvent }
    | { type: 'auth_request';      payload: { requestId: string; toolName: string; args: Record<string, any>; reason: string } }
    | { type: 'steering_detected'; payload: { newMessage: string; skippedTools: string[] } }
    | { type: 'agent_end';         payload: { totalSteps: number; newMessages: ChatMessage[] } }
    | { type: 'error';             payload: { message: string; category?: ErrorCategory } };

export type AgentEventType = AgentEvent['type'];
```

> **循环依赖说明**：`common/types/agentEvents.ts` 导入了 `main/services/agent/ErrorClassifier`。若编译报错，将 `ErrorCategory` 枚举移动到 `src/common/types/agent.ts`，并在 `ErrorClassifier.ts` 中从 common 导入，然后 re-export。

**Step 2: 在 IAgent.ts 添加 emit 到 AgentRunOptions**

```typescript
// 新增 import
import { AgentEvent } from '../../../common/types/agentEvents';

export interface AgentRunOptions {
    model?: string;
    temperature?: number;
    systemPrompt?: string;
    skills?: Skill[];
    history?: ChatMessage[];
    signal?: AbortSignal;
    emit?: (event: AgentEvent) => void;  // 新增
}
```

**Step 3: 编译检查**

```bash
npx tsc --noEmit 2>&1 | head -30
```

预期无错误。若有循环依赖报错，将 `ErrorCategory` 迁移到 `src/common/types/agent.ts`。

**Step 4: Commit**

```bash
git add src/common/types/agentEvents.ts src/main/services/agent/IAgent.ts
git commit -m "feat(types): define AgentEvent discriminated union for unified event stream"
```

---

## Task 2: AgentRuntime 双写 emit + 旧 callback

**Files:**
- Modify: `src/main/services/agent/AgentRuntime.ts`

**Step 1: 在 AgentRuntimeOptions 中继承 emit**

`AgentRuntimeOptions extends AgentRunOptions`，已自动继承 `emit` 字段，无需额外修改接口。

**Step 2: 在 `run()` 开头 emit `agent_start`**

在 `sessionStateManager.transition(AgentState.Thinking, ...)` 之后添加：

```typescript
options?.emit?.({ type: 'agent_start', payload: { taskDescription: prompt.slice(0, 100) } });
```

**Step 3: 在 while 循环顶部 emit `turn_start`**

在 `onStream?.('', true)` 调用之后：

```typescript
options?.emit?.({ type: 'turn_start', payload: { turnIndex: loopCount } });
```

**Step 4: 在 `executeLlmTurn()` switch-case 内双写**

`content_delta` case：
```typescript
case 'content_delta':
    if (isReasoning) { isReasoning = false; onStream?.('\n```\n\n'); }
    currentContent += event.delta;
    onStream?.(event.delta);
    options?.emit?.({ type: 'message_delta', payload: { delta: event.delta } });
    break;
```

`reasoning_delta` case：
```typescript
case 'reasoning_delta':
    if (!isReasoning) { isReasoning = true; onStream?.('```thinking\n'); }
    currentReasoning += event.delta;
    onStream?.(event.delta);
    options?.emit?.({ type: 'reasoning_delta', payload: { delta: event.delta } });
    break;
```

> 注意：`executeLlmTurn` 当前接收 `options?: AgentRuntimeOptions`（line 331），`emit` 已可通过 `options?.emit?.()` 访问。

**Step 5: 在 `handleToolCalls()` 中 emit tool 事件**

`handleToolCalls` 当前签名（line 435）：需在末尾参数后加 `emit?: (event: AgentEvent) => void`，调用处同步传入 `options?.emit`。

```typescript
// 在 authorized 检查通过、startTime 记录后：
emit?.({ type: 'tool_start', payload: { toolCallId: tc.id, toolName: fnName, args } });

// 在 obs 截断后、recordToolResult 前：
emit?.({ type: 'tool_end', payload: { toolCallId: tc.id, result: obs, isError: !!result.isError, duration } });
```

**Step 6: 在 `run()` 主循环 emit `turn_end`**

在 `handleToolCalls` 调用之后（工具有无均需触发）：

```typescript
const hadToolCalls = toolCalls.length > 0;
options?.emit?.({ type: 'turn_end', payload: { turnIndex: loopCount, hadToolCalls } });
```

**Step 7: 在 `run()` 正常返回前 emit `agent_end`**

```typescript
// 在 return { finalAnswer, steps, newMessages } 之前：
options?.emit?.({ type: 'agent_end', payload: { totalSteps: steps.length, newMessages } });
```

**Step 8: 在 `handleError()` 中 emit `error`**

`handleError` 需接收 `emit` 参数或直接取 options：

```typescript
// handleError 已接收 error，在 classifyError 调用后：
options?.emit?.({ type: 'error', payload: { message: classified.message, category: classified.category } });
```

**Step 9: state_change 的 emit 注入**

在 `run()` 内构建 `sessionStateManager` 时修改为：

```typescript
const sessionStateManager = new AgentStateManager((stateEvent) => {
    options?.onStateChange?.(stateEvent);  // 保留旧路径
    options?.emit?.({ type: 'state_change', payload: {
        previousState: stateEvent.previousState,
        currentState: stateEvent.currentState,
        message: stateEvent.message,
        metadata: stateEvent.metadata,
        timestamp: stateEvent.timestamp
    }});
});
```

**Step 10: auth_request emit**

在 `checkAuthorization()` 的 `requiresUserConfirmation` 分支中，`steps.push(...)` 之后：

```typescript
emit?.({ type: 'auth_request', payload: {
    requestId: req.requestId,
    toolName: req.toolName,
    args: req.args,
    reason: decision.reason || ''
}});
```

> `checkAuthorization` 需同样加 `emit` 参数并从 `handleToolCalls` 透传。

**Step 11: 编译检查**

```bash
npx tsc --noEmit
```

**Step 12: Commit**

```bash
git add src/main/services/agent/AgentRuntime.ts
git commit -m "feat(runtime): emit AgentEvent alongside legacy callbacks (dual-write)"
```

---

## Task 3: AgentController 订阅 emit

**Files:**
- Modify: `src/main/controllers/AgentController.ts`

**Step 1: 新增 `buildEmitFn()` 私有方法**

```typescript
import { AgentEvent } from '../../common/types/agentEvents';

private buildEmitFn(_sid: string): (event: AgentEvent) => void {
    return (event: AgentEvent) => {
        // Phase 1: 仅 log，等 Phase 4 再接管 IPC 广播
        // state_change / auth_request / error 已有独立路径，暂不重复
        if (event.type !== 'state_change' && event.type !== 'auth_request') {
            console.log(`[AgentController] emit <- ${event.type}`);
        }
    };
}
```

**Step 2: 在 `handleStart()` 的 runOptions 中传入 emit**

```typescript
const runOptions: AgentRuntimeOptions = {
    signal: controller.signal,
    history: history,
    model: options?.model,
    skills: skillList,
    sessionId: sid,
    emit: this.buildEmitFn(sid),  // 新增
};
```

**Step 3: 启动应用验证**

```bash
npm run dev
```

发送一条消息，在主进程 console 观察以下日志序列：
```
[AgentController] emit <- agent_start
[AgentController] emit <- turn_start
[AgentController] emit <- message_delta   (多次)
[AgentController] emit <- turn_end
[AgentController] emit <- agent_end
```

现有 stream / steps / state change 功能不受影响。

**Step 4: Commit**

```bash
git add src/main/controllers/AgentController.ts
git commit -m "feat(controller): subscribe AgentEvent emit (Phase 1 log-only bridge)"
```

---

## Task 4: 单元测试

**Files:**
- Create: `tests/common/types/agentEvents.test.ts`

**Step 1: 编写测试**

```typescript
import { describe, it, expect } from 'vitest';
import type { AgentEvent, AgentEventType } from '../../../src/common/types/agentEvents';

describe('AgentEvent discriminated union', () => {
    it('covers all 12 event types', () => {
        const allTypes: AgentEventType[] = [
            'agent_start', 'turn_start', 'message_delta', 'reasoning_delta',
            'tool_start', 'tool_end', 'turn_end', 'state_change',
            'auth_request', 'steering_detected', 'agent_end', 'error'
        ];
        expect(allTypes).toHaveLength(12);
    });

    it('narrows payload correctly via switch', () => {
        const event: AgentEvent = { type: 'message_delta', payload: { delta: 'hello' } };
        let result = '';
        switch (event.type) {
            case 'message_delta':
                result = event.payload.delta;
                break;
        }
        expect(result).toBe('hello');
    });

    it('agent_end payload has no finalAnswer field', () => {
        const event: AgentEvent = {
            type: 'agent_end',
            payload: { totalSteps: 3, newMessages: [] }
        };
        expect(Object.keys(event.payload)).not.toContain('finalAnswer');
    });
});
```

**Step 2: 运行测试**

```bash
npm run test -- tests/common/types/agentEvents.test.ts
```

预期：3 passed。

**Step 3: Commit**

```bash
git add tests/common/types/agentEvents.test.ts
git commit -m "test(types): verify AgentEvent discriminated union structure"
```

---

## 验收标准

1. `npm run dev` 正常启动，聊天功能完整（stream、steps、state、error 均正常）
2. 主进程 console 出现 `emit <-` 系列事件日志
3. `npx tsc --noEmit` 0 错误
4. `npm run test` agentEvents.test.ts 通过
5. `preload.ts` 和 `useChatStore.ts` 无任何修改
