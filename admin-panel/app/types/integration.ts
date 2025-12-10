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

// =============================================================================
// PROVIDER DEFINITIONS (Templates/Classes)
// =============================================================================
//
// Provider definitions are like "classes" or "templates" that describe:
// - How to connect to a service (endpoint, protocol, etc.)
// - What authentication methods are supported
// - Default configuration values
//
// When a user creates an Integration, they select a provider and fill in
// their specific credentials. The Integration is the "instance" created from
// the provider "template".
//
// Example:
//   Provider "Slack" (template) -> Integration "My Slack Bot" (instance)
//   Provider "Slack" (template) -> Integration "Team Slack OAuth" (instance)
//
// A single provider can support multiple auth options (e.g., Slack supports
// both OAuth and Bot Token). The user picks one when creating their integration.
// =============================================================================

export interface OAuthIntegrationProviderConfig {
  authUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  requiredScopes?: string[];
  defaultRedirectPath?: string;
}

/** API key configuration for an auth option */
export interface AuthOptionApiKeyConfig {
  headerName: string;
  headerPrefix?: string;
  instructionsUrl?: string;
}

/**
 * An authentication option that a provider supports.
 * Providers can offer multiple auth options (e.g., OAuth + API Key).
 * When creating an integration, the user selects one option.
 */
export interface IntegrationAuthOption {
  /** Unique identifier for this option (e.g., "oauth", "bot_token") */
  id: string;
  /** The auth strategy configuration */
  strategy: {
    type: string;
    headerName?: string;
    headers?: string;
  };
  /** Display name for the UI (e.g., "OAuth 2.0", "Bot Token") */
  label: string;
  /** Help text describing this option */
  description?: string;
  /** If true, this option is recommended */
  recommended?: boolean;
  /** Whether this option creates viewer-scoped integrations */
  viewerScoped?: boolean;
  /** OAuth configuration (for bearer_oauth strategy) */
  oauthConfig?: OAuthIntegrationProviderConfig | null;
  /** API key configuration (for api_key strategy) */
  apiKeyConfig?: AuthOptionApiKeyConfig | null;
}

export interface McpProviderConfig {
  serverUrl: string;
  transport: McpTransport;
  /** Auth options the user can choose from when creating an integration */
  authOptions: IntegrationAuthOption[];
}

export interface GraphQLProviderConfig {
  endpoint: string;
  /** Auth options the user can choose from when creating an integration */
  authOptions: IntegrationAuthOption[];
}

export interface OpenAPIProviderConfig {
  baseUrl: string;
  /** URL to fetch the OpenAPI spec from */
  specUrl?: string;
  /** Auth options the user can choose from when creating an integration */
  authOptions: IntegrationAuthOption[];
}

/**
 * Provider Definition - A template for creating integrations.
 *
 * Think of this like a "class" that describes how to connect to a service.
 * Users create Integration "instances" from these templates by providing
 * their specific credentials and configuration.
 */
export interface IntegrationProviderDefinition {
  id: string;
  name: string;
  description?: string;
  /** Category for grouping (e.g., "communication", "project-management", "generic") */
  category?: string | null;
  /** Default viewer-scoped setting (can be overridden by auth option) */
  viewerScoped: boolean;
  /** The protocol type (mcp, graphql, openapi, oauth2) */
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
