import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { print } from "graphql";
import { GraphQLClient as GqlClient, type RequestDocument } from "graphql-request";
import type { SandboxGraphQLConfig } from "../../types.ts";
import type { ValidationError } from "./validate.ts";
import { validateOperationCached } from "./validate.ts";

export interface GraphQLClientOptions {
  /** Connection timeout in milliseconds (not yet supported, reserved for future use) */
  timeoutMs?: number;
  /**
   * Validate operations against the schema before sending.
   * Requires a schema to be present in the config.
   * Default: true if schema is present, false otherwise.
   */
  validateBeforeRequest?: boolean;
}

/**
 * Error thrown when a GraphQL operation fails schema validation.
 */
export class GraphQLValidationError extends Error {
  readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const messages = errors.map((e) => {
      let msg = e.message;
      if (e.line !== undefined) {
        msg += ` (line ${e.line}${e.column !== undefined ? `, column ${e.column}` : ""})`;
      }
      return msg;
    });

    super(`GraphQL validation failed:\n${messages.map((m) => `  - ${m}`).join("\n")}`);
    this.name = "GraphQLValidationError";
    this.errors = errors;
  }
}

/**
 * GraphQL client for executing queries and mutations.
 *
 * Supports both string queries and TypedDocumentNode for type-safe queries.
 * When using TypedDocumentNode (from graphql-codegen), queries are fully typed.
 */
export interface GraphQLClient {
  /**
   * Execute a GraphQL operation with a TypedDocumentNode (type-safe).
   *
   * @example
   * ```typescript
   * // With generated types from graphql-codegen:
   * const data = await client.request(GetUsersDocument, { limit: 10 });
   * // data is fully typed!
   * ```
   */
  request<TData, TVariables extends Record<string, unknown>>(
    document: TypedDocumentNode<TData, TVariables>,
    variables?: TVariables
  ): Promise<TData>;

  /**
   * Execute a GraphQL operation with a string query (untyped).
   *
   * @example
   * ```typescript
   * const data = await client.request(`
   *   query GetUsers($limit: Int!) {
   *     users(limit: $limit) { id name }
   *   }
   * `, { limit: 10 });
   * ```
   */
  request<TData = unknown, TVariables extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    variables?: TVariables
  ): Promise<TData>;
}

/**
 * Creates a GraphQL client for the specified endpoint.
 *
 * @param config - GraphQL configuration including endpoint, auth headers, and optional schema
 * @param options - Optional client configuration
 * @returns GraphQL client
 *
 * @example
 * ```typescript
 * // Basic usage
 * const client = createGraphQLClient(config);
 * const data = await client.request(query);
 *
 * // With validation (requires schema in config)
 * const client = createGraphQLClient(config, { validateBeforeRequest: true });
 * // This will throw GraphQLValidationError if the operation is invalid
 * const data = await client.request(query);
 * ```
 */
export const createGraphQLClient = (
  config: SandboxGraphQLConfig,
  options?: GraphQLClientOptions
): GraphQLClient => {
  const client = new GqlClient(config.endpoint, {
    headers: config.authHeaders,
  });

  // Determine if we should validate
  // Default: validate if schema is present
  const shouldValidate = options?.validateBeforeRequest ?? Boolean(config.schema);
  const schema = config.schema;

  return {
    request: async <TData, TVariables extends Record<string, unknown>>(
      documentOrQuery: TypedDocumentNode<TData, TVariables> | string,
      variables?: TVariables
    ): Promise<TData> => {
      // Validate if enabled and schema is available
      if (shouldValidate && schema) {
        // Convert TypedDocumentNode to string if needed
        const operationString =
          typeof documentOrQuery === "string" ? documentOrQuery : print(documentOrQuery);

        const validationResult = await validateOperationCached(schema, operationString);

        if (!validationResult.valid) {
          throw new GraphQLValidationError(validationResult.errors);
        }
      }

      return client.request<TData>(
        documentOrQuery as RequestDocument,
        variables as Record<string, unknown>
      );
    },
  };
};
