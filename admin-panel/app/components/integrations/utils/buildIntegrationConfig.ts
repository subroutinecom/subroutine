import type { IntegrationProviderDefinition, AuthBlock, AuthStrategy } from "~/types/integration";
import type { IntegrationFormData } from "../types";

interface BuildResult {
  success: true;
  config: string;
}

interface BuildError {
  success: false;
  error: string;
}

export const buildIntegrationConfig = (
  data: IntegrationFormData,
  definition: IntegrationProviderDefinition
): BuildResult | BuildError => {
  // Build auth strategy
  const authStrategy = buildAuthStrategy(data);

  // Build auth block
  const authBlock: AuthBlock = {
    strategy: authStrategy,
  };

  // Add API key if using api_key strategy
  if (data.authStrategy === "api_key") {
    if (!data.apiKeyIsViewerScoped) {
      if (!data.apiKey?.trim()) {
        return { success: false, error: "API key is required" };
      }
      authBlock.apiKey = data.apiKey.trim();
    }
  }

  // Add OAuth config if using bearer_oauth strategy
  if (data.authStrategy === "bearer_oauth") {
    if (!data.oauthClientId?.trim()) {
      return { success: false, error: "OAuth Client ID is required" };
    }
    if (!data.oauthAuthUrl?.trim()) {
      return { success: false, error: "OAuth Authorization URL is required" };
    }
    if (!data.oauthTokenUrl?.trim()) {
      return { success: false, error: "OAuth Token URL is required" };
    }

    authBlock.oauthConfig = {
      clientId: data.oauthClientId.trim(),
      clientSecret: data.oauthClientSecret?.trim() ?? "",
      authUrl: data.oauthAuthUrl.trim(),
      tokenUrl: data.oauthTokenUrl.trim(),
      redirectUri: data.oauthRedirectUri?.trim() ?? "",
      scopes: data.oauthScopes?.split(/[\s,]+/).filter(Boolean) ?? [],
    };
  }

  // Build protocol-specific config
  if (definition.authType === "mcp") {
    if (!data.serverUrl?.trim()) {
      return { success: false, error: "Server URL is required" };
    }

    const config = {
      type: "mcp" as const,
      serverUrl: data.serverUrl.trim(),
      transport: data.transport ?? "sse",
      auth: authBlock,
    };

    return { success: true, config: JSON.stringify(config) };
  }

  if (definition.authType === "graphql") {
    if (!data.endpoint?.trim()) {
      return { success: false, error: "GraphQL endpoint is required" };
    }

    const config = {
      type: "graphql" as const,
      endpoint: data.endpoint.trim(),
      auth: authBlock,
    };

    return { success: true, config: JSON.stringify(config) };
  }

  if (definition.authType === "openapi") {
    if (!data.baseUrl?.trim()) {
      return { success: false, error: "Base URL is required" };
    }

    const config: Record<string, unknown> = {
      type: "openapi" as const,
      baseUrl: data.baseUrl.trim(),
      auth: authBlock,
    };

    // Add spec URL if provided
    if (data.specUrl?.trim()) {
      config.specUrl = data.specUrl.trim();
    }

    return { success: true, config: JSON.stringify(config) };
  }

  // OAuth2 native provider (gmail, github, etc.)
  if (definition.authType === "oauth2") {
    if (!data.oauthClientId?.trim()) {
      return { success: false, error: "OAuth Client ID is required" };
    }

    const config = {
      type: "oauth2" as const,
      clientId: data.oauthClientId.trim(),
      clientSecret: data.oauthClientSecret?.trim() ?? "",
      authUrl: data.oauthAuthUrl?.trim() ?? definition.oauthConfig?.authUrl ?? "",
      tokenUrl: data.oauthTokenUrl?.trim() ?? definition.oauthConfig?.tokenUrl ?? "",
      redirectUri: data.oauthRedirectUri?.trim() ?? "",
      scopes: data.oauthScopes?.split(/[\s,]+/).filter(Boolean) ?? [],
    };

    return { success: true, config: JSON.stringify(config) };
  }

  return { success: false, error: "Unknown provider type" };
};

const buildAuthStrategy = (data: IntegrationFormData): AuthStrategy => {
  switch (data.authStrategy) {
    case "api_key":
      return {
        type: "api_key",
        headerName: data.apiKeyHeaderName?.trim() || "X-API-Key",
        viewerScoped: data.apiKeyIsViewerScoped ?? false,
      };

    case "bearer_oauth":
      return { type: "bearer_oauth" };

    case "custom_headers": {
      let headers: Record<string, string> = {};
      try {
        headers = JSON.parse(data.customHeaders ?? "{}");
      } catch {
        headers = {};
      }
      return { type: "custom_headers", headers };
    }

    case "none":
    default:
      return { type: "none" };
  }
};
