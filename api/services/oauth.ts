import { getProviderDefinition, type IntegrationProvider } from "../integrations/providers.ts";
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

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface GitHubUserInfo {
  login: string;
  id: number;
  email: string | null;
}

interface GoogleUserInfo {
  email: string;
  email_verified: boolean;
  name: string;
}

const encodeState = (state: OAuthState): string => {
  const stateString = JSON.stringify(state);
  return btoa(stateString);
};

const decodeState = (encoded: string): OAuthState => {
  try {
    const decoded = atob(encoded);
    return JSON.parse(decoded);
  } catch (_error) {
    throw new Error("Invalid state parameter");
  }
};

export const decodeAuthorizationState = (encoded: string): OAuthState => decodeState(encoded);

const generateNonce = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
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
  if (!authConfig.clientId || !authConfig.authUrl) {
    throw new Error(
      "Integration authConfig missing required OAuth fields (clientId, authUrl)",
    );
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

  const scopes = authConfig.scopes && authConfig.scopes.length > 0
    ? authConfig.scopes
    : definition.auth.defaultScopes;
  authUrl.searchParams.set("scope", scopes.join(" "));

  if (provider === "gmail") {
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
  }

  return {
    url: authUrl.toString(),
    state: encodedState,
  };
};

const exchangeCodeForToken = async (
  integrationId: string,
  organizationId: string,
  code: string,
): Promise<OAuthTokenResponse> => {
  const integration = await getIntegration(integrationId, organizationId);
  if (!integration) {
    throw new Error("Integration not found");
  }

  const authConfig = integration.authConfig;
  if (!authConfig.clientId || !authConfig.clientSecret || !authConfig.tokenUrl) {
    throw new Error(
      "Integration authConfig missing required fields for token exchange",
    );
  }

  const tokenParams = new URLSearchParams({
    client_id: authConfig.clientId,
    client_secret: authConfig.clientSecret,
    code,
    redirect_uri: authConfig.redirectUri,
  });

  const provider = integration.provider as IntegrationProvider;

  if (provider === "gmail") {
    tokenParams.set("grant_type", "authorization_code");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (provider === "github") {
    headers["Accept"] = "application/json";
  }

  const response = await fetch(authConfig.tokenUrl, {
    method: "POST",
    headers,
    body: tokenParams.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token exchange failed: ${response.status} - ${errorText}`,
    );
  }

  const tokenData = await response.json();
  return tokenData as OAuthTokenResponse;
};

const fetchAccountIdentifier = async (
  provider: IntegrationProvider,
  accessToken: string,
): Promise<string> => {
  if (provider === "gmail") {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to fetch Google user info");
    }

    const userInfo = await response.json() as GoogleUserInfo;
    return userInfo.email;
  } else if (provider === "github") {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch GitHub user info");
    }

    const userInfo = await response.json() as GitHubUserInfo;
    return userInfo.email || userInfo.login;
  }

  throw new Error(`Unsupported provider: ${provider}`);
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

    const TEN_MINUTES = 10 * 60 * 1000;
    if (Date.now() - stateData.timestamp > TEN_MINUTES) {
      return {
        success: false,
        error: "Authorization state expired. Please try again.",
      };
    }

    const integration = await getIntegration(
      stateData.integrationId,
      stateData.organizationId,
    );

    if (!integration) {
      return {
        success: false,
        error: "Integration not found",
      };
    }

    if (!integration.enabled) {
      return {
        success: false,
        error: "Integration is disabled",
      };
    }

    const tokenData = await exchangeCodeForToken(
      stateData.integrationId,
      stateData.organizationId,
      code,
    );

    const accountIdentifier = await fetchAccountIdentifier(
      stateData.provider,
      tokenData.access_token,
    );

    if (!tokenData.refresh_token) {
      return {
        success: false,
        error: "No refresh token received. Please ensure offline access is granted.",
      };
    }

    const now = Date.now();
    const expiresAt = tokenData.expires_in
      ? now + (tokenData.expires_in * 1000)
      : now + (3600 * 1000);

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
      accountIdentifier: stateData.viewerId ?? accountIdentifier,
    });

    return {
      success: true,
      connectedAccountId: connectedAccount.id,
      integrationId: stateData.integrationId,
      provider: stateData.provider,
    };
  } catch (error) {
    console.error("OAuth callback error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
