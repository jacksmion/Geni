import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolRegistry } from "../tools/ToolRegistry";
import { McpToolAdapter } from "./McpToolAdapter";

// Configuration for an MCP Server (e.g. "sqlite": { command: "uvx", args: ["mcp-server-sqlite"] })
export interface McpServerConfig {
    id: string;
    type?: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    apiKey?: string;
    env?: Record<string, string>;
}

export class McpManager {
    private clients: Map<string, Client> = new Map();
    private registry: ToolRegistry;

    constructor(registry: ToolRegistry) {
        this.registry = registry;
    }

    async connectToServer(config: McpServerConfig) {
        console.log(`[McpManager] Connecting to ${config.id}...`);

        let transport: any; // Transport interface, but typed loosely here to avoid dependency hell if type defs missing

        if (config.type === 'sse') {
            if (!config.url) throw new Error('URL is required for SSE transport');
            const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

            // Construct EventSourceInit/RequestInit with headers if apiKey is present
            const opts: any = {};
            if (config.apiKey) {
                opts.headers = {
                    'Authorization': `Bearer ${config.apiKey}`
                };
            }

            transport = new SSEClientTransport(new URL(config.url), opts);
        } else {
            // Default to stdio
            if (!config.command) throw new Error('Command is required for stdio transport');
            transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...(config.env || {}) } as Record<string, string>
            });
        }

        const client = new Client(
            { name: "assistant-core-client", version: "1.0.0" },
            { capabilities: {} }
        );

        try {
            await client.connect(transport);
            this.clients.set(config.id, client);
            console.log(`[McpManager] Connected to ${config.id} via ${config.type || 'stdio'}`);

            // Discover Actions
            await this.refreshTools(config.id);

        } catch (error: any) {
            console.error(`[McpManager] Failed to connect to ${config.id}:`, error);

            // Enhance error message for common SSE configuration mistakes
            if (config.type === 'sse' && error.message && error.message.includes('Invalid content type')) {
                throw new Error(`SSE Connection Failed: The server returned an invalid content type. Please check your URL (it should typically end with '/sse') and ensure the server is running. Original Error: ${error.message}`);
            }

            throw error;
        }
    }

    async refreshTools(serverId: string) {
        const client = this.clients.get(serverId);
        if (!client) return;

        console.log(`[McpManager] Listing tools for ${serverId}...`);
        const result = await client.listTools();

        for (const tool of result.tools) {
            // Register each tool into our global registry
            // We prefix name to avoid conflicts? e.g. "sqlite_query"
            // For now, let's keep original name but handle with care
            const schema = tool.inputSchema;
            const adapter = new McpToolAdapter(
                serverId,
                client,
                tool.name,
                schema,
                tool.description || ''
            );

            this.registry.register(adapter);
            console.log(`[McpManager] Registered tool: ${tool.name} (from ${serverId})`);
        }
    }

    async disconnectAll() {
        for (const [id, client] of this.clients) {
            try {
                await client.close();
            } catch (e) {
                console.error(`Error closing mcp client ${id}`, e);
            }
        }
        this.clients.clear();
    }
}
