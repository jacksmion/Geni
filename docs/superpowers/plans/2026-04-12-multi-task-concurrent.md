# Multi-Task Concurrent Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support multiple chat sessions running simultaneously, each with its own running state, with running status visible in the sidebar.

**Architecture:** Refactor `AgentController` from single-instance state to per-session Maps. Make `handleStart` fire-and-forget so multiple agents can run concurrently. Add `sessionId` to all IPC events so the frontend can route events to the correct session. Replace global `isSending` in the store with a per-session `runningSessions` Map.

**Tech Stack:** Electron IPC, Zustand, React, TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/common/types/agentEvents.ts` | Modify | Add `runId` to `AgentStartResponse`, add `sessionId` to event payloads |
| `src/main/controllers/AgentController.ts` | Modify | Per-session state, fire-and-forget start, session-aware throttling |
| `src/main/preload.ts` | Modify | Pass `sessionId` as first arg in all `onXxx` callbacks |
| `src/renderer/electron-api.d.ts` | Modify | Update `onXxx` type signatures to include `sessionId` |
| `src/renderer/store/useChatStore.ts` | Modify | Replace `isSending`/`activeRunId`/`currentAgentEvent` with `runningSessions` Map |
| `src/renderer/layouts/sidebar/SessionSidebar.tsx` | Modify | Add green pulse dot for running sessions |
| `src/renderer/modules/chat/Composer.tsx` | Modify | Use `runningSessions.has(activeSessionId)` instead of `isSending` |
| `src/renderer/modules/chat/MessageList.tsx` | Modify | Use `runningSessions.has(activeSessionId)` instead of `isSending` |
| `src/renderer/components/StatusIndicator.tsx` | Modify | Read agent state from `runningSessions` instead of `currentAgentEvent` |
| `src/renderer/components/ThoughtTrace.tsx` | Modify | Get `activeRunId` from `runningSessions` instead of global state |

---

### Task 1: Add `runId` to AgentStartResponse and sessionId to event payloads

**Files:**
- Modify: `src/common/types/agentEvents.ts`

- [ ] **Step 1: Update AgentStartResponse to include runId**

```typescript
export interface AgentStartResponse {
    success: boolean;
    sessionId?: string;
    runId?: string;
    error?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/common/types/agentEvents.ts
git commit -m "feat: add runId to AgentStartResponse for multi-task support"
```

---

### Task 2: Refactor AgentController — per-session state and fire-and-forget

**Files:**
- Modify: `src/main/controllers/AgentController.ts`

This is the largest change. Replace all single-instance state with per-session Maps.

- [ ] **Step 1: Replace single-instance fields with per-session state**

Replace the existing single-instance fields:

```typescript
// REMOVE these fields:
// private activeWebContents: WebContents | null = null;
// private streamBuffer: string = '';
// private reasoningBuffer: string = '';
// private throttleTimer: NodeJS.Timeout | null = null;
// private throttleRef: number = 0;
// private activeSteps: AgentStep[] = [];
// private activeRunId: string | null = null;

// ADD these per-session structures:
private sessionStates = new Map<string, {
    runId: string;
    streamBuffer: string;
    reasoningBuffer: string;
    activeSteps: AgentStep[];
    throttleTimer: NodeJS.Timeout | null;
    throttleRef: number;
}>();
private sessionSenders = new Map<string, WebContents>();

private readonly THROTTLE_MS = 120;
```

- [ ] **Step 2: Rewrite buildEmitFn to use per-session state**

```typescript
private buildEmitFn(sessionId: string, sender: WebContents): (event: InternalAgentEvent) => void {
    return (event: InternalAgentEvent) => {
        const state = this.sessionStates.get(sessionId);
        if (!state) return;

        switch (event.type) {
            case 'turn_start':
                if (event.payload.resetStream) {
                    this.flushThrottledEvents(sessionId);
                    state.reasoningBuffer = '';
                    this.sendToSender(sender, AGENT_EVENTS.STREAM, { sessionId, content: '', isReset: true });
                    this.sendToSender(sender, AGENT_EVENTS.REASONING_STREAM, { sessionId, content: '', isReset: true });
                }
                break;
            case 'message_delta':
                state.streamBuffer += event.payload.delta;
                break;
            case 'reasoning_delta':
                state.reasoningBuffer += event.payload.delta;
                break;
            case 'tool_start':
                state.activeSteps.push(event.payload);
                this.sendToSender(sender, AGENT_EVENTS.STEP_UPDATE, { sessionId, steps: [...state.activeSteps] });
                break;
            case 'tool_end': {
                const idx = state.activeSteps.findIndex(
                    s => s.tool === event.payload.tool && !s.isComplete
                );
                if (idx >= 0) {
                    state.activeSteps[idx] = event.payload;
                } else {
                    state.activeSteps.push(event.payload);
                }
                this.sendToSender(sender, AGENT_EVENTS.STEP_UPDATE, { sessionId, steps: [...state.activeSteps] });
                break;
            }
            case 'auth_request': {
                const { requestId, toolName, args, reason } = event.payload;
                const authStep: AgentStep = {
                    tool: toolName,
                    toolInput: JSON.stringify(args),
                    isComplete: false,
                    isWaitingAuthorization: true,
                    authRequestId: requestId,
                    authReason: reason
                };
                state.activeSteps.push(authStep);
                this.sendToSender(sender, AGENT_EVENTS.STEP_UPDATE, { sessionId, steps: [...state.activeSteps] });
                this.sendToSender(sender, AGENT_EVENTS.AUTHORIZATION_REQUEST, {
                    ...event.payload,
                    sessionId,
                    runId: state.runId
                });
                break;
            }
            case 'agent_end':
                this.flushThrottledEvents(sessionId);
                break;
            case 'error':
                this.sendToSender(sender, AGENT_EVENTS.ERROR, { sessionId, ...event.payload });
                break;
            case 'turn_end':
                break;
            case 'state_change':
                this.sendToSender(sender, AGENT_EVENTS.STATE_CHANGE, { sessionId, ...event.payload });
                break;
        }
    };
}

private sendToSender(sender: WebContents, channel: string, payload: any) {
    if (sender && !sender.isDestroyed()) {
        sender.send(channel, payload);
    }
}
```

- [ ] **Step 3: Rewrite handleStart as fire-and-forget**

```typescript
private async handleStart(event: IpcMainInvokeEvent, payload: AgentStartRequest): Promise<AgentStartResponse> {
    const sender = event.sender;

    try {
        const { sessionId, prompt, options } = payload;

        // 1. Resolve or create session
        let sid = sessionId;
        if (!sid) {
            const newSession = await this.sessionManager.createSession();
            sid = newSession.id;
        }

        // 2. If session already running, stop it first
        if (this.abortControllers.has(sid)) {
            this.abortControllers.get(sid)!.abort();
            this.cleanupSessionState(sid);
        }

        // 3. Initialize per-session state
        const runId = crypto.randomUUID();
        this.sessionStates.set(sid, {
            runId,
            streamBuffer: '',
            reasoningBuffer: '',
            activeSteps: [],
            throttleTimer: null,
            throttleRef: 0,
        });
        this.sessionSenders.set(sid, sender);

        // 4. Setup AbortController
        const controller = new AbortController();
        this.abortControllers.set(sid, controller);

        // 5. Build Agent from payload
        const agent = this.resolveAgent(payload);

        // 6. Build request
        const request: AgentRunRequest = {
            sessionId: sid,
            prompt,
            signal: controller.signal,
            emit: this.buildEmitFn(sid, sender),
            skillIds: options?.skills,
            workspacePath: this.settings.workspacePath,
            language: this.settings.language
        };

        // 7. Run in background (fire-and-forget)
        this.runAgent(sid, agent, request);

        return { success: true, sessionId: sid, runId };

    } catch (error: any) {
        console.error('[AgentController] Agent execution failed:', error);
        return { success: false, error: error.message };
    }
}
```

- [ ] **Step 4: Add runAgent and cleanupSessionState methods**

```typescript
private async runAgent(sessionId: string, agent: Agent, request: AgentRunRequest) {
    try {
        await this.runtime.run(agent, request);
    } catch (error: any) {
        console.error('[AgentController] Agent execution failed:', error);
        const sender = this.sessionSenders.get(sessionId);
        if (sender && !sender.isDestroyed()) {
            sender.send(AGENT_EVENTS.ERROR, { sessionId, message: error.message });
        }
    } finally {
        const sender = this.sessionSenders.get(sessionId);
        this.cleanupSessionState(sessionId);

        // Notify frontend that session ended
        if (sender && !sender.isDestroyed()) {
            sender.send(AGENT_EVENTS.STATE_CHANGE, {
                sessionId,
                previousState: 'Running',
                currentState: 'Idle',
                timestamp: Date.now()
            });
        }
    }
}

private cleanupSessionState(sessionId: string) {
    const state = this.sessionStates.get(sessionId);
    if (state?.throttleTimer) clearInterval(state.throttleTimer);
    this.sessionStates.delete(sessionId);
    this.abortControllers.delete(sessionId);
    this.sessionSenders.delete(sessionId);
}
```

- [ ] **Step 5: Rewrite handleStop to cleanup sessionStates**

```typescript
private handleStop(_event: IpcMainInvokeEvent, sessionId?: string) {
    if (sessionId) {
        const controller = this.abortControllers.get(sessionId);
        if (controller) {
            controller.abort();
        }
        this.cleanupSessionState(sessionId);
    } else {
        for (const [sid, controller] of this.abortControllers.entries()) {
            controller.abort();
            const state = this.sessionStates.get(sid);
            if (state?.throttleTimer) clearInterval(state.throttleTimer);
        }
        this.abortControllers.clear();
        this.sessionStates.clear();
        this.sessionSenders.clear();
    }
}
```

- [ ] **Step 6: Rewrite throttling methods to be per-session**

```typescript
private startThrottling(sessionId: string) {
    const state = this.sessionStates.get(sessionId);
    if (!state) return;
    state.throttleRef++;
    if (state.throttleTimer) return;
    state.throttleTimer = setInterval(() => this.flushThrottledEvents(sessionId), this.THROTTLE_MS);
}

private stopThrottling(sessionId: string) {
    const state = this.sessionStates.get(sessionId);
    if (!state) return;
    state.throttleRef = Math.max(0, state.throttleRef - 1);
    if (state.throttleRef === 0 && state.throttleTimer) {
        clearInterval(state.throttleTimer);
        state.throttleTimer = null;
    }
    this.flushThrottledEvents(sessionId);
}

private flushThrottledEvents(sessionId: string) {
    const state = this.sessionStates.get(sessionId);
    if (!state) return;
    const sender = this.sessionSenders.get(sessionId);
    if (!sender || sender.isDestroyed()) return;

    if (state.streamBuffer) {
        sender.send(AGENT_EVENTS.STREAM, { sessionId, content: state.streamBuffer, isReset: false });
        state.streamBuffer = '';
    }
    if (state.reasoningBuffer) {
        sender.send(AGENT_EVENTS.REASONING_STREAM, { sessionId, content: state.reasoningBuffer, isReset: false });
        state.reasoningBuffer = '';
    }
}
```

- [ ] **Step 7: Update runAgent to call startThrottling/stopThrottling**

```typescript
private async runAgent(sessionId: string, agent: Agent, request: AgentRunRequest) {
    try {
        this.startThrottling(sessionId);
        await this.runtime.run(agent, request);
        this.stopThrottling(sessionId);
    } catch (error: any) {
        this.stopThrottling(sessionId);
        console.error('[AgentController] Agent execution failed:', error);
        const sender = this.sessionSenders.get(sessionId);
        if (sender && !sender.isDestroyed()) {
            sender.send(AGENT_EVENTS.ERROR, { sessionId, message: error.message });
        }
    } finally {
        const sender = this.sessionSenders.get(sessionId);
        this.cleanupSessionState(sessionId);
        if (sender && !sender.isDestroyed()) {
            sender.send(AGENT_EVENTS.STATE_CHANGE, {
                sessionId,
                previousState: 'Running',
                currentState: 'Idle',
                timestamp: Date.now()
            });
        }
    }
}
```

Note: remove the old `startThrottling`, `stopThrottling`, `flushThrottledEvents`, and `broadcast` methods entirely.

- [ ] **Step 8: Commit**

```bash
git add src/main/controllers/AgentController.ts src/common/types/agentEvents.ts
git commit -m "feat: refactor AgentController for per-session concurrent execution"
```

---

### Task 3: Update preload — pass sessionId in all event callbacks

**Files:**
- Modify: `src/main/preload.ts`

- [ ] **Step 1: Update all agent event callbacks to include sessionId**

Replace the entire `agent` section:

```typescript
agent: {
    start: (payload: any) => ipcRenderer.invoke('agent:start', payload),
    stop: (sessionId?: string) => ipcRenderer.invoke('agent:stop', sessionId),
    getState: () => ipcRenderer.invoke('agent:get-state'),
    onStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => {
        const sub = (_: any, payload: { sessionId: string, content: string, isReset?: boolean }) => callback(payload.sessionId, payload.content, payload.isReset)
        ipcRenderer.on('agent:stream', sub)
        return () => ipcRenderer.removeListener('agent:stream', sub)
    },
    onReasoningStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => {
        const sub = (_: any, payload: { sessionId: string, content: string, isReset?: boolean }) => callback(payload.sessionId, payload.content, payload.isReset)
        ipcRenderer.on('agent:reasoning-stream', sub)
        return () => ipcRenderer.removeListener('agent:reasoning-stream', sub)
    },
    onStepUpdate: (callback: (sessionId: string, steps: any[]) => void) => {
        const sub = (_: any, payload: { sessionId: string, steps: any[] }) => callback(payload.sessionId, payload.steps)
        ipcRenderer.on('agent:step', sub)
        return () => ipcRenderer.removeListener('agent:step', sub)
    },
    onStateChange: (callback: (sessionId: string, event: any) => void) => {
        const sub = (_: any, event: any) => callback(event.sessionId, event)
        ipcRenderer.on('agent:state', sub)
        return () => ipcRenderer.removeListener('agent:state', sub)
    },
    onError: (callback: (sessionId: string, error: any) => void) => {
        const sub = (_: any, payload: { sessionId: string, message: string }) => callback(payload.sessionId, payload)
        ipcRenderer.on('agent:error', sub)
        return () => ipcRenderer.removeListener('agent:error', sub)
    },
    onAuthorizationRequest: (callback: (sessionId: string, request: any) => void) => {
        const sub = (_: any, request: any) => callback(request.sessionId, request)
        ipcRenderer.on('agent:authorization-request', sub)
        return () => ipcRenderer.removeListener('agent:authorization-request', sub)
    },
    respondToAuthorization: (response: any) => ipcRenderer.send('agent:authorization-response', response),
    onAgentEvent: (callback: (event: any) => void) => {
        const sub = (_: any, event: any) => callback(event)
        ipcRenderer.on('agent:event', sub)
        return () => ipcRenderer.removeListener('agent:event', sub)
    },
},
```

- [ ] **Step 2: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat: pass sessionId in all agent event callbacks"
```

---

### Task 4: Update IElectronAPI type definitions

**Files:**
- Modify: `src/renderer/electron-api.d.ts`

- [ ] **Step 1: Update agent event callback types to include sessionId**

Replace the `agent` section:

```typescript
agent: {
    start: (payload: { sessionId?: string, prompt: string | any[], options?: any }) => Promise<{ success: boolean, sessionId?: string, runId?: string, error?: string }>;
    stop: (sessionId?: string) => Promise<void>;
    getState: () => Promise<string>;
    onStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => () => void;
    onReasoningStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => () => void;
    onStepUpdate: (callback: (sessionId: string, steps: any[]) => void) => () => void;
    onStateChange: (callback: (sessionId: string, state: any) => void) => () => void;
    onError: (callback: (sessionId: string, error: any) => void) => () => void;
    onAuthorizationRequest: (callback: (sessionId: string, request: any) => void) => () => void;
    respondToAuthorization: (response: { requestId: string, approved: boolean, remember?: boolean, runId?: string }) => void;
    onAgentEvent: (callback: (event: any) => void) => () => void;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/electron-api.d.ts
git commit -m "feat: update IElectronAPI types for sessionId-aware events"
```

---

### Task 5: Refactor useChatStore — per-session running state

**Files:**
- Modify: `src/renderer/store/useChatStore.ts`

This is the second-largest change. Replace global `isSending`/`activeRunId`/`currentAgentEvent` with per-session `runningSessions` Map.

- [ ] **Step 1: Update ChatState interface**

Replace these fields:

```typescript
// REMOVE:
// isSending: boolean
// currentAgentEvent: any | null
// activeRunId: string | null
// setSending: (sending: boolean) => void
// setAgentEvent: (event: any | null) => void

// ADD:
runningSessions: Map<string, {
    runId: string | null;
    agentState: any | null;
}>
```

- [ ] **Step 2: Update initial state**

```typescript
// REMOVE:
// isSending: false,
// currentAgentEvent: null,
// activeRunId: null,
// setSending: (isSending) => set({ isSending }),
// setAgentEvent: (currentAgentEvent) => set({ currentAgentEvent }),

// ADD:
runningSessions: new Map(),
```

- [ ] **Step 3: Rewrite sendMessage**

In `sendMessage`, replace:

```typescript
// Before:
const { isSending, sessions, addMessage, setSending, setAgentEvent, clearPendingAttachments } = state;
```

With:

```typescript
const { sessions, addMessage, clearPendingAttachments } = state;
```

Replace:

```typescript
// Before:
if (!input.trim() || isSending) return;
```

With:

```typescript
if (!input.trim() || get().runningSessions.has(activeSessionId)) return;
```

Replace:

```typescript
// Before:
setSending(true);
```

With:

```typescript
set(state => ({
    runningSessions: new Map(state.runningSessions).set(activeSessionId, { runId: null, agentState: null })
}));
```

Replace all event listener callbacks to filter by sessionId:

```typescript
const cleanupStream = window.electronAPI.agent.onStream((sid, chunk, reset) => {
    if (sid !== targetSessionId) return;
    if (reset) {
        contentBuf = '';
        updateTargetMessage((msg) => ({ ...msg, content: chunk }));
    } else {
        contentBuf += chunk;
        scheduleFlush();
    }
});

const cleanupReasoningStream = window.electronAPI.agent.onReasoningStream((sid, chunk, reset) => {
    if (sid !== targetSessionId) return;
    if (reset) {
        reasoningBuf = '';
        updateTargetMessage((msg) => ({ ...msg, reasoning_content: '' }));
    } else {
        reasoningBuf += chunk;
        scheduleFlush();
    }
});

const cleanupTrace = window.electronAPI.agent.onStepUpdate((sid, steps) => {
    if (sid !== targetSessionId) return;
    pendingSteps = steps;
    const now = Date.now();
    if (now - lastStepFlushTime >= STEP_THROTTLE_MS) {
        scheduleFlush();
    } else if (!isFlushing) {
        setTimeout(scheduleFlush, STEP_THROTTLE_MS - (now - lastStepFlushTime));
    }
});
```

For error handler:

```typescript
const cleanupError = window.electronAPI.agent.onError((sid, err) => {
    if (sid !== targetSessionId) return;
    if (isAbortError(err)) return;
    updateTargetMessage((msg) => ({
        ...msg,
        content: `Error: ${err.message || JSON.stringify(err)}`,
        isError: true
    }));
});
```

For state change handler:

```typescript
const cleanupState = window.electronAPI.agent.onStateChange((sid, event) => {
    if (sid !== targetSessionId) return;
    console.log('[Store] Received state change:', event.currentState, event.message);
    // Update per-session agent state
    set(state => {
        const next = new Map(state.runningSessions);
        const current = next.get(targetSessionId);
        if (current) {
            next.set(targetSessionId, { ...current, agentState: event });
        }
        return { runningSessions: next };
    });
});
```

For auth request handler:

```typescript
const cleanupAuth = window.electronAPI.agent.onAuthorizationRequest((sid, req) => {
    if (sid !== targetSessionId) return;
    if (req?.runId) {
        set(state => {
            const next = new Map(state.runningSessions);
            const current = next.get(targetSessionId);
            if (current) {
                next.set(targetSessionId, { ...current, runId: req.runId });
            }
            return { runningSessions: next };
        });
    }
});
```

Finally block:

```typescript
finally {
    cleanupStream();
    cleanupReasoningStream();
    cleanupTrace();
    cleanupError();
    cleanupState();
    cleanupAuth();
    // Remove this session from running state
    set(state => {
        const next = new Map(state.runningSessions);
        next.delete(targetSessionId);
        return { runningSessions: next };
    });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/store/useChatStore.ts
git commit -m "feat: replace global isSending with per-session runningSessions Map"
```

---

### Task 6: Update Composer component

**Files:**
- Modify: `src/renderer/modules/chat/Composer.tsx`

- [ ] **Step 1: Replace isSending with runningSessions lookup**

```typescript
// Before:
const isSending = useChatStore(s => s.isSending)

// After:
const isSending = useChatStore(s => s.runningSessions.has(s.activeSessionId))
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/modules/chat/Composer.tsx
git commit -m "feat: Composer uses per-session running state"
```

---

### Task 7: Update MessageList component

**Files:**
- Modify: `src/renderer/modules/chat/MessageList.tsx`

- [ ] **Step 1: Replace isSending with runningSessions lookup**

```typescript
// Before:
const isSending = useChatStore(s => s.isSending)

// After:
const isSending = useChatStore(s => s.runningSessions.has(s.activeSessionId))
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/modules/chat/MessageList.tsx
git commit -m "feat: MessageList uses per-session running state"
```

---

### Task 8: Update StatusIndicator component

**Files:**
- Modify: `src/renderer/components/StatusIndicator.tsx`

- [ ] **Step 1: Replace currentAgentEvent with runningSessions lookup**

```typescript
// Before:
const event = useChatStore(s => s.currentAgentEvent);

// After:
const event = useChatStore(s => {
    const runState = s.runningSessions.get(s.activeSessionId);
    return runState?.agentState ?? null;
});
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/StatusIndicator.tsx
git commit -m "feat: StatusIndicator uses per-session agent state"
```

---

### Task 9: Update ThoughtTrace component

**Files:**
- Modify: `src/renderer/components/ThoughtTrace.tsx`

- [ ] **Step 1: Replace activeRunId with runningSessions lookup**

In the `handleAuthorization` function:

```typescript
// Before:
const { activeRunId } = useChatStore.getState();

// After:
const runState = useChatStore.getState().runningSessions.get(sessionId);
const activeRunId = runState?.runId ?? null;
```

Note: `ThoughtTrace` needs to know which session it belongs to. The component receives `steps` from the parent `MessageList`. The session context can be obtained from `useChatStore.getState().activeSessionId` or passed as a prop. Since `ThoughtTrace` is rendered within the active session's message list, using `activeSessionId` is correct for the authorization flow:

```typescript
const handleAuthorization = (approved: boolean, remember: boolean = false) => {
    if (step.authRequestId) {
        const activeSessionId = useChatStore.getState().activeSessionId;
        const runState = useChatStore.getState().runningSessions.get(activeSessionId);
        window.electronAPI.agent.respondToAuthorization({
            requestId: step.authRequestId,
            runId: runState?.runId || undefined,
            approved,
            remember
        });
    }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/ThoughtTrace.tsx
git commit -m "feat: ThoughtTrace uses per-session runId from runningSessions"
```

---

### Task 10: Add running status indicator to SessionSidebar

**Files:**
- Modify: `src/renderer/layouts/sidebar/SessionSidebar.tsx`

- [ ] **Step 1: Import runningSessions state**

Add after the existing `useChatStore` selectors:

```typescript
const runningSessions = useChatStore(s => s.runningSessions)
```

- [ ] **Step 2: Add green pulse dot before title**

In the session item render, find the `<div className="flex-1 min-w-0 flex items-center justify-between gap-2">` block and replace:

```tsx
<div className="flex-1 min-w-0 flex items-center justify-between gap-2">
    <div className="flex items-center gap-1.5 min-w-0">
        {runningSessions.has(session.id) && (
            <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        )}
        <span className="truncate select-none text-[13px]" title={session.title || t('sessionSidebar.defaultTitle')}>
            {session.title || t('sessionSidebar.defaultTitle')}
        </span>
    </div>
    <span className={clsx(
        "text-[10px] shrink-0 tabular-nums group-hover:hidden transition-opacity",
        isActive ? "text-indigo-400/70 dark:text-indigo-400/50" : "text-slate-300 dark:text-zinc-600"
    )}>
        {getRelativeTime(session.updatedAt)}
    </span>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/layouts/sidebar/SessionSidebar.tsx
git commit -m "feat: show running status indicator in session sidebar"
```

---

### Task 11: Verify and fix

- [ ] **Step 1: Build the project**

```bash
npm run build
```

Expected: No TypeScript errors, no build errors.

- [ ] **Step 2: Manual smoke test**

1. Launch the app
2. Create a new session, send a message — agent should start running
3. While running, create another new session, send a message — both should run concurrently
4. Verify sidebar shows green dots for both running sessions
5. Switch between sessions while both are running — messages should update correctly for each
6. Stop one session — its green dot should disappear
7. Verify no cross-session event leakage

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address multi-task concurrency issues from smoke test"
```
