/**
 * OpenAPI spec introspection utilities.
 *
 * Fetches, parses, and dereferences OpenAPI 3.x specs from URLs or validates uploaded specs.
 * Uses @apidevtools/swagger-parser for proper $ref resolution.
 */

import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import { parse as parseYaml } from "yaml";
import {
  validateExternalUrl,
  isValidSpecContentType,
  MAX_FETCH_SIZE_BYTES,
  DEFAULT_FETCH_TIMEOUT_MS,
} from "./url-validation";

export interface OpenAPIOperation {
  operationId?: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
}

export interface OpenAPIIntrospectionResult {
  /** The spec as JSON string (dereferenced - all $refs resolved) */
  spec: string;
  /** Detected OpenAPI version */
  version: "3.0" | "3.1";
  /** API title from the spec */
  title?: string;
  /** API description from the spec */
  description?: string;
  /** Base URL from servers[0] */
  baseUrl?: string;
  /** List of available operations */
  operations: OpenAPIOperation[];
  /** Timestamp when fetched */
  fetchedAt: number;
}

export interface OpenAPIIntrospectionError {
  message: string;
  code:
    | "NETWORK_ERROR"
    | "INVALID_SPEC"
    | "PARSE_ERROR"
    | "UNSUPPORTED_VERSION"
    | "INVALID_URL"
    | "SPEC_TOO_LARGE"
    | "INVALID_CONTENT_TYPE"
    | "DEREFERENCE_ERROR";
}

type OpenAPIDocument = OpenAPIV3.Document | OpenAPIV3_1.Document;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

/**
 * Detect the OpenAPI version from the spec.
 */
const detectVersion = (spec: OpenAPI.Document): "3.0" | "3.1" | null => {
  if ("openapi" in spec && typeof spec.openapi === "string") {
    if (spec.openapi.startsWith("3.0")) {
      return "3.0";
    }
    if (spec.openapi.startsWith("3.1")) {
      return "3.1";
    }
  }
  // Swagger 2.0 is not supported
  return null;
};

/**
 * Extract operations from the dereferenced OpenAPI spec.
 * Since the spec is dereferenced, all $refs are already resolved.
 */
const extractOperations = (spec: OpenAPIDocument): OpenAPIOperation[] => {
  const operations: OpenAPIOperation[] = [];

  if (!spec.paths) {
    return operations;
  }

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem) continue;

    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIV3.OperationObject
        | OpenAPIV3_1.OperationObject
        | undefined;
      if (operation && typeof operation === "object" && !("$ref" in operation)) {
        operations.push({
          operationId: operation.operationId,
          method: method.toUpperCase(),
          path,
          summary: operation.summary,
          description: operation.description,
          tags: operation.tags,
        });
      }
    }
  }

  return operations;
};

/**
 * Parse a spec string (JSON or YAML) into an object.
 */
