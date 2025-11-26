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
import type { McpAuthConfig } from "../models/integration";

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Builds HTTP headers for MCP server authentication based on the auth strategy.
 */
const buildAuthHeaders = (config: McpAuthConfig, accessToken?: string): Record<string, string> => {
  const headers: Record<string, string> = {};

  switch (config.authStrategy.type) {
    case "none":
      // No auth headers needed
      break;

    case "api_key": {
      if (config.authStrategy.viewerScoped) {
        // Viewer-scoped PAT - token comes from connected account
        if (!accessToken) {
          throw new Error(
            "MCP integration with viewer-scoped api_key requires user's access token"
          );
        }
        const headerName = config.authStrategy.headerName ?? "Authorization";
        if (headerName.toLowerCase() === "authorization") {
          headers[headerName] = `Bearer ${accessToken}`;
        } else {
          headers[headerName] = accessToken;
        }
      } else {
        // Org-level API key
        if (!config.apiKey) {
          throw new Error("MCP integration with api_key auth strategy requires apiKey");
        }
        const headerName = config.authStrategy.headerName ?? "Authorization";
        if (headerName.toLowerCase() === "authorization") {
          headers[headerName] = `Bearer ${config.apiKey}`;
        } else {
          headers[headerName] = config.apiKey;
        }
      }
      break;
    }

    case "bearer_passthrough": {
      if (!accessToken) {
        throw new Error(
          "MCP integration with bearer_passthrough auth strategy requires accessToken"
        );
      }
      headers["Authorization"] = `Bearer ${accessToken}`;
      break;
    }

    case "custom_headers": {
      Object.assign(headers, config.authStrategy.headers);
      break;
    }

    default: {
      const _exhaustive: never = config.authStrategy;
      throw new Error(`Unknown auth strategy: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return headers;
};

/**
 * Creates a transport for connecting to an MCP server.
 */
const createTransport = (
  config: McpAuthConfig,
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
 * @param config - MCP auth configuration from the integration
 * @param accessToken - User's access token (required for bearer_passthrough and viewerScoped api_key)
 * @param timeoutMs - Connection timeout in milliseconds (default: 30000)
 * @returns Array of tool definitions
 * @throws Error if connection fails or times out
 */
export const listMcpTools = async (
  config: McpAuthConfig,
  accessToken?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<McpToolInfo[]> => {
  const headers = buildAuthHeaders(config, accessToken);
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
