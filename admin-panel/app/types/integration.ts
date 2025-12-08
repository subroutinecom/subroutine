import type { AuthBlock, AuthStrategy } from "../../../packages/shared-types/integration";
export type { AuthBlock, AuthStrategy, OAuthConfig } from "../../../packages/shared-types/integration";

export type IntegrationProvider = "gmail" | "github" | "mock_oauth" | "mcp" | "graphql" | "openapi" | "calendar";

export type McpTransport = "sse" | "streamable-http";

// Unified auth strategy - same for MCP, GraphQL, and future protocols
export type AuthStrategyType = AuthStrategy["type"];

// MCP integration config
export interface McpIntegrationConfig {
  type: "mcp";
  serverUrl: string;
  transport: McpTransport;
  auth: AuthBlock;
  metadata?: Record<string, unknown>;
}

// GraphQL integration config
export interface GraphQLIntegrationConfig {
  type: "graphql";
  endpoint: string;
  auth: AuthBlock;
  metadata?: Record<string, unknown>;
}

// OpenAPI integration config
export interface OpenAPIIntegrationConfig {
  type: "openapi";
  baseUrl: string;
  specUrl?: string;
  auth: AuthBlock;
  spec?: string;
  specVersion?: "3.0" | "3.1";
  specFetchedAt?: number;
  metadata?: Record<string, unknown>;
}

// OAuth2 native integration config (Gmail, GitHub, etc.)
export interface OAuth2IntegrationConfig {
  type: "oauth2";
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  metadata?: Record<string, unknown>;
}

export type IntegrationConfig = OAuth2IntegrationConfig | McpIntegrationConfig | GraphQLIntegrationConfig | OpenAPIIntegrationConfig;

export interface Integration {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  name: string;
  authConfig: IntegrationConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationProviderAuthType = "oauth2" | "custom" | "mcp" | "graphql" | "openapi";

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
  auth: AuthBlock;
}

export interface GraphQLProviderConfig {
  endpoint: string;
  auth: AuthBlock;
}

export interface OpenAPIProviderConfig {
  baseUrl: string;
  specUrl?: string;
  auth: AuthBlock;
}

export interface IntegrationProviderDefinition {
  id: IntegrationProvider;
  name: string;
  description?: string;
  viewerScoped: boolean;
  authType: IntegrationProviderAuthType;
  oauthConfig?: OAuthIntegrationProviderConfig | null;
  mcpConfig?: McpProviderConfig | null;
  graphqlConfig?: GraphQLProviderConfig | null;
  openapiConfig?: OpenAPIProviderConfig | null;
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
  viewerId: string;
  organizationId: string;
  credentials: ConnectedAccountCredentials;
  accountIdentifier: string | null;
  status: ConnectedAccountStatus;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
