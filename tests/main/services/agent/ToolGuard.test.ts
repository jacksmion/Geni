import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolGuard, ToolTrustLevel, ToolExecutionRequest } from '@/main/services/agent/ToolGuard';
import { ITool } from '@/common/types/tool';

describe('ToolGuard', () => {
    let mockTool: ITool;
    let mockCallback = vi.fn();

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

            const toolLow: ITool = { ...mockTool, requireConfirmation: false };
            expect(guard.getToolTrustLevel('custom_tool', toolLow)).toBe(ToolTrustLevel.Low);
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

    describe('checkAuthorization', () => {
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
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no callback is set'));
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
});
