export type IntegrationProvider = "gmail" | "github" | "mock_oauth" | "mcp";

// MCP Auth Types
export type McpAuthStrategy =
  | { type: "none" }
  | { type: "api_key"; headerName?: string }
  | { type: "bearer_passthrough" }
  | { type: "custom_headers"; headers: Record<string, string> };

export type McpTransport = "sse" | "streamable-http";

export interface McpAuthConfig {
  type: "mcp";
  serverUrl: string;
  transport: McpTransport;
  authStrategy: McpAuthStrategy;
  apiKey?: string;
}

export interface OAuth2AuthConfig {
  type: "oauth2";
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  metadata?: Record<string, unknown>;
}

export type IntegrationAuthConfig = OAuth2AuthConfig | McpAuthConfig;

export interface Integration {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  name: string;
  authConfig: IntegrationAuthConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationProviderAuthType = "oauth2" | "custom" | "mcp";

export interface OAuthIntegrationProviderConfig {
  authUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  requiredScopes?: string[];
  defaultRedirectPath?: string;
}

export interface McpProviderConfig {
  serverUrl: string;
  transport: McpTransport;
  authStrategy: McpAuthStrategy;
}

export interface IntegrationProviderDefinition {
  id: IntegrationProvider;
  name: string;
  description?: string;
  viewerScoped: boolean;
  authType: IntegrationProviderAuthType;
  oauthConfig?: OAuthIntegrationProviderConfig | null;
  mcpConfig?: McpProviderConfig | null;
}

export type ConnectedAccountStatus = "active" | "expired" | "revoked" | "error";

export interface ConnectedAccountCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: "Bearer";
  scope?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectedAccount {
  id: string;
  integrationId: string;
  userId: string;
  organizationId: string;
  credentials: ConnectedAccountCredentials;
  accountIdentifier: string | null;
  status: ConnectedAccountStatus;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
