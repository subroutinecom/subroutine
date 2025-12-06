// Re-export shared integration types
export type {
  McpTransport,
  SandboxMcpConfig,
  SandboxGraphQLConfig,
  AuthStrategy,
  AuthBlock,
  OAuthConfig,
} from "../packages/shared-types/integration";

import type { SandboxMcpConfig, SandboxGraphQLConfig } from "../packages/shared-types/integration";

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
  /** GraphQL-specific configuration. Present when provider is a GraphQL integration. */
  graphqlConfig?: SandboxGraphQLConfig;
}
