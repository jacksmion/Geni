import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolGuard, ToolTrustLevel, ToolExecutionRequest } from '@/main/services/agent/ToolGuard';
import { ITool } from '@/common/types/tool';

describe('ToolGuard', () => {
    let mockTool: ITool;

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

    describe('evaluateRequest', () => {
        let requestTemplate: ToolExecutionRequest;

        beforeEach(() => {
            requestTemplate = {
                toolName: 'test',
                definition: {} as any,
                args: {},
                tool: mockTool
            };
        });

        it('should automatically allow Safe tools', () => {
            const guard = new ToolGuard();
            guard.registerToolTrustLevel('safe_custom', ToolTrustLevel.Safe);

            const decision = guard.evaluateRequest({ ...requestTemplate, toolName: 'safe_custom' });

            expect(decision.allowed).toBe(true);
            expect(decision.requiresUserConfirmation).toBe(false);
        });

        it('should require user confirmation for High risk tools', () => {
            const guard = new ToolGuard();

            const decision = guard.evaluateRequest({ ...requestTemplate, toolName: 'bash' });

            expect(decision.allowed).toBe(false);
            expect(decision.requiresUserConfirmation).toBe(true);
        });

        it('should require user confirmation for Dangerous tools', () => {
            const guard = new ToolGuard();

            const decision = guard.evaluateRequest({ ...requestTemplate, toolName: 'delete_folder' });

            expect(decision.allowed).toBe(false);
            expect(decision.requiresUserConfirmation).toBe(true);
        });

        it('should auto-allow Medium risk tools', () => {
            const guard = new ToolGuard();

            const decision = guard.evaluateRequest({ ...requestTemplate, toolName: 'some_tool' });

            expect(decision.allowed).toBe(true);
            expect(decision.requiresUserConfirmation).toBe(false);
        });

        it('should bypass confirmation if tool was previously approved via markApproved', () => {
            const guard = new ToolGuard();
            const request = { ...requestTemplate, toolName: 'bash', args: { command: 'ls' } };

            // First call: needs confirmation
            const firstDecision = guard.evaluateRequest(request);
            expect(firstDecision.requiresUserConfirmation).toBe(true);

            // Mark as approved
            guard.markApproved(request);

            // Second call: auto-approved
            const secondDecision = guard.evaluateRequest(request);
            expect(secondDecision.allowed).toBe(true);
            expect(secondDecision.requiresUserConfirmation).toBe(false);
            expect(secondDecision.reason).toBe('Previously approved by user');
        });

        it('should forget approvals after clearApprovedPatterns', () => {
            const guard = new ToolGuard();
            const request = { ...requestTemplate, toolName: 'bash' };

            guard.markApproved(request);
            expect(guard.evaluateRequest(request).allowed).toBe(true);

            guard.clearApprovedPatterns();
            expect(guard.evaluateRequest(request).requiresUserConfirmation).toBe(true);
        });

        it('should generate human-readable reason for bash commands', () => {
            const guard = new ToolGuard();
            const request = { ...requestTemplate, toolName: 'bash', args: { command: 'rm -rf /' } };

            const decision = guard.evaluateRequest(request);
            expect(decision.reason).toContain('删除');
        });

        it('should generate human-readable reason for npm install', () => {
            const guard = new ToolGuard();
            const request = { ...requestTemplate, toolName: 'bash', args: { command: 'npm install foo' } };

            const decision = guard.evaluateRequest(request);
            expect(decision.reason).toContain('安装');
        });
    });

    describe('registerToolTrustLevel / registerToolTrustLevels', () => {
        it('should register a single trust level', () => {
            const guard = new ToolGuard();
            guard.registerToolTrustLevel('my_tool', ToolTrustLevel.Safe);
            expect(guard.getToolTrustLevel('my_tool')).toBe(ToolTrustLevel.Safe);
        });

        it('should batch register trust levels', () => {
            const guard = new ToolGuard();
            guard.registerToolTrustLevels({
                'tool_a': ToolTrustLevel.Safe,
                'tool_b': ToolTrustLevel.Dangerous
            });
            expect(guard.getToolTrustLevel('tool_a')).toBe(ToolTrustLevel.Safe);
            expect(guard.getToolTrustLevel('tool_b')).toBe(ToolTrustLevel.Dangerous);
        });
    });
});
