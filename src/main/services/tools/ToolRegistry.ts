import { ITool, ToolDefinition, ToolExecutionResult } from '../../../common/types/tool';

export class ToolRegistry {
    private tools: Map<string, ITool> = new Map();

    register(tool: ITool) {
        const def = tool.getDefinition();
        if (this.tools.has(def.name)) {
            console.warn(`[ToolRegistry] Overwriting tool: ${def.name}`);
        }
        this.tools.set(def.name, tool);
    }

    getTools(): ITool[] {
        return Array.from(this.tools.values());
    }

    getToolDefinitions(): ToolDefinition[] {
        return this.getTools().map(t => t.getDefinition());
    }

    async executeTool(name: string, args: any): Promise<ToolExecutionResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return {
                toolName: name,
                isError: true,
                result: `Tool '${name}' not found.`
            };
        }

        // TODO: Add permission check logic here in Phase 2
        /*
        if (tool.requireConfirmation) {
            // trigger frontend confirm modal
        }
        */

        try {
            console.log(`[ToolRegistry] Executing ${name} with args:`, JSON.stringify(args));
            return await tool.execute(args);
        } catch (error: any) {
            console.error(`[ToolRegistry] Execution failed for ${name}:`, error);
            return {
                toolName: name,
                isError: true,
                result: `Error executing tool: ${error.message}`
            };
        }
    }
}

export const toolRegistry = new ToolRegistry();
