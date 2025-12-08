/**
 * OpenAPI client for making REST API calls.
 */

import type { SandboxOpenAPIConfig } from "../../types";
import type { OpenAPIOperation, ParsedOpenAPISpec } from "./types";
import {
  parseOpenAPISpec,
  extractPathParams,
  validateRequest,
  findOperation,
  getOperations,
} from "./validate";
import type { ValidationError } from "./validate";

export interface OpenAPIClientOptions {
  /** Validate requests against the spec before sending. Default: true if spec is present. */
  validateRequests?: boolean;
  /** Request timeout in milliseconds. Default: 30000 (30 seconds). */
  timeoutMs?: number;
}

/**
 * Error thrown when request validation fails.
 */
export class OpenAPIValidationError extends Error {
  readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const messages = errors.map((e) => {
      let msg = e.message;
      if (e.parameter) {
        msg += ` (parameter: ${e.parameter})`;
      }
      return msg;
    });

    super(`OpenAPI validation failed:\n${messages.map((m) => `  - ${m}`).join("\n")}`);
    this.name = "OpenAPIValidationError";
    this.errors = errors;
  }
}

/**
 * Error thrown when an operation is not found in the spec.
 */
export class OpenAPIOperationNotFoundError extends Error {
  readonly method: string;
  readonly path: string;

  constructor(method: string, path: string) {
    super(`Operation not found: ${method} ${path}`);
    this.name = "OpenAPIOperationNotFoundError";
    this.method = method;
    this.path = path;
  }
}

/**
 * OpenAPI client for making REST API calls.
 */
export interface OpenAPIClient {
  /**
   * Make an HTTP request to the API.
   *
   * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE, etc.)
   * @param path - API path with placeholders (e.g., "/users/{userId}")
   * @param params - Path and query parameters
   * @param body - Request body (for POST, PUT, PATCH)
   * @returns The response data
   *
   * @example
   * ```typescript
   * // GET request with path parameter
   * const user = await client.request("GET", "/users/{userId}", { userId: "123" });
   *
   * // GET request with query parameters
   * const users = await client.request("GET", "/users", { limit: 10, offset: 0 });
   *
   * // POST request with body
   * const newUser = await client.request("POST", "/users", {}, { name: "John", email: "john@example.com" });
   *
   * // PUT request with path param and body
   * const updated = await client.request("PUT", "/users/{userId}", { userId: "123" }, { name: "Jane" });
   * ```
   */
  request<T = unknown>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown
  ): Promise<T>;

  /**
   * Get all operations from the spec.
   */
  getOperations(): OpenAPIOperation[];

  /**
   * Get a specific operation by method and path.
   */
  getOperation(method: string, path: string): OpenAPIOperation | null;
}

/**
 * Build the URL with path parameters substituted.
 */
const buildUrl = (
  baseUrl: string,
  path: string,
  params: Record<string, unknown> = {}
): { url: string; remainingParams: Record<string, unknown> } => {
  const pathParamNames = extractPathParams(path);

  let resolvedPath = path;
  for (const name of pathParamNames) {
    const value = params[name];
    if (value !== undefined) {
      resolvedPath = resolvedPath.replace(`{${name}}`, encodeURIComponent(String(value)));
    }
  }

  const remainingParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!pathParamNames.includes(key) && value !== undefined) {
      remainingParams[key] = value;
    }
  }

  const queryParts: string[] = [];
  for (const [key, value] of Object.entries(remainingParams)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
      }
    } else {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const normalizedPath = resolvedPath.startsWith("/") ? resolvedPath : `/${resolvedPath}`;

  return {
    url: `${normalizedBaseUrl}${normalizedPath}${queryString}`,
    remainingParams,
  };
};

/**
 * Creates an OpenAPI client for the specified configuration.
 *
 * @param config - OpenAPI configuration including base URL, auth headers, and optional spec
 * @param options - Optional client configuration
 * @returns OpenAPI client
 */
export const createOpenAPIClient = (
  config: SandboxOpenAPIConfig,
  options?: OpenAPIClientOptions
): OpenAPIClient => {
  let parsedSpec: ParsedOpenAPISpec | null = null;
  if (config.spec) {
    try {
      parsedSpec = parseOpenAPISpec(config.spec);
    } catch (e) {
      console.warn(`Failed to parse OpenAPI spec: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const shouldValidate = options?.validateRequests ?? Boolean(parsedSpec);
  const timeoutMs = options?.timeoutMs ?? 30000;

  return {
    request: async <T = unknown>(
      method: string,
      path: string,
      params?: Record<string, unknown>,
      body?: unknown
    ): Promise<T> => {
      const normalizedMethod = method.toUpperCase();

      if (shouldValidate && parsedSpec) {
        const operation = findOperation(parsedSpec, normalizedMethod, path);

        if (!operation) {
          throw new OpenAPIOperationNotFoundError(normalizedMethod, path);
        }

        const validationResult = validateRequest(operation, params, body);
        if (!validationResult.valid) {
          throw new OpenAPIValidationError(validationResult.errors);
        }
      }

      const { url } = buildUrl(config.baseUrl, path, params);

      const requestOptions: RequestInit = {
        method: normalizedMethod,
        headers: {
          ...config.authHeaders,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      };

      if (body !== undefined && ["POST", "PUT", "PATCH"].includes(normalizedMethod)) {
        requestOptions.body = JSON.stringify(body);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      requestOptions.signal = controller.signal;

      try {
        const response = await fetch(url, requestOptions);
        clearTimeout(timeoutId);

        const contentType = response.headers.get("content-type");
        let data: unknown;

        if (contentType?.includes("application/json")) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          (error as Error & { status: number; data: unknown }).status = response.status;
          (error as Error & { status: number; data: unknown }).data = data;
          throw error;
        }

        return data as T;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Request timeout after ${timeoutMs}ms`);
        }

        throw error;
      }
    },

    getOperations: (): OpenAPIOperation[] => {
      if (!parsedSpec) {
        return [];
      }
      return getOperations(parsedSpec);
    },

    getOperation: (method: string, path: string): OpenAPIOperation | null => {
      if (!parsedSpec) {
        return null;
      }
      return findOperation(parsedSpec, method, path);
    },
  };
};
