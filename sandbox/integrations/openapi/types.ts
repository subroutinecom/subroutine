/**
 * OpenAPI types for the sandbox client.
 */

/**
 * HTTP methods supported by OpenAPI.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * Parameter location in an OpenAPI operation.
 */
export type ParameterIn = "path" | "query" | "header" | "cookie";

/**
 * OpenAPI parameter definition.
 */
export interface OpenAPIParameter {
  name: string;
  in: ParameterIn;
  required?: boolean;
  schema?: Record<string, unknown>;
  description?: string;
}

/**
 * OpenAPI request body definition.
 */
export interface OpenAPIRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: Record<string, unknown> }>;
}

/**
 * OpenAPI response definition.
 */
export interface OpenAPIResponse {
  description?: string;
  content?: Record<string, { schema?: Record<string, unknown> }>;
}

/**
 * An operation in the OpenAPI spec.
 */
export interface OpenAPIOperation {
  operationId?: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
}

/**
 * Parsed OpenAPI spec structure.
 */
export interface ParsedOpenAPISpec {
  version: "3.0" | "3.1";
  title?: string;
  description?: string;
  baseUrl?: string;
  operations: Map<string, OpenAPIOperation>; // keyed by "METHOD:path"
}
