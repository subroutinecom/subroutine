import type { AuthStrategy, AuthBlock } from "../../packages/shared-types/integration";

/**
 * Shared authentication header building utilities.
 *
 * This module provides a unified implementation for building auth headers
 * across all integration types (MCP, GraphQL, OpenAPI).
 */

/** Convenience alias for consumers that relied on the string union */
export type AuthStrategyType = AuthStrategy["type"];

/**
 * Options for building auth headers.
 */
export interface BuildAuthHeadersOptions {
  /** API key for api_key strategy (org-level) */
  apiKey?: string;
  /** Access token for bearer_oauth or viewer-scoped api_key */
  accessToken?: string;
  /** If true, throws error when required credentials are missing. Default: false */
  throwOnMissing?: boolean;
}

/**
 * Builds authentication headers based on the auth strategy.
 *
 * This is the single source of truth for auth header generation across:
 * - MCP integrations
 * - GraphQL integrations
 * - OpenAPI integrations
 * - Sandbox run configuration
 * - Agent tools
 *
 * @param strategy - The authentication strategy configuration
 * @param options - Options including API key and access token
 * @returns Record of header name to header value
 *
 * @example
 * ```typescript
 * // No auth
 * buildAuthHeaders({ type: "none" }) // => {}
 *
 * // API key in custom header
 * buildAuthHeaders(
 *   { type: "api_key", headerName: "X-API-Key" },
 *   { apiKey: "secret" }
 * ) // => { "X-API-Key": "secret" }
 *
 * // API key in Authorization header (formatted as Bearer)
 * buildAuthHeaders(
 *   { type: "api_key" },
 *   { apiKey: "secret" }
 * ) // => { "Authorization": "Bearer secret" }
 *
 * // Bearer OAuth
 * buildAuthHeaders(
 *   { type: "bearer_oauth" },
 *   { accessToken: "token" }
 * ) // => { "Authorization": "Bearer token" }
 *
 * // Custom headers
 * buildAuthHeaders(
 *   { type: "custom_headers", headers: { "X-Custom": "value" } }
 * ) // => { "X-Custom": "value" }
 * ```
 */
export const buildAuthHeaders = (
  strategy: AuthStrategy,
  options: BuildAuthHeadersOptions = {}
): Record<string, string> => {
  const { apiKey, accessToken, throwOnMissing = false } = options;
  const headers: Record<string, string> = {};

  switch (strategy.type) {
    case "none":
      // No auth headers needed
      break;

    case "api_key": {
      // Determine which key to use based on viewerScoped flag
      const key = strategy.viewerScoped ? accessToken : apiKey;

      if (!key) {
        if (throwOnMissing) {
          const keyType = strategy.viewerScoped ? "access token" : "API key";
          throw new Error(`${keyType} is required for api_key auth strategy`);
        }
        break;
      }

      const headerName = strategy.headerName ?? "Authorization";

      // If using Authorization header, format as Bearer token
      if (headerName.toLowerCase() === "authorization") {
        headers[headerName] = `Bearer ${key}`;
      } else {
        headers[headerName] = key;
      }
      break;
    }

    case "bearer_oauth": {
      if (!accessToken) {
        if (throwOnMissing) {
          throw new Error("Access token is required for bearer_oauth auth strategy");
        }
        break;
      }
      headers["Authorization"] = `Bearer ${accessToken}`;
      break;
    }

    case "custom_headers": {
      if (strategy.headers) {
        Object.assign(headers, strategy.headers);
      }
      break;
    }
  }

  return headers;
};

/**
 * Builds auth headers from an AuthBlock (used in integration configs).
 *
 * This is a convenience wrapper for configs that use the AuthBlock structure
 * with nested strategy and apiKey fields.
 *
 * @param auth - The auth block from integration config
 * @param accessToken - Optional access token for viewer-scoped auth
 * @returns Record of header name to header value
 */
export const buildAuthHeadersFromBlock = (
  auth: AuthBlock,
  accessToken?: string
): Record<string, string> => {
  return buildAuthHeaders(auth.strategy, {
    apiKey: auth.apiKey,
    accessToken,
  });
};
