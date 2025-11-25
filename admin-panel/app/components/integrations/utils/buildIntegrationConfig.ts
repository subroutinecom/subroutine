import type { IntegrationFormData } from "../ProviderSelector";
import type { IntegrationProviderDefinition, McpAuthStrategy } from "~/types/integration";

export type ConfigBuildResult =
  | { success: true; config: string }
  | { success: false; error: string };

/**
 * Validates a URL string
 */
const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Parses a comma-separated scope string into an array
 */
const parseScopeString = (scopes: string): string[] => {
  return scopes
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

/**
 * Builds the MCP auth strategy from form data
 */
const buildMcpAuthStrategy = (
  data: IntegrationFormData
): { strategy: McpAuthStrategy; oauthConfig?: object } | { error: string } => {
  switch (data.authStrategyType) {
    case "none":
      return { strategy: { type: "none" } };

    case "api_key":
      if (data.apiKeyIsViewerScoped) {
        return {
          strategy: {
            type: "api_key",
            viewerScoped: true,
            ...(data.apiKeyHeaderName.trim() && { headerName: data.apiKeyHeaderName.trim() }),
          },
        };
      } else {
        if (!data.apiKey.trim()) {
          return { error: "API key is required for organization-level API Key authentication" };
        }
        return {
          strategy: {
            type: "api_key",
            ...(data.apiKeyHeaderName.trim() && { headerName: data.apiKeyHeaderName.trim() }),
          },
        };
      }

    case "bearer_passthrough": {
      // Validate required fields
      if (!data.oauthAuthUrl.trim()) {
        return { error: "OAuth Authorization URL is required for Bearer Passthrough" };
      }
      if (!data.oauthTokenUrl.trim()) {
        return { error: "OAuth Token URL is required for Bearer Passthrough" };
      }
      if (!data.clientId.trim()) {
        return { error: "OAuth Client ID is required for Bearer Passthrough" };
      }
      if (!data.clientSecret.trim()) {
        return { error: "OAuth Client Secret is required for Bearer Passthrough" };
      }
      if (!data.redirectUri.trim()) {
        return { error: "OAuth Redirect URI is required for Bearer Passthrough" };
      }

      // Validate URLs
      if (!isValidUrl(data.oauthAuthUrl.trim())) {
        return { error: "Invalid OAuth Authorization URL" };
      }
      if (!isValidUrl(data.oauthTokenUrl.trim())) {
        return { error: "Invalid OAuth Token URL" };
      }

      const scopes = parseScopeString(data.scopes);
      if (scopes.length === 0) {
        return { error: "At least one OAuth scope is required for Bearer Passthrough" };
      }

      return {
        strategy: { type: "bearer_passthrough" },
        oauthConfig: {
          clientId: data.clientId.trim(),
          clientSecret: data.clientSecret.trim(),
          authUrl: data.oauthAuthUrl.trim(),
          tokenUrl: data.oauthTokenUrl.trim(),
          redirectUri: data.redirectUri.trim(),
          scopes,
        },
      };
    }

    case "custom_headers": {
      try {
        const headers = data.customHeaders.trim() ? JSON.parse(data.customHeaders.trim()) : {};
        if (Object.keys(headers).length === 0) {
          return { error: "Custom headers must have at least one header" };
        }
        return { strategy: { type: "custom_headers", headers } };
      } catch {
        return { error: "Custom headers must be valid JSON" };
      }
    }

    default:
      return { strategy: { type: "none" } };
  }
};

/**
 * Builds the MCP integration config
 */
export const buildMcpConfig = (data: IntegrationFormData): ConfigBuildResult => {
  // Validate server URL
  if (!data.serverUrl.trim()) {
    return { success: false, error: "Server URL is required" };
  }
  if (!isValidUrl(data.serverUrl.trim())) {
    return { success: false, error: "Invalid server URL" };
  }

  // Build auth strategy
  const strategyResult = buildMcpAuthStrategy(data);
  if ("error" in strategyResult) {
    return { success: false, error: strategyResult.error };
  }

  const config = {
    type: "mcp" as const,
    serverUrl: data.serverUrl.trim(),
    transport: data.transport,
    authStrategy: strategyResult.strategy,
    // Only include apiKey for org-level (non-viewer-scoped) API key auth
    ...(data.authStrategyType === "api_key" &&
      !data.apiKeyIsViewerScoped &&
      data.apiKey.trim() && { apiKey: data.apiKey.trim() }),
    ...(strategyResult.oauthConfig && { oauthConfig: strategyResult.oauthConfig }),
  };

  return { success: true, config: JSON.stringify(config) };
};

/**
 * Builds the OAuth2 integration config
 */
export const buildOAuth2Config = (
  data: IntegrationFormData,
  definition: IntegrationProviderDefinition
): ConfigBuildResult => {
  if (!definition.oauthConfig) {
    return { success: false, error: "OAuth configuration not found for provider" };
  }

  const scopes = parseScopeString(data.scopes);
  if (scopes.length === 0) {
    return { success: false, error: "At least one scope is required" };
  }

  const config = {
    type: "oauth2" as const,
    clientId: data.clientId.trim(),
    clientSecret: data.clientSecret.trim(),
    scopes,
    authUrl: definition.oauthConfig.authUrl,
    tokenUrl: definition.oauthConfig.tokenUrl,
    redirectUri: data.redirectUri.trim(),
  };

  return { success: true, config: JSON.stringify(config) };
};

/**
 * Builds the integration config based on provider type
 */
export const buildIntegrationConfig = (
  data: IntegrationFormData,
  definition: IntegrationProviderDefinition
): ConfigBuildResult => {
  if (definition.authType === "mcp") {
    return buildMcpConfig(data);
  } else if (definition.authType === "oauth2") {
    return buildOAuth2Config(data, definition);
  } else {
    return { success: false, error: "Selected provider is not configured properly" };
  }
};
