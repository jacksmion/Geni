import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolGuard, ToolTrustLevel, ToolExecutionRequest } from '@/main/services/agent/ToolGuard';
import { ITool } from '@/common/types/tool';

describe('ToolGuard', () => {
    let mockTool: ITool;
    const mockCallback = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockTool = {
            getDefinition: vi.fn(),
            execute: vi.fn()
        } as unknown as ITool;
    });

    describe('getToolTrustLevel', () => {
        it('should return Safe for known read-only tools', () => {
            const guard = new ToolGuard();
            expect(guard.getToolTrustLevel('read')).toBe(ToolTrustLevel.Safe);
            expect(guard.getToolTrustLevel('list')).toBe(ToolTrustLevel.Safe);
            expect(guard.getToolTrustLevel('load_skill')).toBe(ToolTrustLevel.Safe);
        });

        it('should use tool requireConfirmation property if defined', () => {
            const guard = new ToolGuard();

            const toolHigh: ITool = { ...mockTool, requireConfirmation: true };
            expect(guard.getToolTrustLevel('custom_tool', toolHigh)).toBe(ToolTrustLevel.High);

            const toolSafe: ITool = { ...mockTool, requireConfirmation: false };
            expect(guard.getToolTrustLevel('custom_tool', toolSafe)).toBe(ToolTrustLevel.Safe);
        });

        it('should identify dangerous tools from heuristic name matching', () => {
            const guard = new ToolGuard();

            expect(guard.getToolTrustLevel('execute_script')).toBe(ToolTrustLevel.High);
            expect(guard.getToolTrustLevel('remove_file')).toBe(ToolTrustLevel.High);
            expect(guard.getToolTrustLevel('sys_bash')).toBe(ToolTrustLevel.High);
        });

        it('should fallback to Medium trust level', () => {
            const guard = new ToolGuard();
            expect(guard.getToolTrustLevel('something_neutral')).toBe(ToolTrustLevel.Medium);
        });
    });

    describe('checkAuthorization (callback mode — legacy)', () => {
        let requestTemplate: ToolExecutionRequest;

        beforeEach(() => {
            requestTemplate = {
                toolName: 'test',
                definition: {} as any,
                args: {},
                tool: mockTool
            };
        });

        it('should automatically allow Safe and Low/Medium risk tools without callback', async () => {
            const guard = new ToolGuard(mockCallback);
            guard.registerToolTrustLevel('safe_custom', ToolTrustLevel.Safe);

            const isAllowed = await guard.checkAuthorization({ ...requestTemplate, toolName: 'safe_custom' });

            expect(isAllowed).toBe(true);
            expect(mockCallback).not.toHaveBeenCalled();
        });

        it('should block High risk tools if no callback is provided, but falls back to returning true with a warning (fail open in headless)', async () => {
            const guard = new ToolGuard(); // NO callback
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const isAllowed = await guard.checkAuthorization({ ...requestTemplate, toolName: 'bash' });

            expect(isAllowed).toBe(true);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no callback or emit'));
        });

        it('should execute callback and return false if user denies High risk tool', async () => {
            mockCallback.mockResolvedValueOnce({ approved: false });
            const guard = new ToolGuard(mockCallback);

            const isAllowed = await guard.checkAuthorization({ ...requestTemplate, toolName: 'bash' });

            expect(isAllowed).toBe(false);
            expect(mockCallback).toHaveBeenCalledTimes(1);
        });

        it('should execute callback and return true if user approves High risk tool', async () => {
            mockCallback.mockResolvedValueOnce({ approved: true, rememberDecision: false });
            const guard = new ToolGuard(mockCallback);

            const isAllowed = await guard.checkAuthorization({ ...requestTemplate, toolName: 'delete_folder' });

            expect(isAllowed).toBe(true);
            expect(mockCallback).toHaveBeenCalledTimes(1);

            // Verify memory (rememberDecision was false, so next call should prompt again)
            mockCallback.mockResolvedValueOnce({ approved: true });
            await guard.checkAuthorization({ ...requestTemplate, toolName: 'delete_folder' });
            expect(mockCallback).toHaveBeenCalledTimes(2);
        });

        it('should remember user decision and bypass callback if TTL is active', async () => {
            mockCallback.mockResolvedValueOnce({ approved: true, rememberDecision: true });
            const guard = new ToolGuard(mockCallback);

            // First call triggers callback
            const firstResult = await guard.checkAuthorization({ ...requestTemplate, toolName: 'delete_action' });
            expect(firstResult).toBe(true);
            expect(mockCallback).toHaveBeenCalledTimes(1);

            // Second call bypassing callback due to TTL memory
            const secondResult = await guard.checkAuthorization({ ...requestTemplate, toolName: 'delete_action' });
            expect(secondResult).toBe(true);
            expect(mockCallback).toHaveBeenCalledTimes(1); // STILL 1 !

            // Clear memory
            guard.clearApprovedPatterns();

            // Third call triggers callback again
            mockCallback.mockResolvedValueOnce({ approved: false });
            const thirdResult = await guard.checkAuthorization({ ...requestTemplate, toolName: 'delete_action' });
            expect(thirdResult).toBe(false);
            expect(mockCallback).toHaveBeenCalledTimes(2);
        });
    });

    describe('checkAuthorization (emit+resolve mode — new)', () => {
        let requestTemplate: ToolExecutionRequest;
        let emittedEvents: any[];

        beforeEach(() => {
            emittedEvents = [];
            requestTemplate = {
                toolName: 'bash',
                definition: {} as any,
                args: { command: 'rm -rf /' },
                tool: mockTool,
            };
        });

        it('should emit auth_request event and wait for resolve() when emit is set', async () => {
            const emit = (event: any) => emittedEvents.push(event);
            const guard = new ToolGuard(undefined, emit);

            // Start authorization (will hang until resolved)
            const authPromise = guard.checkAuthorization(requestTemplate);

            // Should have emitted auth_request
            expect(emittedEvents).toHaveLength(1);
            expect(emittedEvents[0].type).toBe('auth_request');
            expect(emittedEvents[0].payload.toolName).toBe('bash');
            expect(emittedEvents[0].payload.args).toEqual({ command: 'rm -rf /' });

            // Resolve with approval
            const requestId = emittedEvents[0].payload.requestId;
            guard.resolve(requestId, true);

            const result = await authPromise;
            expect(result).toBe(true);
        });

        it('should return false when resolve() is called with false', async () => {
            const emit = (event: any) => emittedEvents.push(event);
            const guard = new ToolGuard(undefined, emit);

            const authPromise = guard.checkAuthorization(requestTemplate);
            const requestId = emittedEvents[0].payload.requestId;
            guard.resolve(requestId, false);

            const result = await authPromise;
            expect(result).toBe(false);
        });

        it('should include runId in auth_request payload', async () => {
            const emit = (event: any) => emittedEvents.push(event);
            const guard = new ToolGuard(undefined, emit);

            const req = { ...requestTemplate, runId: 'run-123' };
            const authPromise = guard.checkAuthorization(req);

            expect(emittedEvents[0].payload.runId).toBe('run-123');

            guard.resolve(emittedEvents[0].payload.requestId, true);
            await authPromise;
        });

        it('should prefer emit mode over callback mode', async () => {
            const callback = vi.fn();
            const emit = (event: any) => emittedEvents.push(event);
            const guard = new ToolGuard(callback, emit);

            const authPromise = guard.checkAuthorization(requestTemplate);

            // Should use emit, not callback
            expect(emittedEvents).toHaveLength(1);
            expect(callback).not.toHaveBeenCalled();

            guard.resolve(emittedEvents[0].payload.requestId, true);
            await authPromise;
        });

        it('should auto-allow safe tools without emitting', async () => {
            const emit = (event: any) => emittedEvents.push(event);
            const guard = new ToolGuard(undefined, emit);

            const result = await guard.checkAuthorization({ ...requestTemplate, toolName: 'read' });
            expect(result).toBe(true);
            expect(emittedEvents).toHaveLength(0);
        });

        it('should remember approved patterns after resolve', async () => {
            const emit = (event: any) => emittedEvents.push(event);
            const guard = new ToolGuard(undefined, emit);

            // First call: emit + resolve
            const firstPromise = guard.checkAuthorization(requestTemplate);
            guard.resolve(emittedEvents[0].payload.requestId, true);
            expect(await firstPromise).toBe(true);

            // Second call: should be auto-approved (remembered)
            const secondResult = await guard.checkAuthorization(requestTemplate);
            expect(secondResult).toBe(true);
            expect(emittedEvents).toHaveLength(1); // Only one emit, not two
        });

        it('should ignore resolve() for unknown requestId', () => {
            const guard = new ToolGuard(undefined, (event: any) => {});
            // Should not throw
            guard.resolve('unknown-id', true);
        });
    });
});
