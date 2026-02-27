import { describe, it, expect, vi } from 'vitest';
import { AgentState, AgentStateManager, AgentStateEvent, getStateDescription } from '@/main/services/agent/state/AgentState';

describe('AgentStateManager', () => {
    it('should initialize with Idle state', () => {
        const manager = new AgentStateManager();
        expect(manager.getState()).toBe(AgentState.Idle);
    });

    it('should transition to a valid new state and trigger callback', () => {
        const callback = vi.fn();
        const manager = new AgentStateManager(callback);

        manager.transition(AgentState.Thinking, 'Starting to think', { myData: 123 });

        expect(manager.getState()).toBe(AgentState.Thinking);
        expect(callback).toHaveBeenCalledTimes(1);

        const event = callback.mock.calls[0][0] as AgentStateEvent;
        expect(event.previousState).toBe(AgentState.Idle);
        expect(event.currentState).toBe(AgentState.Thinking);
        expect(event.message).toBe('Starting to think');
        expect(event.metadata).toEqual({ myData: 123 });
        expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should handle transition without optional arguments', () => {
        const callback = vi.fn();
        const manager = new AgentStateManager(callback);

        manager.transition(AgentState.Thinking);

        expect(manager.getState()).toBe(AgentState.Thinking);
        expect(callback).toHaveBeenCalledTimes(1);
        const event = callback.mock.calls[0][0] as AgentStateEvent;
        expect(event.message).toBeUndefined();
        expect(event.metadata).toBeUndefined();
    });

    it('should warn on invalid transitions but still allow them', () => {
        // Spy on console.warn
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        const manager = new AgentStateManager();

        // Idle -> ExecutingTool is technically invalid based on isValidTransition
        manager.transition(AgentState.ExecutingTool);

        expect(manager.getState()).toBe(AgentState.ExecutingTool);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[AgentStateManager] Invalid state transition: Idle -> ExecutingTool')
        );

        consoleWarnSpy.mockRestore();
    });

    it('should always allow transition to Aborted', () => {
        const manager = new AgentStateManager();

        // Idle -> Aborted
        manager.transition(AgentState.Aborted);
        expect(manager.getState()).toBe(AgentState.Aborted);

        // Reset and try another
        manager.reset();
        manager.transition(AgentState.Thinking);
        manager.transition(AgentState.ExecutingTool);
        // ExecutingTool -> Aborted
        manager.transition(AgentState.Aborted);
        expect(manager.getState()).toBe(AgentState.Aborted);
    });

    it('should transition to Idle when reset is called', () => {
        const callback = vi.fn();
        const manager = new AgentStateManager(callback);

        manager.transition(AgentState.Thinking);
        expect(manager.getState()).toBe(AgentState.Thinking);

        manager.reset();

        expect(manager.getState()).toBe(AgentState.Idle);
        const resetEvent = callback.mock.calls[1][0] as AgentStateEvent;
        expect(resetEvent.message).toBe('State reset');
    });

    describe('getStateDescription', () => {
        it('should return human-readable descriptions', () => {
            expect(getStateDescription(AgentState.Idle)).toBe('空闲');
            expect(getStateDescription(AgentState.Thinking)).toBe('正在思考...');
            expect(getStateDescription(AgentState.ExecutingTool)).toBe('正在执行工具...');
            expect(getStateDescription(AgentState.Error)).toBe('执行出错');
        });

        it('should return the enum value as fallback if not in dictionary (though all are mapped)', () => {
            // Typescript prevents passing invalid states, but we can bypass it for testing
            expect(getStateDescription('UnknownState' as AgentState)).toBe('UnknownState');
        });
    });
});
