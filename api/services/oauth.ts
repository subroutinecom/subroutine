import { getProviderDefinition, type IntegrationProvider } from "../integrations/providers.ts";
import type { OAuthTokenResponse } from "../integrations/providers/types.ts";
import { createConnectedAccount } from "../models/connected-account.ts";
import { getIntegrationOrGlobal, type IntegrationAuthConfig } from "../models/integration.ts";
import { getLogger } from "../utils/logger.ts";
import { discoverMcpOAuth } from "./mcp-oauth-discovery.ts";
const logger = getLogger("api/services/oauth.ts");

export interface OAuthState {
  integrationId: string;
  organizationId: string;
  provider: IntegrationProvider;
  timestamp: number;
  nonce: string;
  viewerId: string;
}

const encodeState = (state: OAuthState): string => {
  const stateString = JSON.stringify(state);
  return btoa(stateString);
};

const decodeState = (encoded: string): OAuthState => {
  try {
    const decoded = atob(encoded);
    return JSON.parse(decoded);
  } catch (error) {
    logger.error("Failed to decode state:", error);
    throw new Error("Invalid state parameter");
  }
};

export const decodeAuthorizationState = (encoded: string): OAuthState => decodeState(encoded);

const generateNonce = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/**
 * Extracted OAuth configuration used for authorization flow.
 */
interface ExtractedOAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
}

/**
 * Extracts OAuth configuration from an integration's auth config.
 * Handles both OAuth2 integrations and MCP integrations with bearer_passthrough.
 */
const extractOAuthConfig = (authConfig: IntegrationAuthConfig): ExtractedOAuthConfig | null => {
  if (authConfig.type === "oauth2") {
    if (
      !authConfig.clientId ||
      !authConfig.clientSecret ||
      !authConfig.authUrl ||
      !authConfig.tokenUrl ||
      !authConfig.redirectUri
    ) {
      return null;
    }
    return {
      clientId: authConfig.clientId,
      clientSecret: authConfig.clientSecret,
      authUrl: authConfig.authUrl,
      tokenUrl: authConfig.tokenUrl,
      redirectUri: authConfig.redirectUri,
      scopes: authConfig.scopes ?? [],
    };
  }

  if (authConfig.type === "mcp") {
    if (authConfig.auth.strategy.type !== "bearer_oauth" || !authConfig.auth.oauthConfig) {
      return null;
    }
    return {
      clientId: authConfig.auth.oauthConfig.clientId,
      clientSecret: authConfig.auth.oauthConfig.clientSecret,
      authUrl: authConfig.auth.oauthConfig.authUrl,
      tokenUrl: authConfig.auth.oauthConfig.tokenUrl,
      redirectUri: authConfig.auth.oauthConfig.redirectUri,
      scopes: authConfig.auth.oauthConfig.scopes,
    };
  }

  if (authConfig.type === "graphql") {
    if (authConfig.auth.strategy.type !== "bearer_oauth" || !authConfig.auth.oauthConfig) {
      return null;
    }
    return {
      clientId: authConfig.auth.oauthConfig.clientId,
      clientSecret: authConfig.auth.oauthConfig.clientSecret,
      authUrl: authConfig.auth.oauthConfig.authUrl,
      tokenUrl: authConfig.auth.oauthConfig.tokenUrl,
      redirectUri: authConfig.auth.oauthConfig.redirectUri,
      scopes: authConfig.auth.oauthConfig.scopes,
    };
  }

  if (authConfig.type === "openapi") {
    if (authConfig.auth.strategy.type !== "bearer_oauth" || !authConfig.auth.oauthConfig) {
      return null;
    }
    return {
      clientId: authConfig.auth.oauthConfig.clientId,
      clientSecret: authConfig.auth.oauthConfig.clientSecret,
      authUrl: authConfig.auth.oauthConfig.authUrl,
      tokenUrl: authConfig.auth.oauthConfig.tokenUrl,
      redirectUri: authConfig.auth.oauthConfig.redirectUri,
      scopes: authConfig.auth.oauthConfig.scopes,
    };
  }

  return null;
};

