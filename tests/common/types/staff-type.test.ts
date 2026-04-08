import type { Agent } from '@/common/types/agent';
import type { StaffProfile } from '@/common/types/staff';
import { describe, it, expect } from 'vitest';

describe('StaffProfile type compatibility', () => {
    it('StaffProfile should be assignable to Agent', () => {
        const staff: StaffProfile = {
            id: 'staff-1',
            name: 'Test Staff',
            modelId: 'openai/gpt-4o',
            systemPrompt: 'You are a test staff',
            status: 'idle',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        // This line is the actual test — it must compile
        const agent: Agent = staff;
        expect(agent.id).toBe('staff-1');
        expect(agent.modelId).toBe('openai/gpt-4o');
    });
});
