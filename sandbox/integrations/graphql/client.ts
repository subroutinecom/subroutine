import { GraphQLClient as GqlClient, type RequestDocument } from "graphql-request";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import type { SandboxGraphQLConfig } from "../../types";

export interface GraphQLClientOptions {
  /** Connection timeout in milliseconds (not yet supported, reserved for future use) */
  timeoutMs?: number;
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
    variables?: TVariables,
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
    variables?: TVariables,
  ): Promise<TData>;
}

/**
 * Creates a GraphQL client for the specified endpoint.
 *
 * @param config - GraphQL configuration including endpoint and auth headers
 * @param _options - Optional client configuration (reserved for future use)
 * @returns GraphQL client
 */
export const createGraphQLClient = (
  config: SandboxGraphQLConfig,
  _options?: GraphQLClientOptions
): GraphQLClient => {
  const client = new GqlClient(config.endpoint, {
    headers: config.authHeaders,
  });

  return {
    request: async <TData, TVariables extends Record<string, unknown>>(
      documentOrQuery: TypedDocumentNode<TData, TVariables> | string,
      variables?: TVariables
    ): Promise<TData> => {
      return client.request<TData>(
        documentOrQuery as RequestDocument,
        variables as Record<string, unknown>
      );
    },
  };
};