const parseSpecContent = (
  content: string
): { ok: true; spec: unknown } | { ok: false; error: string } => {
  try {
    const parsed = JSON.parse(content);
    return { ok: true, spec: parsed };
  } catch {
    // Not valid JSON, try YAML
  }

  try {
    const parsed = parseYaml(content);
    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, error: "YAML parsed to non-object value" };
    }
    return { ok: true, spec: parsed };
  } catch (e) {
    return {
      ok: false,
      error: `Failed to parse as JSON or YAML: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
};

/**
 * Dereference an OpenAPI spec using swagger-parser.
 * This resolves all $ref pointers including:
 * - Internal references (#/components/schemas/User)
 * - Circular references
 * - Nested references
 */
const dereferenceSpec = async (
  spec: unknown
): Promise<
  { ok: true; spec: OpenAPIDocument } | { ok: false; error: OpenAPIIntrospectionError }
> => {
  try {
    const dereferenced = (await SwaggerParser.dereference(
      spec as OpenAPI.Document
    )) as OpenAPIDocument;
    return { ok: true, spec: dereferenced };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    if (message.includes("not a valid Swagger") || message.includes("not a valid OpenAPI")) {
      return {
        ok: false,
        error: {
          message: `Invalid OpenAPI specification: ${message}`,
          code: "INVALID_SPEC",
        },
      };
    }

    return {
      ok: false,
      error: {
        message: `Failed to dereference spec: ${message}`,
        code: "DEREFERENCE_ERROR",
      },
    };
  }
};

/**
 * Validate and process a dereferenced OpenAPI spec.
 */
const processSpec = (
  spec: OpenAPIDocument,
  fetchedAt: number
): { ok: true; result: OpenAPIIntrospectionResult } | { ok: false; error: OpenAPIIntrospectionError } => {
  const version = detectVersion(spec);
  if (!version) {
    if ("swagger" in spec) {
      return {
        ok: false,
        error: {
          message: `Swagger ${(spec as { swagger?: string }).swagger} is not supported. Please use OpenAPI 3.0 or 3.1.`,
          code: "UNSUPPORTED_VERSION",
        },
      };
    }
    return {
      ok: false,
      error: {
        message:
          "Could not detect OpenAPI version. Expected 'openapi' field with value starting with '3.0' or '3.1'.",
        code: "INVALID_SPEC",
      },
    };
  }

  const operations = extractOperations(spec);

  const baseUrl = spec.servers?.[0]?.url;

  return {
    ok: true,
    result: {
      spec: JSON.stringify(spec),
      version,
      title: spec.info?.title,
      description: spec.info?.description,
      baseUrl,
      operations,
      fetchedAt,
    },
  };
};

/**
 * Options for fetching OpenAPI specs.
 */
export interface FetchOpenAPISpecOptions {
  /** Headers to include in the request (e.g., for auth) */
  headers?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/**
 * Fetch, parse, and dereference an OpenAPI spec from a URL.
 *
 * @param specUrl - The URL to fetch the OpenAPI spec from
 * @param headersOrOptions - Headers or options for the request
 * @returns The parsed and dereferenced spec with operations list, or an error
 */
export const fetchOpenAPISpec = async (
  specUrl: string,
  headersOrOptions: Record<string, string> | FetchOpenAPISpecOptions = {}
): Promise<
  { ok: true; result: OpenAPIIntrospectionResult } | { ok: false; error: OpenAPIIntrospectionError }
> => {
  const fetchedAt = Date.now();

  const urlValidation = validateExternalUrl(specUrl);
  if (!urlValidation.valid) {
    return {
      ok: false,
      error: {
        message: urlValidation.error ?? "Invalid URL",
        code: "INVALID_URL",
      },
    };
  }

  const isOptionsObject = (obj: unknown): obj is FetchOpenAPISpecOptions =>
    typeof obj === "object" && obj !== null && ("headers" in obj || "timeoutMs" in obj);

  const options: FetchOpenAPISpecOptions = isOptionsObject(headersOrOptions)
    ? headersOrOptions
    : { headers: headersOrOptions as Record<string, string> };

  const { headers = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(specUrl, {
      method: "GET",
      headers: {
        Accept: "application/json, application/yaml, application/x-yaml, text/yaml, text/x-yaml, */*",
        ...headers,
      },
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

    const contentType = response.headers.get("content-type");
    if (!isValidSpecContentType(contentType)) {
      return {
        ok: false,
        error: {
          message: `Invalid content type: ${contentType}. Expected JSON or YAML.`,
          code: "INVALID_CONTENT_TYPE",
        },
      };
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_FETCH_SIZE_BYTES) {
      return {
        ok: false,
        error: {
          message: `Spec size exceeds maximum allowed (${MAX_FETCH_SIZE_BYTES / 1024 / 1024}MB)`,
          code: "SPEC_TOO_LARGE",
        },
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        ok: false,
        error: {
          message: "Failed to read response body",
          code: "NETWORK_ERROR",
        },
      };
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > MAX_FETCH_SIZE_BYTES) {
        reader.cancel();
        return {
          ok: false,
          error: {
            message: `Spec size exceeds maximum allowed (${MAX_FETCH_SIZE_BYTES / 1024 / 1024}MB)`,
            code: "SPEC_TOO_LARGE",
          },
        };
      }

      chunks.push(value);
    }

    const buffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    const content = new TextDecoder().decode(buffer);

    const parseResult = parseSpecContent(content);
    if (!parseResult.ok) {
      return {
        ok: false,
        error: {
          message: parseResult.error,
          code: "PARSE_ERROR",
        },
      };
    }

    const derefResult = await dereferenceSpec(parseResult.spec);
    if (!derefResult.ok) {
      return derefResult;
    }

    return processSpec(derefResult.spec, fetchedAt);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: {
          message: `Request timeout after ${timeoutMs}ms`,
          code: "NETWORK_ERROR",
        },
      };
    }

    const rawMessage = err instanceof Error ? err.message : String(err);
    const message =
      rawMessage.includes("ECONNREFUSED") ||
      rawMessage.includes("ENOTFOUND") ||
      rawMessage.includes("getaddrinfo")
        ? "Failed to connect to the specified URL"
        : rawMessage;

    return {
      ok: false,
      error: {
        message,
        code: "NETWORK_ERROR",
      },
    };
  }
};

/**
 * Parse, validate, and dereference an OpenAPI spec from a string.
 * Use this for directly uploaded spec content.
 *
 * @param specContent - The OpenAPI spec as a string (JSON or YAML)
 * @returns The parsed and dereferenced spec with operations list, or an error
 */
export const parseOpenAPISpec = async (
  specContent: string
): Promise<
  { ok: true; result: OpenAPIIntrospectionResult } | { ok: false; error: OpenAPIIntrospectionError }
> => {
  const fetchedAt = Date.now();

  const parseResult = parseSpecContent(specContent);
  if (!parseResult.ok) {
    return {
      ok: false,
      error: {
        message: parseResult.error,
        code: "PARSE_ERROR",
      },
    };
  }

  const derefResult = await dereferenceSpec(parseResult.spec);
  if (!derefResult.ok) {
    return derefResult;
  }

  return processSpec(derefResult.spec, fetchedAt);
};