const mergeScopes = (base: string[], additional: string[]): string[] => {
  return [...new Set([...base, ...additional])];
};

// This will merge scopes with MCP requested scopes as per RFC 9728
export const generateAuthorizationUrl = async (params: {
  integrationId: string;
  organizationId: string;
  viewerId: string;
  additionalScopes?: string[];
  mcpServerUrl?: string;
}): Promise<{ url: string; state: string }> => {
  const { integrationId, organizationId, viewerId, additionalScopes, mcpServerUrl } = params;

  const integration = await getIntegrationOrGlobal(integrationId, organizationId);
  if (!integration) {
    throw new Error("Integration not found");
  }

  if (!integration.enabled) {
    throw new Error("Integration is disabled");
  }

  const authConfig = integration.authConfig;

  const oauthConfig = extractOAuthConfig(authConfig);
  if (!oauthConfig) {
    if (authConfig.type === "mcp") {
      throw new Error(
        `MCP integration ${integration.name} does not support OAuth authorization. ` +
          `Only MCP integrations with bearer_passthrough auth strategy can use OAuth.`
      );
    }
    throw new Error(
      `Integration ${integration.name} uses ${authConfig.type} auth, not OAuth2. Cannot generate authorization URL.`
    );
  }

  const provider = integration.provider as IntegrationProvider;
  const definition = getProviderDefinition(provider);

  const state: OAuthState = {
    integrationId,
    organizationId,
    provider,
    timestamp: Date.now(),
    nonce: generateNonce(),
    viewerId,
  };

  const encodedState = encodeState(state);

  const authUrl = new URL(oauthConfig.authUrl);
  authUrl.searchParams.set("client_id", oauthConfig.clientId);
  authUrl.searchParams.set("redirect_uri", oauthConfig.redirectUri);
  authUrl.searchParams.set("state", encodedState);

  let scopes = oauthConfig.scopes;
  if (scopes.length === 0 && definition.auth.type === "oauth2") {
    scopes = definition.auth.defaultScopes;
  }

  if (mcpServerUrl) {
    try {
      const discovered = await discoverMcpOAuth(mcpServerUrl);
      if (discovered.success && discovered.scopesSupported) {
        scopes = mergeScopes(scopes, discovered.scopesSupported);
      }
    } catch (e) {
      logger.warn("MCP scope discovery failed:", e);
      // Continue with original scopes
    }
  }

  if (additionalScopes && additionalScopes.length > 0) {
    scopes = mergeScopes(scopes, additionalScopes);
  }

  authUrl.searchParams.set("scope", scopes.join(" "));

  if (definition.auth.type === "oauth2" && definition.auth.handlers?.customizeAuthorizationUrl) {
    definition.auth.handlers.customizeAuthorizationUrl(authUrl);
  }

  return {
    url: authUrl.toString(),
    state: encodedState,
  };
};

