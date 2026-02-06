import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ITool, ToolDefinition, ToolExecutionResult } from "../../../common/types/tool";

export class McpToolAdapter implements ITool {
    private client: Client;
    private mcpToolName: string;
    private definition: ToolDefinition;

    constructor(serverId: string, client: Client, mcpToolName: string, mcpSchema: any, description: string) {
        this.client = client;
        this.mcpToolName = mcpToolName;

        // Sanitize serverId (only alphanumeric + underscore)
        const safePrefix = serverId.replace(/[^a-zA-Z0-9_]/g, '_');

        // Map MCP Schema to our ToolDefinition
        // Name format: mcp__{serverId}__{toolName}
        // This convention allows the UI to parse it back to @serverId/toolName
        this.definition = {
            name: `mcp__${safePrefix}__${mcpToolName}`,
            description: description || `Tool from MCP server: ${serverId}`,
            input_schema: mcpSchema
        };
    }

    getDefinition(): ToolDefinition {
        return this.definition;
    }

    async execute(args: any): Promise<ToolExecutionResult> {
        try {
            console.log(`[McpToolAdapter] Calling ${this.mcpToolName}...`);
            const result = await this.client.callTool({
                name: this.mcpToolName,
                arguments: args
            });

            // MCP returns { content: [{ type:'text', text:'...' }] }
            // We need to flatten this to a string or structured result
            const content = result.content as any[];
            const outputText = content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n');

            return {
                toolName: this.definition.name,
                isError: false, // MCP errors usually throw exceptions? Check spec.
                result: outputText || JSON.stringify(result.content)
            };
        } catch (error: any) {
            return {
                toolName: this.definition.name,
                isError: true,
                result: `MCP Error: ${error.message}`
            };
        }
    }
}
