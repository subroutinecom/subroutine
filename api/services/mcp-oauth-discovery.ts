/**
 * MCP OAuth Discovery Service
 *
 * Implements RFC 9728 (OAuth 2.0 Protected Resource Metadata) and
 * RFC 8414 (OAuth 2.0 Authorization Server Metadata) discovery for MCP servers.
 *
 * This allows auto-discovery of OAuth configuration from just an MCP server URL.
 */

import { z } from "zod";

/**
 * RFC 9728 OAuth 2.0 Protected Resource Metadata
 */
const ProtectedResourceMetadataSchema = z.object({
  resource: z.string().url(),
  authorization_servers: z.array(z.string().url()).optional(),
  scopes_supported: z.array(z.string()).optional(),
  bearer_methods_supported: z.array(z.string()).optional(),
  resource_name: z.string().optional(),
  resource_documentation: z.string().url().optional(),
});

export type ProtectedResourceMetadata = z.infer<typeof ProtectedResourceMetadataSchema>;

/**
 * RFC 8414 OAuth 2.0 Authorization Server Metadata
 */
const AuthorizationServerMetadataSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  registration_endpoint: z.string().url().optional(),
  scopes_supported: z.array(z.string()).optional(),
  response_types_supported: z.array(z.string()).optional(),
  grant_types_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
});

export type AuthorizationServerMetadata = z.infer<typeof AuthorizationServerMetadataSchema>;

/**
 * Combined discovery result
 */
export interface McpOAuthDiscoveryResult {
  /** Whether discovery was successful */
  success: boolean;
  /** Human-readable server name if available */
  serverName?: string;
  /** The authorization server URL */
  authorizationServer?: string;
  /** OAuth authorization endpoint */
  authorizationEndpoint?: string;
  /** OAuth token endpoint */
  tokenEndpoint?: string;
  /** Dynamic client registration endpoint (if supported) */
  registrationEndpoint?: string;
  /** Supported OAuth scopes */
  scopesSupported?: string[];
  /** Whether PKCE is supported */
  pkceSupported?: boolean;
  /** Supported PKCE methods */
  pkceMethodsSupported?: string[];
  /** Whether dynamic client registration is supported */
  dynamicRegistrationSupported?: boolean;
  /** Error message if discovery failed */
  error?: string;
  /** Raw protected resource metadata */
  protectedResourceMetadata?: ProtectedResourceMetadata;
  /** Raw authorization server metadata */
  authorizationServerMetadata?: AuthorizationServerMetadata;
}

/**
 * Extracts resource_metadata URL from WWW-Authenticate header
 */
const extractResourceMetadataUrl = (wwwAuthenticate: string): string | null => {
  // Parse: Bearer error="...", resource_metadata="https://..."
  const match = wwwAuthenticate.match(/resource_metadata="([^"]+)"/);
  return match ? match[1] : null;
};

/**
 * Builds the well-known URL for protected resource metadata
 */
const buildProtectedResourceMetadataUrl = (serverUrl: string): string[] => {
  const url = new URL(serverUrl);
  const pathname = url.pathname.replace(/\/$/, ""); // Remove trailing slash

  // Try path-specific first, then root
  const urls: string[] = [];

  if (pathname && pathname !== "/") {
    // Path-specific: /.well-known/oauth-protected-resource/path
    urls.push(`${url.origin}/.well-known/oauth-protected-resource${pathname}`);
  }

  // Root fallback: /.well-known/oauth-protected-resource
  urls.push(`${url.origin}/.well-known/oauth-protected-resource`);

  return urls;
};

/**
 * Builds the well-known URLs for authorization server metadata
 */
const buildAuthServerMetadataUrls = (authServerUrl: string): string[] => {
  const url = new URL(authServerUrl);
  const pathname = url.pathname.replace(/\/$/, "");

  const urls: string[] = [];

  if (pathname && pathname !== "/") {
    // Try RFC 8414 format first: /.well-known/oauth-authorization-server/path
    urls.push(`${url.origin}/.well-known/oauth-authorization-server${pathname}`);
    // Then OpenID Connect format
    urls.push(`${url.origin}/.well-known/openid-configuration${pathname}`);
    urls.push(`${url.origin}${pathname}/.well-known/openid-configuration`);
  }

  // Root fallbacks
  urls.push(`${url.origin}/.well-known/oauth-authorization-server`);
  urls.push(`${url.origin}/.well-known/openid-configuration`);

  return urls;
};

/**
 * Fetches protected resource metadata from an MCP server
 */
