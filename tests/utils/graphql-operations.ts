/**
 * GraphQL operations for API Key testing
 * Types and operations are auto-generated via graphql-codegen
 * Run `deno task codegen` to regenerate
 */

// Export all generated types and operations
export type {
  ApiKey,
  CreatedApiKey,
  ListApiKeysQuery,
  ListApiKeysQueryVariables,
  GetApiKeyQuery,
  GetApiKeyQueryVariables,
  CreateApiKeyMutation,
  CreateApiKeyMutationVariables,
  UpdateApiKeyMutation,
  UpdateApiKeyMutationVariables,
  DeleteApiKeyMutation,
  DeleteApiKeyMutationVariables,
} from "../generated/graphql";

export {
  ListApiKeysDocument,
  GetApiKeyDocument,
  CreateApiKeyDocument,
  UpdateApiKeyDocument,
  DeleteApiKeyDocument,
} from "../generated/graphql";

// Re-export with legacy names for backward compatibility
export type {
  ListApiKeysQuery as ListApiKeysResponse,
  GetApiKeyQuery as GetApiKeyResponse,
  CreateApiKeyMutation as CreateApiKeyResponse,
  UpdateApiKeyMutation as UpdateApiKeyResponse,
  DeleteApiKeyMutation as DeleteApiKeyResponse,
} from "../generated/graphql";

// Legacy string queries (deprecated - use typed documents instead)
export const LIST_API_KEYS = `
  query ListApiKeys {
    apiKeys {
      id
      name
      start
      prefix
      organizationId
      enabled
      expiresAt
      permissions
      metadata
      createdAt
      updatedAt
    }
  }
`;

export const GET_API_KEY = `
  query GetApiKey($id: String!) {
    apiKey(id: $id) {
      id
      name
      start
      prefix
      organizationId
      enabled
      expiresAt
      permissions
      metadata
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_API_KEY = `
  mutation CreateApiKey($name: String, $prefix: String, $metadata: String) {
    createApiKey(name: $name, prefix: $prefix, metadata: $metadata) {
      id
      name
      start
      prefix
      key
      organizationId
      enabled
      expiresAt
      permissions
      metadata
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_API_KEY = `
  mutation UpdateApiKey($id: String!, $name: String, $metadata: String) {
    updateApiKey(id: $id, name: $name, metadata: $metadata) {
      id
      name
      start
      prefix
      organizationId
      enabled
      expiresAt
      permissions
      metadata
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_API_KEY = `
  mutation DeleteApiKey($id: String!) {
    deleteApiKey(id: $id)
  }
`;
