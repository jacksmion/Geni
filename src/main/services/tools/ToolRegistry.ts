import { ITool, ToolDefinition, ToolExecutionResult } from '../../../common/types/tool';

export class ToolRegistry {
    private tools: Map<string, ITool> = new Map();

    register(tool: ITool) {
        const def = tool.getDefinition();
        this.tools.set(def.name, tool);
    }

    unregister(name: string): boolean {
        if (this.tools.has(name)) {
            this.tools.delete(name);
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

    /**
     * 按工具名过滤，返回新的 ToolRegistry 实例
     *
     * 支持精确匹配和通配符：
     * - 精确匹配：'read' → 只匹配名为 'read' 的工具
     * - 通配符：'github/*' → 匹配所有以 'github/' 开头的工具
     *
     * @param toolNames 允许的工具名模式列表
     * @returns 新的 ToolRegistry 实例（不可变，不影响原 Registry）
     */
    filter(toolNames: string[]): ToolRegistry {
        const filtered = Array.from(this.tools.entries())
            .filter(([name]) => toolNames.some(pattern =>
                pattern.endsWith('/*')
                    ? name.startsWith(pattern.slice(0, -2))
                    : name === pattern
            ))
            .map(([_, tool]) => tool);

        const registry = new ToolRegistry();
        for (const tool of filtered) {
            registry.register(tool);
        }
        return registry;
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
