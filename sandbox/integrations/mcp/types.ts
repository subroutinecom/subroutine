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
 * Extended tool type with parsed result for internal use.
 */
export type McpToolDefinition = Tool;
