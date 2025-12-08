/**
 * Lightweight MCP client for listing tools during subroutine generation.
 *
 * This is separate from the sandbox MCP client - it only needs to connect,
 * list tools, and disconnect. Used to populate tool information for the
 * code generation prompt.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpIntegrationConfig } from "../models/integration";
import { buildAuthHeadersFromBlock } from "../integrations/auth-utils.ts";

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Creates a transport for connecting to an MCP server.
 */
const createTransport = (
  config: McpIntegrationConfig,
  headers: Record<string, string>
): SSEClientTransport | StreamableHTTPClientTransport => {
  const url = new URL(config.serverUrl);

  const mcpHeaders: Record<string, string> = {
    ...headers,
    Accept: "application/json, text/event-stream",
  };

  const requestInit: RequestInit = {
    headers: mcpHeaders,
  };

  if (config.transport === "sse") {
    return new SSEClientTransport(url, { requestInit });
  } else if (config.transport === "streamable-http") {
    return new StreamableHTTPClientTransport(url, { requestInit });
  } else {
    throw new Error(`Unknown transport type: ${config.transport}`);
  }
};

/**
 * Lists available tools from an MCP server.
 *
 * @param config - MCP integration configuration
 * @param accessToken - User's access token (required for bearer_oauth and viewerScoped api_key)
 * @param timeoutMs - Connection timeout in milliseconds (default: 30000)
 * @returns Array of tool definitions
 * @throws Error if connection fails or times out
 */
export const listMcpTools = async (
  config: McpIntegrationConfig,
  accessToken?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<McpToolInfo[]> => {
  const headers = buildAuthHeadersFromBlock(config.auth, accessToken);
  const transport = createTransport(config, headers);

  const client = new Client({ name: "subroutine-api", version: "1.0.0" }, { capabilities: {} });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`MCP connection timeout after ${timeoutMs}ms to ${config.serverUrl}`));
      }, timeoutMs);
    });

    await Promise.race([connectPromise, timeoutPromise]);

    // Clear timeout after successful connect
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    // List tools
    const { tools } = await client.listTools();

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
    }));
  } catch (error) {
    // Wrap connection errors with more context
    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        throw error; // Already has good message
      }
      throw new Error(`Failed to connect to MCP server at ${config.serverUrl}: ${error.message}`);
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    // Always try to close the client
    await client.close().catch(() => {});
  }
};
