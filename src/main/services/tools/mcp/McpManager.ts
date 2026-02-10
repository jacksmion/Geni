import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolRegistry } from "../ToolRegistry";
import { McpToolAdapter } from "./McpToolAdapter";
import { defaultToolGuard, ToolTrustLevel } from "../../agent/ToolGuard";

// ===== Types =====

/**
 * MCP Tool specific configuration
 */
export interface McpToolSetting {
    enabled: boolean;
    trustLevel: 'Ask' | 'Auto';
}

/**
 * Configuration for an MCP Server
 */
export interface McpServerConfig {
    id: string;
    type?: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    apiKey?: string;
    env?: Record<string, string>;
    enabled?: boolean;
    toolSettings?: Record<string, McpToolSetting>;
}

/**
 * Connection state for tracking MCP server status
 */
export type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Server connection info (internal tracking)
 */
interface McpServerConnection {
    config: McpServerConfig;
    client: Client;
    state: McpConnectionState;
    lastError?: string;
    toolNames: string[]; // Track registered tool names for cleanup
}

// ===== McpManager =====

/**
 * McpManager - Manages MCP Server connections and tool registration
 * 
 * Responsibilities:
 * - Establish SSE/Stdio connections to external MCP Servers
 * - Maintain a connection pool
 * - Convert MCP Tools to internal ITool format and register to ToolRegistry
 * - Provide connection state monitoring
 */
export class McpManager {
    private connections: Map<string, McpServerConnection> = new Map();
    private registry: ToolRegistry;

    constructor(registry: ToolRegistry) {
        this.registry = registry;
    }

    /**
     * Connect to an MCP server
     */
    async connectToServer(config: McpServerConfig): Promise<void> {
        const existingConnection = this.connections.get(config.id);

        // If already connected, disconnect first
        if (existingConnection && existingConnection.state === 'connected') {
            console.log(`[McpManager] Disconnecting existing ${config.id} before reconnect...`);
            await this.disconnectServer(config.id);
        }

        // Initialize connection tracking
        this.connections.set(config.id, {
            config,
            client: null!,
            state: 'connecting',
            toolNames: []
        });

        console.log(`[McpManager] Connecting to ${config.id} via ${config.type || 'stdio'}...`);

        try {
            const transport = await this.createTransport(config);
            const client = new Client(
                { name: "assistant-core-client", version: "1.0.0" },
                { capabilities: {} }
            );

            await client.connect(transport);

            // Update connection state
            const connection = this.connections.get(config.id)!;
            connection.client = client;
            connection.state = 'connected';
            connection.lastError = undefined;

            console.log(`[McpManager] Connected to ${config.id} via ${config.type || 'stdio'}`);

            // Discover and register tools
            await this.refreshTools(config.id);

        } catch (error: any) {
            console.error(`[McpManager] Failed to connect to ${config.id}:`, error);

            // Update connection state with error
            const connection = this.connections.get(config.id);
            if (connection) {
                connection.state = 'error';
                connection.lastError = this.formatError(error, config);
            }

            throw new Error(this.formatError(error, config));
        }
    }

