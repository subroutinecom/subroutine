// Re-export shared integration types
export type {
  McpTransport,
  SandboxMcpConfig,
  SandboxGraphQLConfig,
  SandboxOpenAPIConfig,
  AuthStrategy,
  AuthBlock,
  OAuthConfig,
} from "../../../packages/shared-types/integration";

// Import for local use
import type { McpTransport, AuthStrategy } from "../../../packages/shared-types/integration";

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface OAuthHandlers {
  customizeAuthorizationUrl?: (url: URL) => void;
  customizeTokenExchange?: (params: URLSearchParams) => void;
  customizeTokenHeaders?: (headers: Record<string, string>) => void;
  fetchAccountIdentifier: (accessToken: string) => Promise<string>;
}

/**
 * OAuth configuration for providers that support OAuth-based auth
 */
export interface ProviderOAuthConfig {
  authUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  requiredScopes?: string[];
  defaultRedirectPath?: string;
  handlers?: OAuthHandlers;
}

/**
 * API key configuration for providers that support API key auth
 */
export interface ProviderApiKeyConfig {
  headerName: string;
  headerPrefix?: string; // e.g., "Bearer ", "Token "
  instructionsUrl?: string; // Link to where users can get their API key
}

/**
 * An auth option that a provider supports.
 * Providers can support multiple auth options, letting users choose.
 */
export interface AuthOption {
  id: string; // Unique identifier for this option, e.g., "oauth", "api_key"
  strategy: AuthStrategy;
  label: string; // Display name, e.g., "OAuth 2.0", "Personal API Token"
  description?: string; // Help text, e.g., "Recommended for user-level access"
  recommended?: boolean; // If true, show as recommended option
  viewerScoped?: boolean; // Override the provider's viewerScoped setting for this option
  // Strategy-specific configurations
  oauthConfig?: ProviderOAuthConfig;
  apiKeyConfig?: ProviderApiKeyConfig;
}

/**
 * Provider definition types.
 * These are templates that define how each provider type works.
 *
 * Providers are NOT persisted - they're code-defined templates.
 * Only Integrations (instances) are stored in the database.
 *
 * Each provider specifies:
 * - Protocol details (endpoint, serverUrl, etc.)
 * - Available auth options (what auth methods users can choose from)
 */
export type AuthStrategyDefinition =
  | {
      type: "oauth2";
      authUrl: string;
      tokenUrl: string;
      defaultScopes: string[];
      requiredScopes?: string[];
      defaultRedirectPath?: string;
      supportsCustomConfig?: boolean;
      handlers?: OAuthHandlers;
    }
  | {
      type: "custom";
      description: string;
    }
  | {
      type: "mcp";
      serverUrl: string;
      transport: McpTransport;
      /** Auth options the user can choose from when creating an integration */
      authOptions: AuthOption[];
    }
  | {
      type: "graphql";
      endpoint: string;
      /** Auth options the user can choose from when creating an integration */
      authOptions: AuthOption[];
    }
  | {
      type: "openapi";
      baseUrl: string;
      /** Auth options the user can choose from when creating an integration */
      authOptions: AuthOption[];
    };

export interface IntegrationDefinition {
  id: string;
  name: string;
  description?: string;
  category?: string;
  viewerScoped?: boolean;
  auth: AuthStrategyDefinition;
}
