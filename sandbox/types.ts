export interface SandboxIntegrationCredentialsMetadata {
  providerAccountIdentifier?: string;
  viewerId?: string;
  [key: string]: unknown;
}

export interface SandboxIntegrationAccountPayload {
  id: string;
  userId: string;
  accountIdentifier?: string | null;
  credentials: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenType: string;
    scope?: string;
    metadata?: SandboxIntegrationCredentialsMetadata;
  };
}

/**
 * Authentication strategy for MCP integrations in sandbox context.
 * Mirrors McpAuthStrategy from api/integrations/providers/types.ts
 */
export type SandboxMcpAuthStrategy =
  | { type: "none" }
  | { type: "api_key"; headerName?: string }
  | { type: "bearer_passthrough" }
  | { type: "custom_headers"; headers: Record<string, string> };

/**
 * MCP-specific configuration for sandbox integrations.
 * Contains all info needed to connect to an MCP server from the sandbox.
 */
export interface SandboxMcpConfig {
  serverUrl: string;
  transport: "sse" | "streamable-http";
  authStrategy: SandboxMcpAuthStrategy;
  /** API key for api_key auth strategy */
  apiKey?: string;
  /** Access token for bearer_passthrough auth strategy (from viewer's connected account) */
  accessToken?: string;
}

export interface SandboxIntegrationPayload {
  id: string;
  provider: string;
  name: string;
  authConfig: Record<string, unknown>;
  account?: SandboxIntegrationAccountPayload;
  /** MCP-specific configuration. Present when provider is an MCP integration. */
  mcpConfig?: SandboxMcpConfig;
}
