export type IntegrationProvider = "gmail" | "github" | "mock_oauth";

export interface IntegrationAuthConfig {
  type: "oauth2";
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  metadata?: Record<string, unknown>;
}

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

export type IntegrationProviderAuthType = "oauth2" | "custom";

export interface OAuthIntegrationProviderConfig {
  authUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  requiredScopes?: string[];
  defaultRedirectPath?: string;
}

export interface IntegrationProviderDefinition {
  id: IntegrationProvider;
  name: string;
  description?: string;
  viewerScoped: boolean;
  authType: IntegrationProviderAuthType;
  oauthConfig?: OAuthIntegrationProviderConfig | null;
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