const exchangeCodeForToken = async (
  integrationId: string,
  organizationId: string,
  code: string
): Promise<OAuthTokenResponse> => {
  // Support both org-specific and global integrations
  const integration = await getIntegrationOrGlobal(integrationId, organizationId);
  if (!integration) {
    throw new Error("Integration not found");
  }

  const authConfig = integration.authConfig;

  // Extract OAuth config from either OAuth2 or MCP (bearer_passthrough) integrations
  const oauthConfig = extractOAuthConfig(authConfig);
  if (!oauthConfig) {
    throw new Error(
      `Integration uses ${authConfig.type} auth without OAuth configuration. Cannot exchange code for token.`
    );
  }

  const tokenParams = new URLSearchParams({
    client_id: oauthConfig.clientId,
    client_secret: oauthConfig.clientSecret,
    code,
    redirect_uri: oauthConfig.redirectUri,
  });

  const provider = integration.provider as IntegrationProvider;
  const definition = getProviderDefinition(provider);

  // Apply provider-specific customizations for OAuth2 providers
  if (definition.auth.type === "oauth2" && definition.auth.handlers?.customizeTokenExchange) {
    definition.auth.handlers.customizeTokenExchange(tokenParams);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (definition.auth.type === "oauth2" && definition.auth.handlers?.customizeTokenHeaders) {
    definition.auth.handlers.customizeTokenHeaders(headers);
  }

  const response = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers,
    body: tokenParams.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  const tokenData = await response.json();
  return tokenData as OAuthTokenResponse;
};

/**
 * Fetches the account identifier for OAuth2 providers with handlers.
 * Returns null if the provider doesn't support account identifier fetching.
 */
const tryFetchAccountIdentifier = async (
  provider: IntegrationProvider,
  accessToken: string
): Promise<string | null> => {
  const definition = getProviderDefinition(provider);

  if (definition.auth.type !== "oauth2") {
    // MCP and other non-OAuth2 providers don't have fetchAccountIdentifier
    return null;
  }

  if (!definition.auth.handlers?.fetchAccountIdentifier) {
    return null;
  }

  return definition.auth.handlers.fetchAccountIdentifier(accessToken);
};

export const handleOAuthCallback = async (params: {
  code: string;
  state: string;
}): Promise<{
  success: boolean;
  connectedAccountId?: string;
  error?: string;
  integrationId?: string;
  provider?: string;
}> => {
  try {
    const { code, state } = params;

    const stateData = decodeState(state);
    const now = Date.now();
    const timeDiff = now - stateData.timestamp;

    const TEN_MINUTES = 10 * 60 * 1000;
    if (timeDiff > TEN_MINUTES) {
      logger.error("State expired - time diff:", Math.floor(timeDiff / 1000), "seconds");
      return {
        success: false,
        error: "Authorization state expired. Please try again.",
      };
    }

    // Support both org-specific and global integrations
    const integration = await getIntegrationOrGlobal(
      stateData.integrationId,
      stateData.organizationId
    );

    if (!integration) {
      logger.error("Integration not found:", stateData.integrationId);
      return {
        success: false,
        error: "Integration not found",
      };
    }

    if (!integration.enabled) {
      logger.error("Integration disabled:", stateData.integrationId);
      return {
        success: false,
        error: "Integration is disabled",
      };
    }

    const tokenData = await exchangeCodeForToken(
      stateData.integrationId,
      stateData.organizationId,
      code
    );

    // Try to fetch account identifier from OAuth provider (only works for OAuth2 providers with handlers)
    // For MCP with bearer_passthrough, we use viewerId as the identifier
    const providerAccountIdentifier = await tryFetchAccountIdentifier(
      stateData.provider,
      tokenData.access_token
    );

    // For MCP integrations with bearer_passthrough, refresh_token may not be required
    // depending on the OAuth provider. Some providers (like GitHub) don't require refresh tokens.
    const isMcpIntegration = integration.authConfig.type === "mcp";
    if (!tokenData.refresh_token && !isMcpIntegration) {
      return {
        success: false,
        error: "No refresh token received. Please ensure offline access is granted.",
      };
    }

    const currentTime = Date.now();
    const expiresAt = tokenData.expires_in
      ? currentTime + tokenData.expires_in * 1000
      : currentTime + 3600 * 1000;

    const credentials = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? "",
      expiresAt,
      tokenType: "Bearer" as const,
      scope: tokenData.scope,
      metadata: {
        obtainedAt: new Date().toISOString(),
        providerAccountIdentifier: providerAccountIdentifier ?? stateData.viewerId,
        isMcpBearerPassthrough: isMcpIntegration,
      },
    };

    // Create connected account using viewerId as the primary identifier
    const connectedAccount = await createConnectedAccount({
      integrationId: stateData.integrationId,
      viewerId: stateData.viewerId,
      organizationId: stateData.organizationId,
      credentials,
      accountIdentifier: providerAccountIdentifier ?? stateData.viewerId,
    });

    logger.info("Connected account created:", connectedAccount.id);

    return {
      success: true,
      connectedAccountId: connectedAccount.id,
      integrationId: stateData.integrationId,
      provider: stateData.provider,
    };
  } catch (error) {
    logger.error("Callback error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
