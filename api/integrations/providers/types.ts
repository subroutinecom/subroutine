// Re-export shared MCP types
export type {
  McpAuthStrategy,
  McpTransport,
  SandboxMcpConfig,
} from "../../../packages/shared-types/mcp";

// Import for local use
import type { McpAuthStrategy, McpTransport } from "../../../packages/shared-types/mcp";

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
      authStrategy: McpAuthStrategy;
      /**
       * For bearer_passthrough, we need OAuth config to authenticate users.
       * This is optional - only needed when authStrategy is bearer_passthrough.
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
