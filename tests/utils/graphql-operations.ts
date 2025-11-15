/**
 * Type-safe GraphQL operations for API Key testing
 * This provides a lightweight alternative to full codegen
 */

export type ApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  organizationId: string;
  enabled: boolean | null;
  expiresAt: string | null;
  permissions: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatedApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  key: string; // Full key only available on creation
  organizationId: string;
  enabled: boolean | null;
  expiresAt: string | null;
  permissions: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
};

// GraphQL Queries
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

// GraphQL Mutations
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

// Response types for type-safe usage
export type ListApiKeysResponse = {
  apiKeys: ApiKey[];
};

export type GetApiKeyResponse = {
  apiKey: ApiKey | null;
};

export type CreateApiKeyResponse = {
  createApiKey: CreatedApiKey;
};

export type UpdateApiKeyResponse = {
  updateApiKey: ApiKey | null;
};

export type DeleteApiKeyResponse = {
  deleteApiKey: boolean;
};
