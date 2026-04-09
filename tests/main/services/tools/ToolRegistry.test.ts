import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '@/main/services/tools/ToolRegistry';
import { ITool, ToolDefinition, ToolExecutionResult } from '@/common/types/tool';

describe('ToolRegistry', () => {
    let registry: ToolRegistry;

    const createMockTool = (name: string, description: string = 'Test tool'): ITool => ({
        getDefinition: vi.fn().mockReturnValue({
            name,
            description,
            input_schema: { type: 'object' }
        } as ToolDefinition),
        execute: vi.fn().mockResolvedValue({
            toolName: name,
            isError: false,
            result: `Result from ${name}`
        } as ToolExecutionResult),
        requireConfirmation: false
    });

    beforeEach(() => {
        registry = new ToolRegistry();
    });

    describe('register', () => {
        it('should register a tool', () => {
            const tool = createMockTool('test_tool');
            registry.register(tool);

            const tools = registry.getTools();
            expect(tools).toHaveLength(1);
            expect(tools[0].getDefinition().name).toBe('test_tool');
        });

        it('should register multiple tools', () => {
            registry.register(createMockTool('tool1'));
            registry.register(createMockTool('tool2'));
            registry.register(createMockTool('tool3'));

            expect(registry.getTools()).toHaveLength(3);
        });

        it('should overwrite existing tool with same name', () => {
            const tool1 = createMockTool('my_tool', 'First description');
            const tool2 = createMockTool('my_tool', 'Second description');

            registry.register(tool1);
            registry.register(tool2);

            expect(registry.getTools()).toHaveLength(1);
            expect(registry.getToolDefinitions()[0].description).toBe('Second description');
        });
    });

    describe('unregister', () => {
        it('should unregister an existing tool', () => {
            registry.register(createMockTool('test_tool'));
            const result = registry.unregister('test_tool');

            expect(result).toBe(true);
            expect(registry.getTools()).toHaveLength(0);
        });

        it('should return false when unregistering non-existent tool', () => {
            const result = registry.unregister('non_existent');

            expect(result).toBe(false);
        });

        it('should handle unregister then re-register', () => {
            const tool = createMockTool('dynamic_tool');
            registry.register(tool);
            registry.unregister('dynamic_tool');
            registry.register(tool);

            expect(registry.getTools()).toHaveLength(1);
        });
    });

    describe('getTools', () => {
        it('should return empty array initially', () => {
            expect(registry.getTools()).toEqual([]);
        });
    });

    describe('getToolDefinitions', () => {
        it('should return definitions for all registered tools', () => {
            registry.register(createMockTool('tool_a'));
            registry.register(createMockTool('tool_b'));

            const definitions = registry.getToolDefinitions();

            expect(definitions).toHaveLength(2);
            expect(definitions.map(d => d.name)).toContain('tool_a');
            expect(definitions.map(d => d.name)).toContain('tool_b');
        });
    });

    describe('executeTool', () => {
        it('should execute a registered tool', async () => {
            const tool = createMockTool('echo');
            registry.register(tool);

            const result = await registry.executeTool('echo', { message: 'hello' });

            expect(result.isError).toBe(false);
            expect(tool.execute).toHaveBeenCalledWith({ message: 'hello' }, undefined, undefined);
        });

        it('should return error for non-existent tool', async () => {
            const result = await registry.executeTool('non_existent', {});

            expect(result.isError).toBe(true);
            expect(result.result).toContain('not found');
        });

        it('should return error when tool execution fails', async () => {
            const tool = createMockTool('failing_tool');
            (tool.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Execution failed'));
            registry.register(tool);

            const result = await registry.executeTool('failing_tool', {});

            expect(result.isError).toBe(true);
            expect(result.result).toContain('Error executing tool');
        });

        it('should pass abort signal to tool', async () => {
            const tool = createMockTool('stoppable');
            registry.register(tool);
            const signal = new AbortController().signal;

            await registry.executeTool('stoppable', {}, signal);

            expect(tool.execute).toHaveBeenCalledWith({}, signal, undefined);
        });

        it('should pass stream callback to tool', async () => {
            const tool = createMockTool('streaming_tool');
            registry.register(tool);
            const streamCallback = vi.fn();

            await registry.executeTool('streaming_tool', {}, undefined, streamCallback);

            expect(tool.execute).toHaveBeenCalledWith({}, undefined, streamCallback);
        });
    });

    describe('updateWorkspacePath', () => {
        it('should call setRoot on tools that support it', () => {
            const toolWithRoot = {
                ...createMockTool('root_tool'),
                setRoot: vi.fn()
            } as any;
            const toolWithoutRoot = createMockTool('regular_tool');

            registry.register(toolWithRoot);
            registry.register(toolWithoutRoot);

            registry.updateWorkspacePath('/new/path');

            expect(toolWithRoot.setRoot).toHaveBeenCalledWith('/new/path');
        });

        it('should not throw when tool setRoot fails', () => {
            const toolWithRoot = {
                ...createMockTool('failing_tool'),
                setRoot: vi.fn().mockImplementation(() => {
                    throw new Error('Cannot set root');
                })
            } as any;

            registry.register(toolWithRoot);

            expect(() => registry.updateWorkspacePath('/new/path')).not.toThrow();
        });
    });
});
