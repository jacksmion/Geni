export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
        [key: string]: any;
    };
}

export interface ToolExecutionResult {
    toolName: string;
    isError: boolean;
    result: any;
    displayText?: string; // For UI visualization (like Claude Code's "View Output")
}

/**
 * Interface for any tool that the Agent can use.
 * This unifies local skills, built-in system tools, and future MCP tools.
 */
export interface ITool {
    getDefinition(): ToolDefinition;

    /**
     * Execute the tool with parsed arguments
     */
    execute(args: Record<string, any>, signal?: AbortSignal, onStream?: (chunk: string) => void): Promise<ToolExecutionResult>;

    /**
     * Needs user implementation approval?
     * default: false
     */
    requireConfirmation?: boolean;

    /**
     * Whether this tool is safe to run in parallel with other tool calls.
     * Leave false/undefined for tools with mutable shared state or side effects.
     */
    parallelSafe?: boolean;
}
