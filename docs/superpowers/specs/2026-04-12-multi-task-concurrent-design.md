# Multi-Task Concurrent Execution Design

## Goal

Support multiple chat sessions running simultaneously, each with its own running state and working directory. Show running status in the sidebar session list.

## Current Constraints

- `AgentController` uses single `activeWebContents`, single `activeRunId`, single throttle buffer
- `useChatStore` uses global `isSending: boolean`, `activeRunId: string | null`, `currentAgentEvent: any | null`
- All agent IPC events (stream, step, state) have no `sessionId`, frontend cannot distinguish which session they belong to
- Sidebar session list shows only title and time, no running status indicator

## Design

### Module 1: IPC Event Routing — Add sessionId

**Problem**: All agent events are broadcast without `sessionId`, frontend cannot distinguish which session they belong to.

**Changes**:

#### 1.1 Per-session state in AgentController

Replace single throttle buffers with per-session Map:

```typescript
private sessionStates = new Map<string, {
    runId: string;
    streamBuffer: string;
    reasoningBuffer: string;
    activeSteps: AgentStep[];
    throttleTimer: NodeJS.Timeout | null;
    throttleRef: number;
}>();
```

#### 1.2 buildEmitFn binds sessionId

`buildEmitFn` takes `sessionId` parameter. All event broadcasts include `sessionId`:

```typescript
this.broadcast(AGENT_EVENTS.STREAM, { content: '', isReset: true, sessionId });
this.broadcast(AGENT_EVENTS.STEP_UPDATE, { steps: [...this.activeSteps], sessionId });
this.broadcast(AGENT_EVENTS.STATE_CHANGE, { ...event.payload, sessionId });
```

#### 1.3 Preload callbacks pass through sessionId

```typescript
// Before
onStream: (callback) => ipcRenderer.on('agent:stream', (_e, data) => callback(data.content, data.isReset))

// After
onStream: (callback) => ipcRenderer.on('agent:stream', (_e, data) => callback(data.sessionId, data.content, data.isReset))
```

Same change for: `onReasoningStream`, `onStepUpdate`, `onStateChange`, `onError`, `onAuthorizationRequest`.

#### 1.4 IElectronAPI type updates

All `onXxx` callbacks add `sessionId` as first parameter:

```typescript
onStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => () => void;
onReasoningStream: (callback: (sessionId: string, chunk: string, reset?: boolean) => void) => () => void;
onStepUpdate: (callback: (sessionId: string, steps: any[]) => void) => () => void;
onStateChange: (callback: (sessionId: string, state: any) => void) => () => void;
onError: (callback: (sessionId: string, error: any) => void) => () => void;
onAuthorizationRequest: (callback: (sessionId: string, request: any) => void) => () => void;
```

### Module 2: AgentController — Remove Singleton Constraint

**Problem**: `handleStart` uses single `activeWebContents`, blocks on `await this.runtime.run()`, only one agent can run at a time.

**Changes**:

#### 2.1 Remove single-instance state

- Remove `activeRunId: string | null`
- Remove single `streamBuffer`, `reasoningBuffer`, `throttleTimer`, `throttleRef`, `activeSteps`
- Remove single `activeWebContents`
- All replaced by `sessionStates` Map

#### 2.2 handleStart — fire-and-forget

```typescript
private async handleStart(event: IpcMainInvokeEvent, payload: AgentStartRequest): Promise<AgentStartResponse> {
    const sender = event.sender;
    const { sessionId, prompt, options } = payload;

    // 1. If session already running, stop it first
    if (this.abortControllers.has(sessionId)) {
        this.abortControllers.get(sessionId)!.abort();
        this.abortControllers.delete(sessionId);
    }

    // 2. Initialize per-session state
    const runId = crypto.randomUUID();
    this.sessionStates.set(sessionId, {
        runId,
        streamBuffer: '',
        reasoningBuffer: '',
        activeSteps: [],
        throttleTimer: null,
        throttleRef: 0,
    });

    // 3. AbortController
    const controller = new AbortController();
    this.abortControllers.set(sessionId, controller);

    // 4. Build request with sessionId-bound emit
    const request: AgentRunRequest = {
        sessionId,
        prompt,
        signal: controller.signal,
        emit: this.buildEmitFn(sessionId, sender),
        ...
    };

    // 5. Run in background (don't await)
    this.runAgent(sessionId, agent, request);

    return { success: true, sessionId, runId };
}
```

Key: `handleStart` returns immediately, agent runs in background. Each session has its own emit function bound to its `sender` (WebContents).

#### 2.3 New runAgent method

```typescript
private async runAgent(sessionId: string, agent: Agent, request: AgentRunRequest) {
    try {
        await this.runtime.run(agent, request);
    } catch (error: any) {
        const sender = this.getSenderForSession(sessionId);
        if (sender && !sender.isDestroyed()) {
            sender.send(AGENT_EVENTS.ERROR, { sessionId, message: error.message });
        }
    } finally {
        const state = this.sessionStates.get(sessionId);
        if (state?.throttleTimer) clearInterval(state.throttleTimer);
        this.sessionStates.delete(sessionId);
        this.abortControllers.delete(sessionId);

        // Notify frontend that session ended
        const sender = this.getSenderForSession(sessionId);
        if (sender && !sender.isDestroyed()) {
            sender.send(AGENT_EVENTS.STATE_CHANGE, { sessionId, currentState: 'idle' });
        }
    }
}
```

#### 2.4 handleStop — cleanup sessionStates

