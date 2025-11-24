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
 * Authentication strategy for MCP server integrations.
 *
 * - `none`: No authentication required
 * - `api_key`: Static API key sent in a header (default: Authorization: Bearer)
 * - `bearer_passthrough`: Pass viewer's OAuth access token to MCP server
 * - `custom_headers`: Arbitrary custom headers for authentication
 */
export type McpAuthStrategy =
  | { type: "none" }
  | { type: "api_key"; headerName?: string }
  | { type: "bearer_passthrough" }
  | { type: "custom_headers"; headers: Record<string, string> };

/**
 * Transport protocol for MCP server communication.
 *
 * - `sse`: Server-Sent Events (most common for HTTP MCP servers)
 * - `streamable-http`: Streamable HTTP transport (newer, bidirectional)
 */
export type McpTransport = "sse" | "streamable-http";

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
