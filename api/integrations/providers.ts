export const INTEGRATION_PROVIDERS = ["gmail", "github"] as const;

export type IntegrationProvider = typeof INTEGRATION_PROVIDERS[number];

export interface ProviderConfig {
  name: string;
  authUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  requiredScopes: string[];
}

export const PROVIDER_CONFIGS: Record<IntegrationProvider, ProviderConfig> = {
  gmail: {
    name: "Gmail",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultScopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    requiredScopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  },

  github: {
    name: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    defaultScopes: [
      "repo",
      "read:user",
    ],
    requiredScopes: [
      "read:user",
    ],
  },
};

export const isValidProvider = (
  provider: string,
): provider is IntegrationProvider => {
  return INTEGRATION_PROVIDERS.includes(provider as IntegrationProvider);
};

export const getProviderConfig = (
  provider: IntegrationProvider,
): ProviderConfig => {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return config;
};