```typescript
private handleStop(_event: IpcMainInvokeEvent, sessionId?: string) {
    if (sessionId) {
        const controller = this.abortControllers.get(sessionId);
        if (controller) {
            controller.abort();
            this.abortControllers.delete(sessionId);
        }
        // Cleanup per-session state
        const state = this.sessionStates.get(sessionId);
        if (state?.throttleTimer) clearInterval(state.throttleTimer);
        this.sessionStates.delete(sessionId);
    } else {
        for (const [sid, controller] of this.abortControllers.entries()) {
            controller.abort();
            const state = this.sessionStates.get(sid);
            if (state?.throttleTimer) clearInterval(state.throttleTimer);
        }
        this.abortControllers.clear();
        this.sessionStates.clear();
    }
}
```

#### 2.5 Throttling — per-session

`flushThrottledEvents` takes `sessionId` parameter, only flushes that session's buffer:

```typescript
private flushThrottledEvents(sessionId: string) {
    const state = this.sessionStates.get(sessionId);
    if (!state) return;
    const sender = this.getSenderForSession(sessionId);
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

`startThrottling` / `stopThrottling` also take `sessionId`.

#### 2.6 Sender tracking

Add a Map to track which WebContents belongs to which session:

```typescript
private sessionSenders = new Map<string, WebContents>();

private getSenderForSession(sessionId: string): WebContents | null {
    const sender = this.sessionSenders.get(sessionId);
    if (sender && !sender.isDestroyed()) return sender;
    return null;
}
```

Set in `handleStart`, clear in `runAgent` finally block.

### Module 3: Frontend Store — Per-Session Running State

**Problem**: `isSending`, `activeRunId`, `currentAgentEvent` are global singletons.

**Changes**:

#### 3.1 Replace single state with per-session Map

```typescript
// Remove these:
// isSending: boolean
// activeRunId: string | null
// currentAgentEvent: any | null

// Add:
runningSessions: Map<string, {
    runId: string | null;
    agentState: any | null;  // replaces currentAgentEvent
}>
```

Helper methods:

```typescript
isSessionRunning: (sessionId: string) => boolean
getRunningSessionIds: () => string[]
```

#### 3.2 sendMessage changes

```typescript
// Before
if (!input.trim() || isSending) return;

// After
const sessionRunState = get().runningSessions.get(activeSessionId);
if (!input.trim() || sessionRunState) return;
```

Replace `setSending(true)` with adding to `runningSessions`:

```typescript
set(state => ({
    runningSessions: new Map(state.runningSessions).set(activeSessionId, { runId: null, agentState: null })
}));
```

Replace `finally` cleanup:

```typescript
finally {
    set(state => {
        const next = new Map(state.runningSessions);
        next.delete(targetSessionId);
        return { runningSessions: next };
    });
}
```

#### 3.3 Event listeners — filter by sessionId

All `onXxx` callbacks filter by `targetSessionId`:

```typescript
const cleanupStream = window.electronAPI.agent.onStream((sid, chunk, reset) => {
    if (sid !== targetSessionId) return;
    // ... existing logic
});
```

Same pattern for: `onReasoningStream`, `onStepUpdate`, `onError`, `onStateChange`, `onAuthorizationRequest`.

`onAuthorizationRequest` also updates `runId` per-session:

```typescript
const cleanupAuth = window.electronAPI.agent.onAuthorizationRequest((sid, req) => {
    if (sid !== targetSessionId) return;
    set(state => {
        const next = new Map(state.runningSessions);
        const current = next.get(targetSessionId);
        if (current) {
            next.set(targetSessionId, { ...current, runId: req.runId });
        }
        return { runningSessions: next };
    });
});
```

#### 3.4 Composer send button state

```typescript
// Before
const isSending = useChatStore(s => s.isSending);

// After
const activeSessionId = useChatStore(s => s.activeSessionId);
const isSending = useChatStore(s => s.runningSessions.has(activeSessionId));
```

#### 3.5 Backward compatibility

Remove `setSending`, `setAgentEvent` methods. Update all components that reference `isSending`, `activeRunId`, `currentAgentEvent` to use `runningSessions` Map instead.

### Module 4: Sidebar — Show Running Status

**Problem**: Session list shows only title and time, no running status.

**Changes**:

#### 4.1 Access running state in SessionSidebar

```typescript
const runningSessions = useChatStore(s => s.runningSessions);
```

#### 4.2 Add running indicator next to title

A green pulsing dot before the title, time stays visible:

```tsx
<div className="flex-1 min-w-0 flex items-center justify-between gap-2">
    <div className="flex items-center gap-1.5 min-w-0">
        {runningSessions.has(session.id) && (
            <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        )}
        <span className="truncate select-none text-[13px]">
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

Visual effect: a small green pulsing dot before the title when running, time remains on the right.

## Files to Modify

| File | Changes |
|------|---------|
| `src/main/controllers/AgentController.ts` | Per-session state, fire-and-forget start, session-aware throttling, sender tracking |
| `src/main/preload.ts` | Update `onXxx` callbacks to pass `sessionId` as first arg |
| `src/renderer/electron-api.d.ts` | Update `onXxx` type signatures |
| `src/renderer/store/useChatStore.ts` | Replace `isSending`/`activeRunId`/`currentAgentEvent` with `runningSessions` Map, filter events by sessionId |
| `src/renderer/layouts/sidebar/SessionSidebar.tsx` | Add running status indicator |
| `src/renderer/components/Composer.tsx` (or wherever send button reads `isSending`) | Use `runningSessions.has(activeSessionId)` |

## Out of Scope

- Concurrency limit configuration (can be added later)
- Per-session working directory (inherits global, can be changed later)
- Per-session MCP/prompt isolation
- Drag-and-drop reordering of running tasks
