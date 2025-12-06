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

export interface IntrospectionResult {
  /** The schema in SDL format */
  schema: string;
  /** Timestamp when the schema was fetched */
  fetchedAt: number;
}

export interface IntrospectionError {
  message: string;
  code: "NETWORK_ERROR" | "INTROSPECTION_DISABLED" | "INVALID_RESPONSE" | "PARSE_ERROR";
}

/**
 * Introspect a GraphQL endpoint and return the schema as SDL.
 *
 * @param endpoint - The GraphQL endpoint URL
 * @param headers - Optional auth headers to include in the request
 * @returns The schema SDL and fetch timestamp, or an error
 */
export const introspectSchema = async (
  endpoint: string,
  headers: Record<string, string> = {}
): Promise<{ ok: true; result: IntrospectionResult } | { ok: false; error: IntrospectionError }> => {
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
    });

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
    // Network errors, JSON parse errors, etc.
    const message = err instanceof Error ? err.message : String(err);

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

