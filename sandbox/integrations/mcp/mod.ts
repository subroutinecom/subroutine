/**
 * MCP (Model Context Protocol) integration module.
 *
 * Provides functionality to connect to external MCP servers and expose their tools
 * through the sandbox integration proxy.
 *
 * Usage in sandbox code:
 *   const client = await integrations.getMcpClient("integration-name");
 *   const { tools } = await client.listTools();
 *   const result = await client.callTool({ name: "toolName", arguments: { ... } });
 */

export { createMcpClient, disconnectMcpClient, buildAuthHeaders, createTransport } from "./client";
export type { McpClientOptions } from "./client";

export type { McpContentBlock, McpToolResult, McpToolDefinition } from "./types";