    /**
     * Create appropriate transport based on config type
     */
    private async createTransport(config: McpServerConfig): Promise<any> {
        if (config.type === 'sse') {
            if (!config.url) {
                throw new Error('URL is required for SSE transport');
            }

            const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

            // Construct EventSourceInit/RequestInit with headers if apiKey is present
            const opts: any = {};
            if (config.apiKey) {
                opts.headers = {
                    'Authorization': `Bearer ${config.apiKey}`
                };
            }

            return new SSEClientTransport(new URL(config.url), opts);
        } else {
            // Default to stdio
            if (!config.command) {
                throw new Error('Command is required for stdio transport');
            }

            return new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...(config.env || {}) } as Record<string, string>
            });
        }
    }

    /**
     * Format error message with helpful hints
     */
    private formatError(error: any, config: McpServerConfig): string {
        const originalMessage = error.message || String(error);

        // Enhance error message for common SSE configuration mistakes
        if (config.type === 'sse' && originalMessage.includes('Invalid content type')) {
            return `SSE Connection Failed: The server returned an invalid content type. Please check your URL (it should typically end with '/sse') and ensure the server is running. Original Error: ${originalMessage}`;
        }

        // Enhance error for command not found (stdio)
        if (config.type !== 'sse' && (originalMessage.includes('ENOENT') || originalMessage.includes('spawn'))) {
            return `Stdio Connection Failed: Command '${config.command}' not found. Please ensure the command is installed and accessible in PATH. Original Error: ${originalMessage}`;
        }

        return originalMessage;
    }

    /**
     * Refresh tools for a connected server
     */
    async refreshTools(serverId: string, newConfig?: McpServerConfig): Promise<void> {
        const connection = this.connections.get(serverId);
        if (!connection || (connection.state !== 'connected' && connection.state !== 'error')) {
            console.warn(`[McpManager] Cannot refresh tools: ${serverId} is not connected`);
            return;
        }

        if (newConfig) {
            connection.config = newConfig;
        }

        console.log(`[McpManager] Listing tools for ${serverId}...`);

        // Unregister previously registered tools from this server
        this.unregisterServerTools(serverId);

        const result = await connection.client.listTools();
        const registeredToolNames: string[] = [];
        const toolSettings = connection.config.toolSettings || {};

        for (const tool of result.tools) {
            const settings = toolSettings[tool.name];

            // If tool explicitly disabled, skip it
            if (settings && settings.enabled === false) {
                console.log(`[McpManager] Tool ${tool.name} (from ${serverId}) is disabled by user settings`);
                continue;
            }

            const schema = tool.inputSchema;
            const adapter = new McpToolAdapter(
                serverId,
                connection.client,
                tool.name,
                schema,
                tool.description || '',
                settings ? settings.trustLevel : 'Auto'
            );

            this.registry.register(adapter);

            // Sync with ToolGuard mapping
            const trustLevel = settings ? settings.trustLevel : 'Auto';
            defaultToolGuard.registerToolTrustLevel(
                adapter.getDefinition().name,
                trustLevel === 'Auto' ? ToolTrustLevel.Low : ToolTrustLevel.High
            );

            registeredToolNames.push(adapter.getDefinition().name);
            console.log(`[McpManager] Registered tool: ${tool.name} (from ${serverId})`);
        }

        // Track registered tools for cleanup
        connection.toolNames = registeredToolNames;
    }

    /**
     * Unregister all tools from a specific server
     */
    private unregisterServerTools(serverId: string): void {
        const connection = this.connections.get(serverId);
        if (!connection) return;

        for (const toolName of connection.toolNames) {
            this.registry.unregister(toolName);
        }
        connection.toolNames = [];
    }

    /**
     * Disconnect a specific server
     */
    async disconnectServer(serverId: string): Promise<void> {
        const connection = this.connections.get(serverId);
        if (!connection) {
            console.warn(`[McpManager] Server ${serverId} not found`);
            return;
        }

        // Unregister tools first
        this.unregisterServerTools(serverId);

        // Close client connection
        if (connection.client) {
            try {
                await connection.client.close();
            } catch (e: any) {
                console.error(`[McpManager] Error closing ${serverId}:`, e.message);
            }
        }

        // Update state
        connection.state = 'disconnected';
        this.connections.delete(serverId);

        console.log(`[McpManager] Disconnected from ${serverId}`);
    }

    /**
     * Disconnect all servers
     */
    async disconnectAll(): Promise<void> {
        const serverIds = Array.from(this.connections.keys());
        for (const serverId of serverIds) {
            await this.disconnectServer(serverId);
        }
    }

    /**
     * Get connection state for a server
     */
    getServerState(serverId: string): McpConnectionState {
        const connection = this.connections.get(serverId);
        return connection?.state || 'disconnected';
    }

    /**
     * Get all connection statuses
     */
    getConnectionStatuses(): Record<string, { state: McpConnectionState; error?: string; toolCount: number }> {
        const statuses: Record<string, { state: McpConnectionState; error?: string; toolCount: number }> = {};

        for (const [id, connection] of this.connections) {
            statuses[id] = {
                state: connection.state,
                error: connection.lastError,
                toolCount: connection.toolNames.length
            };
        }

        return statuses;
    }

    /**
     * Check if a server is connected
     */
    isConnected(serverId: string): boolean {
        return this.getServerState(serverId) === 'connected';
    }

    /**
     * Get list of connected server IDs
     */
    getConnectedServerIds(): string[] {
        return Array.from(this.connections.entries())
            .filter(([_, conn]) => conn.state === 'connected')
            .map(([id]) => id);
    }
}
