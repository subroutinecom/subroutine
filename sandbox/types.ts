// Re-export shared MCP types
export type { McpAuthStrategy, McpTransport, SandboxMcpConfig } from "../packages/shared-types/mcp";

import type { SandboxMcpConfig } from "../packages/shared-types/mcp";

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

export interface SandboxIntegrationPayload {
  id: string;
  provider: string;
  name: string;
  authConfig: Record<string, unknown>;
  account?: SandboxIntegrationAccountPayload;
  /** MCP-specific configuration. Present when provider is an MCP integration. */
  mcpConfig?: SandboxMcpConfig;
}
