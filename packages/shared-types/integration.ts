/**
 * Shared integration types used across API and Sandbox.
 *
 * These types define the contract for all integration protocols (MCP, GraphQL, REST)
 * with authentication being orthogonal to protocol choice.
 */

/**
 * Transport protocol for MCP server communication.
 */
export type McpTransport = "sse" | "streamable-http";

/**
 * Authentication strategy - protocol agnostic.
 * The same strategies are available for MCP, GraphQL, REST, etc.
 *
 * - `none`: No authentication required
 * - `api_key`: Static API key sent in a header (default: Authorization: Bearer)
 *   - `viewerScoped`: If true, users provide their own PAT via connected accounts
 * - `bearer_oauth`: Pass viewer's OAuth access token to the service
 * - `custom_headers`: Arbitrary custom headers for authentication
 */
export type AuthStrategy =
  | { type: "none" }
  | { type: "api_key"; headerName?: string; viewerScoped?: boolean }
  | { type: "bearer_oauth" }
  | { type: "custom_headers"; headers: Record<string, string> };

/**
 * OAuth provider configuration.
 * Used when auth strategy is bearer_oauth.
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
}

/**
 * Standardized auth block - same structure for all protocols.
 * This is the dedicated authentication configuration that is
 * orthogonal to the protocol type.
 */
export interface AuthBlock {
  strategy: AuthStrategy;
  /** API key for api_key strategy (org-level, not viewer-scoped) */
  apiKey?: string;
  /** OAuth config for bearer_oauth strategy */
  oauthConfig?: OAuthConfig;
}

/**
 * MCP-specific configuration for sandbox integrations.
 * Contains all info needed to connect to an MCP server from the sandbox.
 */
export interface SandboxMcpConfig {
  serverUrl: string;
  transport: McpTransport;
  authStrategy: AuthStrategy;
  /** API key for api_key auth strategy */
  apiKey?: string;
  /** Access token for bearer_oauth auth strategy (from viewer's connected account) */
  accessToken?: string;
}

/**
 * GraphQL-specific configuration for sandbox integrations.
 * Contains all info needed to execute GraphQL queries from the sandbox.
 */
export interface SandboxGraphQLConfig {
  endpoint: string;
  /** Pre-computed auth headers based on auth strategy */
  authHeaders: Record<string, string>;
}
