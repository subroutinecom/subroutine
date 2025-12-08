/**
 * GraphQL schema introspection utilities.
 *
 * Fetches and converts GraphQL schemas from remote endpoints via introspection.
 */

import {
  getIntrospectionQuery,
  buildClientSchema,
  printSchema,
  type IntrospectionQuery,
} from "graphql";
import {
  validateExternalUrl,
  DEFAULT_FETCH_TIMEOUT_MS,
} from "./url-validation";

export interface IntrospectionResult {
  /** The schema in SDL format */
  schema: string;
  /** Timestamp when the schema was fetched */
  fetchedAt: number;
}

export interface IntrospectionError {
  message: string;
  code: "NETWORK_ERROR" | "INTROSPECTION_DISABLED" | "INVALID_RESPONSE" | "PARSE_ERROR" | "INVALID_URL";
}

/**
 * Options for introspecting GraphQL schemas.
 */
export interface IntrospectSchemaOptions {
  /** Headers to include in the request (e.g., for auth) */
  headers?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/**
 * Introspect a GraphQL endpoint and return the schema as SDL.
 *
 * @param endpoint - The GraphQL endpoint URL
 * @param headersOrOptions - Headers or options for the request
 * @returns The schema SDL and fetch timestamp, or an error
 */
export const introspectSchema = async (
  endpoint: string,
  headersOrOptions: Record<string, string> | IntrospectSchemaOptions = {}
): Promise<{ ok: true; result: IntrospectionResult } | { ok: false; error: IntrospectionError }> => {
  // Validate URL to prevent SSRF attacks
  const urlValidation = validateExternalUrl(endpoint);
  if (!urlValidation.valid) {
    return {
      ok: false,
      error: {
        message: urlValidation.error ?? "Invalid URL",
        code: "INVALID_URL",
      },
    };
  }

  // Support both old signature (headers only) and new signature (options object)
  // If it has headers or timeoutMs keys, treat as options object, otherwise treat as headers
  const isOptionsObject = (obj: unknown): obj is IntrospectSchemaOptions =>
    typeof obj === "object" && obj !== null && ("headers" in obj || "timeoutMs" in obj);

  const options: IntrospectSchemaOptions = isOptionsObject(headersOrOptions)
    ? headersOrOptions
    : { headers: headersOrOptions as Record<string, string> };

  const { headers = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
      body: JSON.stringify({
        query: getIntrospectionQuery(),
        operationName: "IntrospectionQuery",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: {
          message: `HTTP ${response.status}: ${response.statusText}`,
          code: "NETWORK_ERROR",
        },
      };
    }

    const json = await response.json();

    // Check for GraphQL errors (introspection might be disabled)
    if (json.errors && json.errors.length > 0) {
      const errorMessages = json.errors.map((e: { message: string }) => e.message).join("; ");

      // Common patterns for disabled introspection
      const isDisabled =
        errorMessages.toLowerCase().includes("introspection") ||
        errorMessages.toLowerCase().includes("disabled") ||
        errorMessages.toLowerCase().includes("not allowed");

      return {
        ok: false,
        error: {
          message: errorMessages,
          code: isDisabled ? "INTROSPECTION_DISABLED" : "INVALID_RESPONSE",
        },
      };
    }

    if (!json.data || !json.data.__schema) {
      return {
        ok: false,
        error: {
          message: "Invalid introspection response: missing __schema",
          code: "INVALID_RESPONSE",
        },
      };
    }

    // Build the client schema from introspection result and convert to SDL
    const introspectionResult = json.data as IntrospectionQuery;
    const schema = buildClientSchema(introspectionResult);
    const sdl = printSchema(schema);

    return {
      ok: true,
      result: {
        schema: sdl,
        fetchedAt: Date.now(),
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);

    // Check for abort/timeout error
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: {
          message: `Request timeout after ${timeoutMs}ms`,
          code: "NETWORK_ERROR",
        },
      };
    }

    // Network errors, JSON parse errors, etc.
    const rawMessage = err instanceof Error ? err.message : String(err);

    // Sanitize error message to avoid leaking internal details
    const message = rawMessage.includes("ECONNREFUSED") ||
      rawMessage.includes("ENOTFOUND") ||
      rawMessage.includes("getaddrinfo")
      ? "Failed to connect to the specified URL"
      : rawMessage;

    // Determine error type
    let code: IntrospectionError["code"] = "NETWORK_ERROR";
    if (message.includes("JSON") || message.includes("parse")) {
      code = "PARSE_ERROR";
    }

    return {
      ok: false,
      error: {
        message,
        code,
      },
    };
  }
};

