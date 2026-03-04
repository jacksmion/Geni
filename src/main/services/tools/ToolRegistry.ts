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

    unregister(name: string): boolean {
        if (this.tools.has(name)) {
            this.tools.delete(name);
            console.log(`[ToolRegistry] Unregistered tool: ${name}`);
            return true;
        }
        return false;
    }

    getTools(): ITool[] {
        return Array.from(this.tools.values());
    }

    getToolDefinitions(): ToolDefinition[] {
        return this.getTools().map(t => t.getDefinition());
    }

    async executeTool(name: string, args: any, signal?: AbortSignal, onStream?: (chunk: string) => void): Promise<ToolExecutionResult> {
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
            return await tool.execute(args, signal, onStream);
        } catch (error: any) {
            console.error(`[ToolRegistry] Execution failed for ${name}:`, error);
            return {
                toolName: name,
                isError: true,
                result: `Error executing tool: ${error.message}`
            };
        }
    }

    /**
     * Updates the workspace path for all tools that support it.
     * This is called when the user changes the workspace directory in the UI.
     */
    updateWorkspacePath(newPath: string) {
        for (const tool of this.tools.values()) {
            if (typeof (tool as any).setRoot === 'function') {
                try {
                    (tool as any).setRoot(newPath);
                } catch (e) {
                    console.error(`[ToolRegistry] Failed to update root for tool:`, e);
                }
            }
        }
    }
}
