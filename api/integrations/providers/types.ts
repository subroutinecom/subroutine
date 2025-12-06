// Re-export shared integration types
export type {
  McpTransport,
  SandboxMcpConfig,
  SandboxGraphQLConfig,
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
 * Provider definition types.
 * These are templates that define how each provider type works.
 * Note: "auth" here is a misnomer - for MCP/GraphQL it contains protocol + auth config.
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
      authStrategy: AuthStrategy;
      /**
       * For bearer_oauth, we need OAuth config to authenticate users.
       * This is optional - only needed when authStrategy is bearer_oauth.
       */
      oauthConfig?: {
        authUrl: string;
        tokenUrl: string;
        defaultScopes: string[];
        requiredScopes?: string[];
        defaultRedirectPath?: string;
        handlers?: OAuthHandlers;
      };
    }
  | {
      type: "graphql";
      endpoint: string;
      authStrategy: AuthStrategy;
      /**
       * For bearer_oauth, we need OAuth config to authenticate users.
       * This is optional - only needed when authStrategy is bearer_oauth.
       */
      oauthConfig?: {
        authUrl: string;
        tokenUrl: string;
        defaultScopes: string[];
        requiredScopes?: string[];
        defaultRedirectPath?: string;
        handlers?: OAuthHandlers;
      };
    };

export interface IntegrationDefinition {
  id: string;
  name: string;
  description?: string;
  category?: string;
  viewerScoped?: boolean;
  auth: AuthStrategyDefinition;
}
