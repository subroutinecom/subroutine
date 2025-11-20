export type AuthStrategyDefinition =
  | {
      type: "oauth2";
      authUrl: string;
      tokenUrl: string;
      defaultScopes: string[];
      requiredScopes?: string[];
      defaultRedirectPath?: string;
      supportsCustomConfig?: boolean;
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
