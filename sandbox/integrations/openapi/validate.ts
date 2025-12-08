/**
 * OpenAPI request/response validation utilities.
 *
 * IMPORTANT: This module expects specs that have already been dereferenced
 * (all $ref pointers resolved) by the API layer using @apidevtools/swagger-parser.
 * The parseOpenAPISpec function here is a lightweight runtime parser that extracts
 * operations from the pre-dereferenced JSON spec for request validation.
 */

import type { OpenAPIOperation, OpenAPIParameter, ParsedOpenAPISpec, HttpMethod } from "./types";

export interface ValidationError {
  message: string;
  path?: string;
  parameter?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/**
 * Parse a pre-dereferenced OpenAPI spec JSON string into a structured format.
 *
 * This function expects the spec to already have all $refs resolved.
 * The API layer handles dereferencing using @apidevtools/swagger-parser
 * before storing/passing the spec to the sandbox.
 */
export const parseOpenAPISpec = (specJson: string): ParsedOpenAPISpec => {
  const spec = JSON.parse(specJson);
  const operations = new Map<string, OpenAPIOperation>();

  // Detect version
  let version: "3.0" | "3.1" = "3.0";
  if (spec.openapi?.startsWith("3.1")) {
    version = "3.1";
  }

  // Extract base URL
  const baseUrl = spec.servers?.[0]?.url;

  // Extract operations
  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const methodLower = method.toLowerCase();
        const operation = (pathItem as Record<string, unknown>)[methodLower];
        if (operation && typeof operation === "object") {
          const op = operation as {
            operationId?: string;
            summary?: string;
            description?: string;
            tags?: string[];
            parameters?: OpenAPIParameter[];
            requestBody?: { required?: boolean; content?: Record<string, { schema?: Record<string, unknown> }> };
            responses?: Record<string, { description?: string; content?: Record<string, { schema?: Record<string, unknown> }> }>;
          };

          // Merge path-level parameters with operation-level parameters
          const pathParams = (pathItem as { parameters?: OpenAPIParameter[] }).parameters ?? [];
          const opParams = op.parameters ?? [];
          const mergedParams = [...pathParams, ...opParams];

          const key = `${method}:${path}`;
          operations.set(key, {
            operationId: op.operationId,
            method,
            path,
            summary: op.summary,
            description: op.description,
            tags: op.tags,
            parameters: mergedParams.length > 0 ? mergedParams : undefined,
            requestBody: op.requestBody,
            responses: op.responses,
          });
        }
      }
    }
  }

  return {
    version,
    title: spec.info?.title,
    description: spec.info?.description,
    baseUrl,
    operations,
  };
};

/**
 * Extract path parameters from a path template.
 * e.g., "/users/{userId}/posts/{postId}" -> ["userId", "postId"]
 */
export const extractPathParams = (path: string): string[] => {
  const matches = path.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
};

/**
 * Validate request parameters against an operation's schema.
 */
export const validateRequest = (
  operation: OpenAPIOperation,
  params: Record<string, unknown> = {},
  body?: unknown
): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!operation.parameters) {
    // No parameters defined, just validate path params are provided
    const pathParams = extractPathParams(operation.path);
    for (const param of pathParams) {
      if (!(param in params)) {
        errors.push({
          message: `Missing required path parameter: ${param}`,
          parameter: param,
          path: operation.path,
        });
      }
    }
  } else {
    // Validate against defined parameters
    for (const param of operation.parameters) {
      const value = params[param.name];

      if (param.required && value === undefined) {
        errors.push({
          message: `Missing required ${param.in} parameter: ${param.name}`,
          parameter: param.name,
          path: operation.path,
        });
      }

      // Note: Type validation using param.schema could be added for stricter validation
    }
  }

  // Validate request body if defined
  if (operation.requestBody?.required && body === undefined) {
    errors.push({
      message: "Request body is required",
      path: operation.path,
    });
  }

  // Note: JSON Schema validation for request bodies could be added for stricter validation

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate a response against an operation's schema.
 */
export const validateResponse = (
  operation: OpenAPIOperation,
  statusCode: number,
  _body: unknown
): ValidationResult => {
  const errors: ValidationError[] = [];

  // Find the matching response schema
  const responses = operation.responses;
  if (!responses) {
    return { valid: true, errors: [] };
  }

  const statusStr = String(statusCode);
  const responseSchema = responses[statusStr] ?? responses["default"];

  if (!responseSchema) {
    // No schema defined for this status code
    return { valid: true, errors: [] };
  }

  // Note: JSON Schema validation for response bodies could be added for stricter validation

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Find an operation by method and path.
 */
export const findOperation = (
  spec: ParsedOpenAPISpec,
  method: string,
  path: string
): OpenAPIOperation | null => {
  const key = `${method.toUpperCase()}:${path}`;
  return spec.operations.get(key) ?? null;
};

/**
 * Get all operations from a parsed spec.
 */
export const getOperations = (spec: ParsedOpenAPISpec): OpenAPIOperation[] => {
  return Array.from(spec.operations.values());
};
