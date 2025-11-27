import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SandboxMcpConfig } from "../../types";

export interface McpClientOptions {
  /** Name for this client instance (shown in MCP logs) */
  clientName?: string;
  /** Version for this client instance */
  clientVersion?: string;
  /** Connection timeout in milliseconds */
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<McpClientOptions> = {
  clientName: "subroutine-sandbox",
  clientVersion: "1.0.0",
  timeoutMs: 30000,
};

/**
 * Builds HTTP headers for MCP server authentication based on the auth strategy.
 */
export const buildAuthHeaders = (config: SandboxMcpConfig): Record<string, string> => {
  const headers: Record<string, string> = {};

  switch (config.authStrategy.type) {
    case "none":
      // No auth headers needed
      break;

    case "api_key": {
      if (!config.apiKey) {
        throw new Error("MCP integration with api_key auth strategy requires apiKey");
      }
      const headerName = config.authStrategy.headerName ?? "Authorization";
      // If using Authorization header, format as Bearer token
      // Otherwise use the raw key value
      if (headerName.toLowerCase() === "authorization") {
        headers[headerName] = `Bearer ${config.apiKey}`;
      } else {
        headers[headerName] = config.apiKey;
      }
      break;
    }

    case "bearer_passthrough": {
      if (!config.accessToken) {
        throw new Error(
          "MCP integration with bearer_passthrough auth strategy requires accessToken"
        );
      }
      headers["Authorization"] = `Bearer ${config.accessToken}`;
      break;
    }

    case "custom_headers": {
      Object.assign(headers, config.authStrategy.headers);
      break;
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = config.authStrategy;
      throw new Error(`Unknown auth strategy: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return headers;
};

/**
 * Creates a transport for connecting to an MCP server.
 */
export const createTransport = (
  config: SandboxMcpConfig,
  headers: Record<string, string>
): SSEClientTransport | StreamableHTTPClientTransport => {
  const url = new URL(config.serverUrl);

  // MCP Streamable HTTP requires Accept header with both application/json and text/event-stream
  // The SDK expects these headers to be set on the transport
  const mcpHeaders: Record<string, string> = {
    ...headers,
    Accept: "application/json, text/event-stream",
  };

  // Common fetch options for both transports
  const requestInit: RequestInit = {
    headers: mcpHeaders,
  };

  if (config.transport === "sse") {
    return new SSEClientTransport(url, {
      requestInit,
    });
  } else if (config.transport === "streamable-http") {
    return new StreamableHTTPClientTransport(url, {
      requestInit,
    });
  } else {
    throw new Error(`Unknown transport type: ${config.transport}`);
  }
};

/**
 * Creates and connects an MCP client to the specified server.
 *
 * @param config - MCP configuration including server URL, transport, and auth
 * @param options - Optional client configuration
 * @returns Connected MCP client
 * @throws Error if connection fails or times out
 */
export const createMcpClient = async (
  config: SandboxMcpConfig,
  options?: McpClientOptions
): Promise<Client> => {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  console.log(
    `[MCP Client] Creating client for ${config.serverUrl}, transport: ${config.transport}, auth: ${config.authStrategy.type}`
  );

  // Build auth headers
  const headers = buildAuthHeaders(config);
  console.log(`[MCP Client] Auth headers built after ${Date.now() - startTime}ms`);

  // Create transport
  const transport = createTransport(config, headers);
  console.log(`[MCP Client] Transport created after ${Date.now() - startTime}ms`);

  // Create client
  const client = new Client(
    {
      name: opts.clientName,
      version: opts.clientVersion,
    },
    {
      capabilities: {},
    }
  );

  // Connect with timeout - ensure cleanup on timeout or success
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    console.log(`[MCP Client] Connecting to ${config.serverUrl}...`);
    const connectPromise = client.connect(transport);

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`MCP connection timeout after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);
    });

    await Promise.race([connectPromise, timeoutPromise]);
    console.log(`[MCP Client] Connected successfully after ${Date.now() - startTime}ms`);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(
      `[MCP Client] Connection failed after ${elapsed}ms: ${error instanceof Error ? error.message : error}`
    );
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }

  return client;
};

/**
 * Safely disconnects an MCP client.
 */
export const disconnectMcpClient = async (client: Client): Promise<void> => {
  try {
    await client.close();
  } catch {
    // Ignore disconnect errors
  }
};
