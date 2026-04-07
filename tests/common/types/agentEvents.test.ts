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
