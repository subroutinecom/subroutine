import { getProviderDefinition, type IntegrationProvider } from "../integrations/providers.ts";
import type { OAuthTokenResponse } from "../integrations/providers/types.ts";
import { getIntegration, type IntegrationAuthConfig } from "../models/integration.ts";
import { createConnectedAccount } from "../models/connected-account.ts";

export interface OAuthState {
  integrationId: string;
  userId: string;
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
    console.error("[OAuth] Failed to decode state:", error);
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
    if (authConfig.authStrategy.type !== "bearer_passthrough" || !authConfig.oauthConfig) {
      return null;
    }
    return {
      clientId: authConfig.oauthConfig.clientId,
      clientSecret: authConfig.oauthConfig.clientSecret,
      authUrl: authConfig.oauthConfig.authUrl,
      tokenUrl: authConfig.oauthConfig.tokenUrl,
      redirectUri: authConfig.oauthConfig.redirectUri,
      scopes: authConfig.oauthConfig.scopes,
    };
  }

  return null;
};

export const generateAuthorizationUrl = async (params: {
  integrationId: string;
  userId: string;
  organizationId: string;
  viewerId: string;
}): Promise<{ url: string; state: string }> => {
  const { integrationId, userId, organizationId, viewerId } = params;

  const integration = await getIntegration(integrationId, organizationId);
  if (!integration) {
    throw new Error("Integration not found");
  }

  if (!integration.enabled) {
    throw new Error("Integration is disabled");
  }

  const authConfig = integration.authConfig;

  // Extract OAuth config from either OAuth2 or MCP (bearer_passthrough) integrations
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
    userId,
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

  // Use scopes from the integration config, fall back to provider defaults for OAuth2 providers
  let scopes = oauthConfig.scopes;
  if (scopes.length === 0 && definition.auth.type === "oauth2") {
    scopes = definition.auth.defaultScopes;
  }
  authUrl.searchParams.set("scope", scopes.join(" "));

  // Apply provider-specific customizations for OAuth2 providers
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
  const integration = await getIntegration(integrationId, organizationId);
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
      console.error("[OAuth] State expired - time diff:", Math.floor(timeDiff / 1000), "seconds");
      return {
        success: false,
        error: "Authorization state expired. Please try again.",
      };
    }

    const integration = await getIntegration(stateData.integrationId, stateData.organizationId);

    if (!integration) {
      console.error("[OAuth] Integration not found:", stateData.integrationId);
      return {
        success: false,
        error: "Integration not found",
      };
    }

    if (!integration.enabled) {
      console.error("[OAuth] Integration disabled:", stateData.integrationId);
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
        viewerId: stateData.viewerId,
        isMcpBearerPassthrough: isMcpIntegration,
      },
    };

    // Use viewerId as the account identifier for lookup (consistent across all integrations)
    const connectedAccount = await createConnectedAccount({
      integrationId: stateData.integrationId,
      userId: stateData.userId,
      organizationId: stateData.organizationId,
      credentials,
      accountIdentifier: stateData.viewerId,
    });

    console.log("[OAuth] Connected account created:", connectedAccount.id);

    return {
      success: true,
      connectedAccountId: connectedAccount.id,
      integrationId: stateData.integrationId,
      provider: stateData.provider,
    };
  } catch (error) {
    console.error("[OAuth] Callback error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
