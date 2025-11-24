import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpApiProxy, McpToolInfo, McpContentBlock } from "./types";

/**
 * Content block type from MCP SDK (matches the runtime structure)
 */
interface SdkContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Parses MCP content blocks into a simplified value.
 *
 * - Single text block: returns parsed JSON or raw text
 * - Multiple blocks or non-text: returns the full content array
 */
const parseToolResult = (content: McpContentBlock[]): unknown => {
  // Single text block - try to parse as JSON for convenience
  if (content.length === 1 && content[0].type === "text" && content[0].text !== undefined) {
    const text = content[0].text;
    try {
      return JSON.parse(text);
    } catch {
      // Not JSON, return as string
      return text;
    }
  }

  // Multiple blocks or non-text - return as-is
  return content;
};

/**
 * Extracts error message from MCP content blocks.
 */
const extractErrorMessage = (content: unknown): string => {
  if (!Array.isArray(content)) {
    return "Unknown error";
  }

  const textBlocks = content
    .filter((c): c is SdkContentBlock => typeof c === "object" && c !== null && "type" in c)
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string);

  return textBlocks.join("\n") || "Unknown error";
};

/**
 * Builds a proxy object from an MCP client that exposes each tool as a callable method.
 *
 * Example usage:
 * ```ts
 * const proxy = await buildMcpToolProxy(client);
 * const result = await proxy.echo({ message: "hello" });
 * const tools = await proxy._listTools();
 * ```
 *
 * @param client - Connected MCP client
 * @returns Proxy object with tool methods
 */
export const buildMcpToolProxy = async (client: Client): Promise<McpApiProxy> => {
  // Discover available tools
  const { tools } = await client.listTools();

  // Build proxy object with a method for each tool
  const proxy: Record<string, (args?: Record<string, unknown>) => Promise<unknown>> = {};

  // Add _listTools method for tool discovery
  proxy._listTools = async (): Promise<McpToolInfo[]> => {
    // Re-fetch tools in case they changed (some servers are dynamic)
    const { tools: currentTools } = await client.listTools();
    return currentTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
  };

  // Add a method for each discovered tool
  for (const tool of tools) {
    proxy[tool.name] = async (args?: Record<string, unknown>): Promise<unknown> => {
      const result = await client.callTool({
        name: tool.name,
        arguments: args ?? {},
      });

      // Check for tool-level errors
      if (result.isError) {
        const errorMessage = extractErrorMessage(result.content);
        throw new Error(`MCP tool '${tool.name}' error: ${errorMessage}`);
      }

      // Parse and return the result
      // Cast content to our type - the SDK types it as unknown but it's always an array
      const content = (Array.isArray(result.content) ? result.content : []) as McpContentBlock[];
      return parseToolResult(content);
    };
  }

  return proxy as McpApiProxy;
};

/**
 * Converts an integration name to a getter function name.
 * Example: "my-mcp-server" -> "getMyMcpServer"
 */
export const toGetterName = (integrationName: string): string => {
  // Remove non-alphanumeric characters and split into words
  const words = integrationName
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/);

  if (words.length === 0 || (words.length === 1 && words[0] === "")) {
    return "getMcp";
  }

  // Convert to PascalCase and prepend "get"
  const pascalCase = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  return `get${pascalCase}`;
};
