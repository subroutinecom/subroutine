/**
 * MCP (Model Context Protocol) integration module.
 *
 * Provides functionality to connect to external MCP servers and expose their tools
 * through the sandbox integration proxy.
 */

export { createMcpClient, disconnectMcpClient, buildAuthHeaders, createTransport } from "./client";
export type { McpClientOptions } from "./client";

export { buildMcpToolProxy, toGetterName } from "./proxy";

export type {
  McpApiProxy,
  McpToolInfo,
  McpContentBlock,
  McpToolResult,
  McpToolDefinition,
} from "./types";
