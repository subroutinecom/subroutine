import { createTestAuthClientWithJar, generateTestEmail, generateOrgName } from "../utils/auth-client.ts";
import { createGraphQLClient } from "../utils/graphql-client.ts";
import { gql } from "graphql-request";
import type { CreateApiKeyMutation } from "../generated/graphql.ts";

const CREATE_API_KEY = gql`
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

/**
 * Fixture for creating a test API key with full setup
 * Returns the API key, user context, and organization info
 */
export const createTestApiKey = async (options?: {
  name?: string;
  prefix?: string;
  metadata?: Record<string, any>;
}) => {
  // Create test user and organization
  const { client: authClient, cookieJar } = createTestAuthClientWithJar();
  const email = generateTestEmail();
  const password = "TestPassword123!";
  const orgName = generateOrgName();

  // Sign up
  await authClient.signUp.email({
    email,
    password,
    name: email,
  });

  // Create organization
  const org = await authClient.organization.create({
    name: orgName,
    slug: orgName.toLowerCase(),
  });

  // Set active organization
  await authClient.organization.setActive({
    organizationId: org.data!.id,
  });

  // Create API key via GraphQL
  const gqlClient = createGraphQLClient(cookieJar);
  const response = await gqlClient.request<CreateApiKeyMutation>(
    CREATE_API_KEY,
    {
      name: options?.name || "Test API Key",
      prefix: options?.prefix,
      metadata: options?.metadata ? JSON.stringify(options.metadata) : undefined,
    },
  );

  if (!response.createApiKey?.key || !response.createApiKey?.id) {
    throw new Error("Failed to create API key");
  }

  return {
    apiKey: response.createApiKey.key, // Plain key for use in tests
    apiKeyId: response.createApiKey.id,
    organizationId: org.data!.id,
    authClient,
    cookieJar,
  };
};

/**
 * Simple fixture that just creates an API key and returns it
 * Useful for quick test setup
 */
export const getTestApiKey = async (): Promise<string> => {
  const { apiKey } = await createTestApiKey();
  return apiKey;
};

/**
 * Fixture for creating multiple API keys for the same organization
 */
export const createMultipleTestApiKeys = async (count: number) => {
  // Create test user and organization
  const { client: authClient, cookieJar } = createTestAuthClientWithJar();
  const email = generateTestEmail();
  const password = "TestPassword123!";
  const orgName = generateOrgName();

  await authClient.signUp.email({
    email,
    password,
    name: email,
  });

  const org = await authClient.organization.create({
    name: orgName,
    slug: orgName.toLowerCase(),
  });

  await authClient.organization.setActive({
    organizationId: org.data!.id,
  });

  // Create multiple API keys
  const gqlClient = createGraphQLClient(cookieJar);
  const apiKeys: string[] = [];

  for (let i = 0; i < count; i++) {
    const response = await gqlClient.request<CreateApiKeyMutation>(
      CREATE_API_KEY,
      {
        name: `Test API Key ${i + 1}`,
      },
    );
    if (!response.createApiKey?.key) {
      throw new Error(`Failed to create API key ${i + 1}`);
    }
    apiKeys.push(response.createApiKey.key);
  }

  return {
    apiKeys,
    organizationId: org.data!.id,
    authClient,
    cookieJar,
  };
};
