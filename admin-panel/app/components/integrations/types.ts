import type { McpTransport } from "~/types/integration";

// Auth strategy type in form
export type AuthStrategyType = "none" | "api_key" | "bearer_oauth" | "custom_headers";

// Form data structure
export interface IntegrationFormData {
  // Common fields
  provider: string;
  name: string;

  // Protocol-specific
  serverUrl?: string; // MCP
  transport?: McpTransport; // MCP
  endpoint?: string; // GraphQL

  // Auth strategy selection
  authStrategy: AuthStrategyType;

  // API Key auth
  apiKey?: string;
  apiKeyHeaderName?: string;
  apiKeyIsViewerScoped?: boolean;

  // OAuth auth
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthAuthUrl?: string;
  oauthTokenUrl?: string;
  oauthRedirectUri?: string;
  oauthScopes?: string;

  // Custom headers auth
  customHeaders?: string; // JSON string of Record<string, string>
}

// MCP Discovery auth method
export interface McpDiscoveryAuthMethod {
  type: "bearer_oauth" | "api_key" | "none";
  oauth?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes?: string[];
  };
}

// MCP Discovery result
export interface McpDiscoveryResult {
  serverInfo: {
    name: string;
    version?: string;
  };
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
  authMethods?: McpDiscoveryAuthMethod[];
}
