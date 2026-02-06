/**
 * MCP (Model Context Protocol) Integration
 * 
 * This module provides integration with external MCP servers,
 * allowing the agent to use tools from MCP-compliant services.
 */

export { McpManager } from './McpManager';
export type { McpServerConfig, McpConnectionState } from './McpManager';
export { McpToolAdapter } from './McpToolAdapter';
