import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ITool, ToolDefinition, ToolExecutionResult } from "../../../../common/types/tool";

/**
 * McpToolAdapter - Adapts MCP tools to the internal ITool interface
 * 
 * This adapter wraps an MCP tool and makes it compatible with the
 * ToolRegistry system, allowing seamless integration of external
 * MCP servers with the agent runtime.
 */
export class McpToolAdapter implements ITool {
    private client: Client;
    private mcpToolName: string;
    private serverId: string;
    private definition: ToolDefinition;

    constructor(
        serverId: string,
        client: Client,
        mcpToolName: string,
        mcpSchema: any,
        description: string
    ) {
        this.client = client;
        this.mcpToolName = mcpToolName;
        this.serverId = serverId;

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

    async execute(args: Record<string, any>): Promise<ToolExecutionResult> {
        try {
            console.log(`[McpToolAdapter] Calling ${this.serverId}/${this.mcpToolName}...`);

            const result = await this.client.callTool({
                name: this.mcpToolName,
                arguments: args
            });

            // MCP returns { content: [{ type:'text', text:'...' }, { type:'image', data:'...' }] }
            // We need to flatten this to a string or structured result
            const content = result.content as any[];

            // Handle different content types
            const outputParts: string[] = [];

            for (const item of content) {
                if (item.type === 'text') {
                    outputParts.push(item.text);
                } else if (item.type === 'image') {
                    // For images, include a marker (actual rendering handled by UI)
                    outputParts.push(`[Image: ${item.mimeType || 'image/png'}]`);
                } else if (item.type === 'resource') {
                    outputParts.push(`[Resource: ${item.uri}]`);
                }
            }

            const outputText = outputParts.join('\n');

            return {
                toolName: this.definition.name,
                isError: result.isError === true,
                result: outputText || JSON.stringify(result.content)
            };
        } catch (error: any) {
            console.error(`[McpToolAdapter] Error calling ${this.mcpToolName}:`, error);

            return {
                toolName: this.definition.name,
                isError: true,
                result: `MCP Error (${this.serverId}/${this.mcpToolName}): ${error.message}`
            };
        }
    }

    /**
     * MCP tools may have varying danger levels
     * For now, default to requiring confirmation
     */
    requireConfirmation = true;

    /**
     * Get the original MCP tool name (without prefix)
     */
    getOriginalToolName(): string {
        return this.mcpToolName;
    }

    /**
     * Get the server ID this tool belongs to
     */
    getServerId(): string {
        return this.serverId;
    }
}
