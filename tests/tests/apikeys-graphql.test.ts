import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import {
  createTestAuthClientWithJar,
  generateOrgName,
  generateSlug,
  generateTestEmail,
} from "../utils/auth-client.ts";
import { createGraphQLClient } from "../utils/graphql-client.ts";
import { CookieJar } from "tough-cookie";
import { gql } from "graphql-request";
import type {
  CreateApiKeyMutation,
  DeleteApiKeyMutation,
  GetApiKeyQuery,
  ListApiKeysQuery,
  UpdateApiKeyMutation,
} from "../generated/graphql.ts";

// GraphQL operations colocated with tests
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

const LIST_API_KEYS = gql`
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

const GET_API_KEY = gql`
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

const UPDATE_API_KEY = gql`
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

const DELETE_API_KEY = gql`
  mutation DeleteApiKey($id: String!) {
    deleteApiKey(id: $id)
  }
`;

describe("API Keys - GraphQL", { sanitizeOps: false, sanitizeResources: false }, () => {
  describe("API Key Creation via GraphQL", () => {
    it("should create an API key with active organization", async () => {
      // Set up auth client with shared cookie jar
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      // Sign up and create organization
      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      // Now use GraphQL client with shared cookie jar
      const gqlClient = createGraphQLClient(cookieJar);

      const response = await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Test API Key",
      });

      expect(response.createApiKey, "API key should be created").not.toBeNull();

      if (!response.createApiKey) throw new Error("API key not created");

      expect(response.createApiKey.id, "API key should have an ID").toBeDefined();
      expect(response.createApiKey.name, "API key name should match").toBe("Test API Key");
      expect(response.createApiKey.key, "API key should have a key").toBeDefined();
      expect(response.createApiKey.organizationId, "API key should be scoped to organization").toBe(
        org.data!.id
      );
    });

    it("should create API key with custom prefix", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      const response = await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Custom Prefix Key",
        prefix: "sk_test",
      });

      if (!response.createApiKey) throw new Error("API key not created");

      expect(response.createApiKey.key, "API key should start with prefix").toMatch(/^sk_test/);
      expect(response.createApiKey.prefix).toBe("sk_test");
    });

    it("should create API key with metadata", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      const metadata = { environment: "test", purpose: "integration" };
      const response = await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Metadata Key",
        metadata: JSON.stringify(metadata),
      });

      if (!response.createApiKey) throw new Error("API key not created");

      expect(response.createApiKey.metadata, "API key should have metadata").toBeDefined();

      const parsedMetadata = JSON.parse(response.createApiKey.metadata!);
      expect(parsedMetadata).toEqual(metadata);
    });

    it("should fail to create API key without authentication", async () => {
      const cookieJar = new CookieJar(); // Empty cookie jar
      const gqlClient = createGraphQLClient(cookieJar);

      let errorThrown = false;
      try {
        await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
          name: "Unauthorized Key",
        });
      } catch (error: any) {
        errorThrown = true;
        expect(error.response?.errors?.[0]?.message).toContain("Unauthorized");
      }
      expect(errorThrown, "Should have thrown an error").toBe(true);
    });

    it("should fail to create API key without active organization", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      // Don't create/set active organization

      const gqlClient = createGraphQLClient(cookieJar);

      let errorThrown = false;
      try {
        await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
          name: "No Org Key",
        });
      } catch (error: any) {
        errorThrown = true;
        expect(error.response?.errors?.[0]?.message).toContain("No active organization");
      }
      expect(errorThrown, "Should have thrown an error").toBe(true);
    });
  });

  describe("API Key Listing via GraphQL", () => {
    it("should list all API keys for the active organization", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      // Create multiple API keys
      await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Key 1",
      });
      await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Key 2",
      });

      const response = await gqlClient.request<ListApiKeysQuery>(LIST_API_KEYS);

      if (!response.apiKeys) throw new Error("API keys not returned");

      expect(response.apiKeys).toHaveLength(2);
      expect(response.apiKeys[0].name).toBeDefined();
      expect(response.apiKeys[1].name).toBeDefined();

      // Keys should not include the full key value in list
      expect(response.apiKeys[0]).not.toHaveProperty("key");
    });

    it("should return empty list for new organization", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      const response = await gqlClient.request<ListApiKeysQuery>(LIST_API_KEYS);

      if (!response.apiKeys) throw new Error("API keys not returned");

      expect(response.apiKeys).toHaveLength(0);
    });
  });

  describe("API Key Retrieval via GraphQL", () => {
    it("should get a specific API key by ID", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      const createResponse = await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Specific Key",
      });

      if (!createResponse.createApiKey) throw new Error("API key not created");

      const getResponse = await gqlClient.request<GetApiKeyQuery>(GET_API_KEY, {
        id: createResponse.createApiKey.id,
      });

      expect(getResponse.apiKey).not.toBeNull();
      expect(getResponse.apiKey!.id).toBe(createResponse.createApiKey.id);
      expect(getResponse.apiKey!.name).toBe("Specific Key");
    });

    it("should return null for non-existent API key", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      const getResponse = await gqlClient.request<GetApiKeyQuery>(GET_API_KEY, {
        id: "non-existent-id",
      });

      expect(getResponse.apiKey).toBeNull();
    });
  });

  describe("API Key Update via GraphQL", () => {
    it("should update API key name", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      const createResponse = await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Original Name",
      });

      if (!createResponse.createApiKey) throw new Error("API key not created");

      const updateResponse = await gqlClient.request<UpdateApiKeyMutation>(UPDATE_API_KEY, {
        id: createResponse.createApiKey.id,
        name: "Updated Name",
      });

      expect(updateResponse.updateApiKey).not.toBeNull();
      expect(updateResponse.updateApiKey!.name).toBe("Updated Name");
    });

    it("should update API key metadata", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      const createResponse = await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Metadata Key",
        metadata: JSON.stringify({ version: 1 }),
      });

      if (!createResponse.createApiKey) throw new Error("API key not created");

      const newMetadata = { version: 2, updated: true };
      const updateResponse = await gqlClient.request<UpdateApiKeyMutation>(UPDATE_API_KEY, {
        id: createResponse.createApiKey.id,
        metadata: JSON.stringify(newMetadata),
      });

      expect(updateResponse.updateApiKey).not.toBeNull();
      const parsedMetadata = JSON.parse(updateResponse.updateApiKey!.metadata!);
      expect(parsedMetadata).toEqual(newMetadata);
    });
  });

  describe("API Key Deletion via GraphQL", () => {
    it("should delete an API key", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      const createResponse = await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "To Delete",
      });

      if (!createResponse.createApiKey) throw new Error("API key not created");

      const deleteResponse = await gqlClient.request<DeleteApiKeyMutation>(DELETE_API_KEY, {
        id: createResponse.createApiKey.id,
      });

      expect(deleteResponse.deleteApiKey).toBe(true);

      // Verify it's deleted
      const getResponse = await gqlClient.request<GetApiKeyQuery>(GET_API_KEY, {
        id: createResponse.createApiKey.id,
      });

      expect(getResponse.apiKey).toBeNull();
    });

    it("should return false when deleting non-existent key", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      const org = await authClient.organization.create({
        name: orgName,
        slug: generateSlug(orgName),
      });

      await authClient.organization.setActive({
        organizationId: org.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      const deleteResponse = await gqlClient.request<DeleteApiKeyMutation>(DELETE_API_KEY, {
        id: "non-existent-id",
      });

      expect(deleteResponse.deleteApiKey).toBe(false);
    });
  });

  describe("API Key Organization Scoping via GraphQL", () => {
    it("should only return API keys for the active organization", async () => {
      const { client: authClient, cookieJar } = createTestAuthClientWithJar();
      const email = generateTestEmail();
      const password = "TestPassword123!";

      await authClient.signUp.email({
        email: email,
        password: password,
        name: email,
      });

      // Create first organization
      const org1 = await authClient.organization.create({
        name: generateOrgName(),
        slug: generateSlug(generateOrgName()),
      });

      await authClient.organization.setActive({
        organizationId: org1.data!.id,
      });

      const gqlClient = createGraphQLClient(cookieJar);

      // Create key in org1
      await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Org1 Key",
      });

      // Create second organization
      const org2 = await authClient.organization.create({
        name: generateOrgName(),
        slug: generateSlug(generateOrgName()),
      });

      await authClient.organization.setActive({
        organizationId: org2.data!.id,
      });

      // Create key in org2
      await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
        name: "Org2 Key",
      });

      // List keys should only show org2's key
      const listResponse = await gqlClient.request<ListApiKeysQuery>(LIST_API_KEYS);

      if (!listResponse.apiKeys) throw new Error("API keys not returned");

      expect(listResponse.apiKeys).toHaveLength(1);
      expect(listResponse.apiKeys[0].name).toBe("Org2 Key");
      expect(listResponse.apiKeys[0].organizationId).toBe(org2.data!.id);
    });
  });
});
