import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Content block from MCP tool response.
 */
export interface McpContentBlock {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

/**
 * Result from calling an MCP tool.
 * Simplified from the full MCP response for easier consumption.
 */
export interface McpToolResult {
  content: McpContentBlock[];
  isError?: boolean;
}

/**
 * Tool information exposed via _listTools().
 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * The MCP API proxy interface.
 * Each tool from the MCP server becomes a method on this object.
 * Also exposes _listTools() for tool discovery.
 */
export interface McpApiProxy {
  /**
   * Lists all available tools from the MCP server.
   * Useful for discovering what tools are available.
   */
  _listTools(): Promise<McpToolInfo[]>;

  /**
   * Dynamic tool methods - each tool becomes a method.
   * Example: if the server has an "echo" tool, you can call proxy.echo({ message: "hi" })
   */
  [toolName: string]: (args?: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Extended tool type with parsed result for internal use.
 */
export type McpToolDefinition = Tool;
