import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '@/main/services/tools/ToolRegistry';
import type { ITool, ToolDefinition, ToolExecutionResult } from '@/common/types/tool';

function createMockTool(name: string): ITool {
    return {
        getDefinition(): ToolDefinition {
            return {
                name,
                description: `Mock tool: ${name}`,
                parameters: { type: 'object', properties: {} },
            };
        },
        async execute(): Promise<ToolExecutionResult> {
            return { toolName: name, isError: false, result: 'ok' };
        },
    };
}

describe('ToolRegistry.filter', () => {
    it('should filter by exact name match', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('read'));
        registry.register(createMockTool('write'));
        registry.register(createMockTool('bash'));

        const filtered = registry.filter(['read', 'write']);
        expect(filtered.getToolDefinitions().map(d => d.name).sort()).toEqual(['read', 'write']);
    });

    it('should filter by wildcard pattern', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('github/create-issue'));
        registry.register(createMockTool('github/list-repos'));
        registry.register(createMockTool('jira/create-ticket'));
        registry.register(createMockTool('bash'));

        const filtered = registry.filter(['github/*']);
        const names = filtered.getToolDefinitions().map(d => d.name).sort();
        expect(names).toEqual(['github/create-issue', 'github/list-repos']);
    });

    it('should mix exact match and wildcard', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('read'));
        registry.register(createMockTool('write'));
        registry.register(createMockTool('github/create-issue'));

        const filtered = registry.filter(['read', 'github/*']);
        const names = filtered.getToolDefinitions().map(d => d.name).sort();
        expect(names).toEqual(['github/create-issue', 'read']);
    });

    it('should return empty registry for non-matching patterns', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('read'));

        const filtered = registry.filter(['nonexistent']);
        expect(filtered.getToolDefinitions()).toEqual([]);
    });

    it('should not modify the original registry', () => {
        const registry = new ToolRegistry();
        registry.register(createMockTool('read'));
        registry.register(createMockTool('write'));

        registry.filter(['read']);
        expect(registry.getToolDefinitions().map(d => d.name).sort()).toEqual(['read', 'write']);
    });
});
