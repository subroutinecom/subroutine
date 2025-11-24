import { getProviderDefinition, type IntegrationProvider } from "../integrations/providers.ts";
import type { OAuthTokenResponse } from "../integrations/providers/types.ts";
import { getIntegration } from "../models/integration.ts";
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

  // OAuth service only handles OAuth2 integrations
  if (authConfig.type !== "oauth2") {
    throw new Error(
      `Integration ${integration.name} uses ${authConfig.type} auth, not OAuth2. Cannot generate authorization URL.`
    );
  }

  if (!authConfig.clientId || !authConfig.authUrl) {
    throw new Error("Integration authConfig missing required OAuth fields (clientId, authUrl)");
  }

  const provider = integration.provider as IntegrationProvider;
  const definition = getProviderDefinition(provider);
  if (definition.auth.type !== "oauth2") {
    throw new Error(`Provider ${provider} does not support OAuth2 authorization`);
  }

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
  const redirectUri = authConfig.redirectUri;

  const authUrl = new URL(authConfig.authUrl);
  authUrl.searchParams.set("client_id", authConfig.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", encodedState);

  const scopes =
    authConfig.scopes && authConfig.scopes.length > 0
      ? authConfig.scopes
      : definition.auth.defaultScopes;
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
  const integration = await getIntegration(integrationId, organizationId);
  if (!integration) {
    throw new Error("Integration not found");
  }

  const authConfig = integration.authConfig;

  // Token exchange only works for OAuth2 integrations
  if (authConfig.type !== "oauth2") {
    throw new Error(
      `Integration uses ${authConfig.type} auth, not OAuth2. Cannot exchange code for token.`
    );
  }

  if (!authConfig.clientId || !authConfig.clientSecret || !authConfig.tokenUrl) {
    throw new Error("Integration authConfig missing required fields for token exchange");
  }

  const tokenParams = new URLSearchParams({
    client_id: authConfig.clientId,
    client_secret: authConfig.clientSecret,
    code,
    redirect_uri: authConfig.redirectUri,
  });

  const provider = integration.provider as IntegrationProvider;
  const definition = getProviderDefinition(provider);

  if (definition.auth.type === "oauth2" && definition.auth.handlers?.customizeTokenExchange) {
    definition.auth.handlers.customizeTokenExchange(tokenParams);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (definition.auth.type === "oauth2" && definition.auth.handlers?.customizeTokenHeaders) {
    definition.auth.handlers.customizeTokenHeaders(headers);
  }

  const response = await fetch(authConfig.tokenUrl, {
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

const fetchAccountIdentifier = async (
  provider: IntegrationProvider,
  accessToken: string
): Promise<string> => {
  const definition = getProviderDefinition(provider);

  if (definition.auth.type !== "oauth2") {
    throw new Error(`Provider ${provider} does not support OAuth2`);
  }

  if (!definition.auth.handlers?.fetchAccountIdentifier) {
    throw new Error(`Provider ${provider} does not define fetchAccountIdentifier handler`);
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

    const accountIdentifier = await fetchAccountIdentifier(
      stateData.provider,
      tokenData.access_token
    );

    if (!tokenData.refresh_token) {
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
      refreshToken: tokenData.refresh_token,
      expiresAt,
      tokenType: "Bearer" as const,
      scope: tokenData.scope,
      metadata: {
        obtainedAt: new Date().toISOString(),
        providerAccountIdentifier: accountIdentifier,
        viewerId: stateData.viewerId,
      },
    };

    const connectedAccount = await createConnectedAccount({
      integrationId: stateData.integrationId,
      userId: stateData.userId,
      organizationId: stateData.organizationId,
      credentials,
      accountIdentifier: stateData.viewerId ?? accountIdentifier, // Use viewerId for lookup
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