const fetchProtectedResourceMetadata = async (
  serverUrl: string,
  resourceMetadataUrl?: string
): Promise<ProtectedResourceMetadata | null> => {
  const urlsToTry = resourceMetadataUrl
    ? [resourceMetadataUrl]
    : buildProtectedResourceMetadataUrl(serverUrl);

  for (const url of urlsToTry) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = ProtectedResourceMetadataSchema.safeParse(data);
        if (parsed.success) {
          return parsed.data;
        }
      }
    } catch {
      // Try next URL
    }
  }

  return null;
};

/**
 * Fetches authorization server metadata
 */
const fetchAuthorizationServerMetadata = async (
  authServerUrl: string
): Promise<AuthorizationServerMetadata | null> => {
  const urlsToTry = buildAuthServerMetadataUrls(authServerUrl);

  for (const url of urlsToTry) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = AuthorizationServerMetadataSchema.safeParse(data);
        if (parsed.success) {
          return parsed.data;
        }
      }
    } catch {
      // Try next URL
    }
  }

  return null;
};

/**
 * Probes an MCP server to discover its OAuth configuration.
 *
 * The discovery flow:
 * 1. Make an unauthenticated request to the MCP server
 * 2. Parse WWW-Authenticate header for resource_metadata URL
 * 3. Fetch protected resource metadata (RFC 9728)
 * 4. Extract authorization server URL(s)
 * 5. Fetch authorization server metadata (RFC 8414)
 * 6. Return combined discovery result
 */
export const discoverMcpOAuth = async (serverUrl: string): Promise<McpOAuthDiscoveryResult> => {
  try {
    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(serverUrl);
    } catch {
      return {
        success: false,
        error: "Invalid server URL",
      };
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return {
        success: false,
        error: "Server URL must use HTTP or HTTPS",
      };
    }

    // Step 1: Probe the server with an unauthenticated request
    let resourceMetadataUrl: string | null = null;
    try {
      const probeResponse = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "subroutine-discovery", version: "1.0" },
          },
        }),
      });

      // Check for WWW-Authenticate header with resource_metadata
      const wwwAuth = probeResponse.headers.get("www-authenticate");
      if (wwwAuth) {
        resourceMetadataUrl = extractResourceMetadataUrl(wwwAuth);
      }
    } catch {
      // Server might not be reachable, but we can still try well-known endpoints
    }

    // Step 2: Fetch protected resource metadata
    const resourceMetadata = await fetchProtectedResourceMetadata(
      serverUrl,
      resourceMetadataUrl ?? undefined
    );

    if (!resourceMetadata) {
      return {
        success: false,
        error:
          "Server does not expose OAuth protected resource metadata. Manual configuration required.",
      };
    }

    // Step 3: Get authorization server URL
    const authServers = resourceMetadata.authorization_servers;
    if (!authServers || authServers.length === 0) {
      return {
        success: false,
        error: "No authorization servers found in protected resource metadata",
        protectedResourceMetadata: resourceMetadata,
      };
    }

    const primaryAuthServer = authServers[0];

    // Step 4: Fetch authorization server metadata
    const authServerMetadata = await fetchAuthorizationServerMetadata(primaryAuthServer);

    // Build result
    const result: McpOAuthDiscoveryResult = {
      success: true,
      serverName: resourceMetadata.resource_name,
      authorizationServer: primaryAuthServer,
      scopesSupported: resourceMetadata.scopes_supported,
      protectedResourceMetadata: resourceMetadata,
    };

    if (authServerMetadata) {
      result.authorizationEndpoint = authServerMetadata.authorization_endpoint;
      result.tokenEndpoint = authServerMetadata.token_endpoint;
      result.registrationEndpoint = authServerMetadata.registration_endpoint;
      result.dynamicRegistrationSupported = !!authServerMetadata.registration_endpoint;

      // Merge scopes (prefer auth server if available)
      if (authServerMetadata.scopes_supported) {
        result.scopesSupported = authServerMetadata.scopes_supported;
      }

      // Check PKCE support
      const pkceMethods = authServerMetadata.code_challenge_methods_supported;
      result.pkceSupported = !!pkceMethods && pkceMethods.length > 0;
      result.pkceMethodsSupported = pkceMethods;

      result.authorizationServerMetadata = authServerMetadata;
    } else {
      // Fallback: construct default endpoints from auth server URL
      const authUrl = new URL(primaryAuthServer);

      // GitHub-style defaults
      if (authUrl.hostname === "github.com" || authUrl.pathname.includes("/login/oauth")) {
        result.authorizationEndpoint = `${authUrl.origin}/login/oauth/authorize`;
        result.tokenEndpoint = `${authUrl.origin}/login/oauth/access_token`;
      } else {
        // Generic defaults per MCP spec
        result.authorizationEndpoint = `${authUrl.origin}/authorize`;
        result.tokenEndpoint = `${authUrl.origin}/token`;
      }

      result.dynamicRegistrationSupported = false;
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during discovery",
    };
  }
};
