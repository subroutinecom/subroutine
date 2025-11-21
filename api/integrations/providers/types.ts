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
    };

export interface IntegrationDefinition {
  id: string;
  name: string;
  description?: string;
  category?: string;
  viewerScoped?: boolean;
  auth: AuthStrategyDefinition;
}
