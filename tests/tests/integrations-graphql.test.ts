import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { gql } from "graphql-request";
import {
  createTestAuthClientWithJar,
  generateOrgName,
  generateSlug,
  generateTestEmail,
} from "../utils/auth-client.ts";
import { createGraphQLClient } from "../utils/graphql-client.ts";

// GraphQL operations for integrations
const CREATE_INTEGRATION = gql`
  mutation CreateIntegration($provider: String!, $name: String!, $authConfig: String!) {
    createIntegration(provider: $provider, name: $name, authConfig: $authConfig) {
      id
      organizationId
      provider
      name
      authConfig
      enabled
      createdAt
      updatedAt
    }
  }
`;

const LIST_INTEGRATIONS = gql`
  query ListIntegrations {
    integrations {
      id
      organizationId
      provider
      name
      authConfig
      enabled
      createdAt
      updatedAt
    }
  }
`;

const GET_INTEGRATION = gql`
  query GetIntegration($id: String!) {
    integration(id: $id) {
      id
      organizationId
      provider
      name
      authConfig
      enabled
      createdAt
      updatedAt
    }
  }
`;

const UPDATE_INTEGRATION = gql`
  mutation UpdateIntegration($id: String!, $name: String, $authConfig: String, $enabled: Boolean) {
    updateIntegration(id: $id, name: $name, authConfig: $authConfig, enabled: $enabled) {
      id
      organizationId
      provider
      name
      authConfig
      enabled
      createdAt
      updatedAt
    }
  }
`;

const DELETE_INTEGRATION = gql`
  mutation DeleteIntegration($id: String!) {
    deleteIntegration(id: $id)
  }
`;

describe("Integrations GraphQL API", { sanitizeOps: false, sanitizeResources: false }, () => {
  it("should create, list, get, update, and delete integrations", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    // Create test user and organization
    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({
      email,
      password,
      name: "Test User",
    });

    await authClient.signIn.email({
      email,
      password,
    });

    // Create organization
    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    expect(org.data).toBeDefined();

    // Set active organization
    await authClient.organization.setActive({
      organizationId: org.data!.id,
    });

    // Create GraphQL client with authenticated cookies
    const graphqlClient = createGraphQLClient(cookieJar);

    // Sample GitHub OAuth config
    const authConfig = {
      type: "oauth2",
      clientId: "test-github-client-id",
      clientSecret: "test-github-client-secret",
      scopes: ["repo", "read:user"],
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      redirectUri: "http://localhost:3002/api/oauth/callback",
    };

    // 1. Create integration
    const createResult: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "github",
      name: "test-github-integration",
      authConfig: JSON.stringify(authConfig),
    });

    expect(createResult.createIntegration).toBeDefined();
    expect(createResult.createIntegration.id).toBeDefined();
    expect(createResult.createIntegration.provider).toBe("github");
    expect(createResult.createIntegration.name).toBe("test-github-integration");
    expect(createResult.createIntegration.enabled).toBe(true);

    const integrationId = createResult.createIntegration.id;

    // Verify authConfig is encrypted (not same as input)
    const returnedAuthConfig = JSON.parse(createResult.createIntegration.authConfig);
    expect(returnedAuthConfig.clientId).toBe(authConfig.clientId);
    expect("clientSecret" in returnedAuthConfig).toBe(false);

    // 2. List integrations
    const listResult: any = await graphqlClient.request(LIST_INTEGRATIONS);

    expect(listResult.integrations).toBeDefined();
    expect(listResult.integrations.length).toBeGreaterThan(0);
    expect(listResult.integrations.some((i: any) => i.id === integrationId)).toBe(true);

    // 3. Get integration
    const getResult: any = await graphqlClient.request(GET_INTEGRATION, {
      id: integrationId,
    });

    expect(getResult.integration).toBeDefined();
    expect(getResult.integration.id).toBe(integrationId);
    expect(getResult.integration.provider).toBe("github");

    // 4. Update integration
    const updateResult: any = await graphqlClient.request(UPDATE_INTEGRATION, {
      id: integrationId,
      name: "updated-github-integration",
      enabled: false,
    });

    expect(updateResult.updateIntegration).toBeDefined();
    expect(updateResult.updateIntegration.id).toBe(integrationId);
    expect(updateResult.updateIntegration.name).toBe("updated-github-integration");
    expect(updateResult.updateIntegration.enabled).toBe(false);

    // 5. Delete integration
    const deleteResult: any = await graphqlClient.request(DELETE_INTEGRATION, {
      id: integrationId,
    });

    expect(deleteResult.deleteIntegration).toBe(true);

    // Verify deletion
    const getAfterDelete: any = await graphqlClient.request(GET_INTEGRATION, {
      id: integrationId,
    });

    expect(getAfterDelete.integration).toBeNull();
  });

  it("should enforce organization-level isolation", async () => {
    const { client: authClient1, cookieJar: cookieJar1 } = createTestAuthClientWithJar();
    const { client: authClient2, cookieJar: cookieJar2 } = createTestAuthClientWithJar();

    // Create two separate users and organizations
    const email1 = generateTestEmail();
    const email2 = generateTestEmail();
    const orgName1 = generateOrgName();
    const orgName2 = generateOrgName();
    const password = "TestPassword123!";

    // User 1
    await authClient1.signUp.email({
      email: email1,
      password,
      name: "Test User 1",
    });

    await authClient1.signIn.email({
      email: email1,
      password,
    });

    const org1 = await authClient1.organization.create({
      name: orgName1,
      slug: generateSlug(orgName1),
    });

    await authClient1.organization.setActive({
      organizationId: org1.data!.id,
    });

    // User 2
    await authClient2.signUp.email({
      email: email2,
      password,
      name: "Test User 2",
    });

    await authClient2.signIn.email({
      email: email2,
      password,
    });

    const org2 = await authClient2.organization.create({
      name: orgName2,
      slug: generateSlug(orgName2),
    });

    await authClient2.organization.setActive({
      organizationId: org2.data!.id,
    });

    const graphqlClient1 = createGraphQLClient(cookieJar1);
    const graphqlClient2 = createGraphQLClient(cookieJar2);

    // User 1 creates integration
    const authConfig = {
      type: "oauth2",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      scopes: ["repo"],
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      redirectUri: "http://localhost:3002/api/oauth/callback",
    };

    const createResult: any = await graphqlClient1.request(CREATE_INTEGRATION, {
      provider: "github",
      name: "org-1-integration",
      authConfig: JSON.stringify(authConfig),
    });

    const integration1Id = createResult.createIntegration.id;

    // User 2 should not see User 1's integration
    const listResult2: any = await graphqlClient2.request(LIST_INTEGRATIONS);

    expect(listResult2.integrations.some((i: any) => i.id === integration1Id)).toBe(false);

    // User 2 should not be able to access User 1's integration
    const getResult2: any = await graphqlClient2.request(GET_INTEGRATION, {
      id: integration1Id,
    });

    expect(getResult2.integration).toBeNull();

    // User 2 should not be able to delete User 1's integration
    const deleteResult2: any = await graphqlClient2.request(DELETE_INTEGRATION, {
      id: integration1Id,
    });

    expect(deleteResult2.deleteIntegration).toBe(false);

    // Verify User 1's integration still exists
    const getResult1: any = await graphqlClient1.request(GET_INTEGRATION, {
      id: integration1Id,
    });

    expect(getResult1.integration).toBeDefined();
    expect(getResult1.integration.id).toBe(integration1Id);
  });

  it("should reject invalid provider", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "oauth2",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      scopes: ["repo"],
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      redirectUri: "http://localhost:3002/api/oauth/callback",
    };

    try {
      await graphqlClient.request(CREATE_INTEGRATION, {
        provider: "invalid-provider",
        name: "test-integration",
        authConfig: JSON.stringify(authConfig),
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.response.errors[0].message).toContain("Invalid provider");
    }
  });

  it("should create MCP integration with viewer-scoped PAT (no apiKey required)", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    // MCP config with viewer-scoped API key (PAT) - no apiKey field
    const authConfig = {
      type: "mcp",
      serverUrl: "https://api.example.com/mcp",
      transport: "streamable-http",
      auth: {
        strategy: {
          type: "api_key",
          viewerScoped: true,
          headerName: "Authorization",
        },
      },
    };

    const createResult: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "mcp",
      name: "viewer-scoped-pat-mcp-integration",
      authConfig: JSON.stringify(authConfig),
    });

    expect(createResult.createIntegration).toBeDefined();
    expect(createResult.createIntegration.id).toBeDefined();
    expect(createResult.createIntegration.provider).toBe("mcp");
    expect(createResult.createIntegration.name).toBe("viewer-scoped-pat-mcp-integration");
    expect(createResult.createIntegration.enabled).toBe(true);

    // Verify authConfig is returned correctly
    const returnedAuthConfig = JSON.parse(createResult.createIntegration.authConfig);
    expect(returnedAuthConfig.type).toBe("mcp");
    expect(returnedAuthConfig.serverUrl).toBe("https://api.example.com/mcp");
    expect(returnedAuthConfig.auth.strategy.type).toBe("api_key");
    expect(returnedAuthConfig.auth.strategy.viewerScoped).toBe(true);
    // No apiKey should be present since it's viewer-scoped
    expect(returnedAuthConfig.apiKey).toBeUndefined();
  });

  it("should require apiKey for org-level (non-viewer-scoped) MCP api_key auth", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    // MCP config with org-level API key but missing the apiKey field
    const authConfig = {
      type: "mcp",
      serverUrl: "https://api.example.com/mcp",
      transport: "streamable-http",
      auth: {
        strategy: {
          type: "api_key",
          // viewerScoped is false/undefined, so apiKey is required
        },
      },
    };

    try {
      await graphqlClient.request(CREATE_INTEGRATION, {
        provider: "mcp",
        name: "org-level-api-key-mcp-integration",
        authConfig: JSON.stringify(authConfig),
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.response.errors[0].message).toContain(
        "auth.apiKey is required when using org-level api_key auth strategy"
      );
    }
  });

  // ============================================================================
  // GraphQL Integration Provider Tests
  // ============================================================================

  it("should create GraphQL integration with no auth", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      endpoint: "https://api.example.com/graphql",
      auth: { strategy: { type: "none" } },
    };

    const createResult: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "graphql",
      name: "public-graphql-api",
      authConfig: JSON.stringify(authConfig),
    });

    expect(createResult.createIntegration).toBeDefined();
    expect(createResult.createIntegration.id).toBeDefined();
    expect(createResult.createIntegration.provider).toBe("graphql");
    expect(createResult.createIntegration.name).toBe("public-graphql-api");
    expect(createResult.createIntegration.enabled).toBe(true);

    const returnedAuthConfig = JSON.parse(createResult.createIntegration.authConfig);
    expect(returnedAuthConfig.type).toBe("graphql");
    expect(returnedAuthConfig.endpoint).toBe("https://api.example.com/graphql");
    expect(returnedAuthConfig.auth.strategy.type).toBe("none");
  });

  it("should create GraphQL integration with org-level API key", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      endpoint: "https://api.example.com/graphql",
      auth: {
        strategy: {
          type: "api_key",
          headerName: "X-API-Key",
        },
        apiKey: "org-level-api-key-12345",
      },
    };

    const createResult: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "graphql",
      name: "graphql-with-org-api-key",
      authConfig: JSON.stringify(authConfig),
    });

    expect(createResult.createIntegration).toBeDefined();
    expect(createResult.createIntegration.provider).toBe("graphql");

    const returnedAuthConfig = JSON.parse(createResult.createIntegration.authConfig);
    expect(returnedAuthConfig.type).toBe("graphql");
    expect(returnedAuthConfig.auth.strategy.type).toBe("api_key");
    expect(returnedAuthConfig.auth.strategy.headerName).toBe("X-API-Key");
    // API key should NOT be returned (encrypted/redacted)
    expect(returnedAuthConfig.apiKey).toBeUndefined();
  });

  it("should create GraphQL integration with viewer-scoped PAT", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      endpoint: "https://api.example.com/graphql",
      auth: {
        strategy: {
          type: "api_key",
          viewerScoped: true,
          headerName: "Authorization",
        },
        // No apiKey - viewers will provide their own PAT
      },
    };

    const createResult: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "graphql",
      name: "graphql-with-viewer-pat",
      authConfig: JSON.stringify(authConfig),
    });

    expect(createResult.createIntegration).toBeDefined();
    expect(createResult.createIntegration.provider).toBe("graphql");

    const returnedAuthConfig = JSON.parse(createResult.createIntegration.authConfig);
    expect(returnedAuthConfig.type).toBe("graphql");
    expect(returnedAuthConfig.auth.strategy.type).toBe("api_key");
    expect(returnedAuthConfig.auth.strategy.viewerScoped).toBe(true);
    expect(returnedAuthConfig.apiKey).toBeUndefined();
  });

  it("should create GraphQL integration with bearer_oauth", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      endpoint: "https://api.example.com/graphql",
      auth: {
        strategy: { type: "bearer_oauth" },
        oauthConfig: {
          clientId: "oauth-client-id",
          clientSecret: "oauth-client-secret",
          authUrl: "https://auth.example.com/authorize",
          tokenUrl: "https://auth.example.com/token",
          redirectUri: "http://localhost:3002/api/oauth/callback",
          scopes: ["read", "write"],
        },
      },
    };

    const createResult: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "graphql",
      name: "graphql-with-oauth",
      authConfig: JSON.stringify(authConfig),
    });

    expect(createResult.createIntegration).toBeDefined();
    expect(createResult.createIntegration.provider).toBe("graphql");

    const returnedAuthConfig = JSON.parse(createResult.createIntegration.authConfig);
    expect(returnedAuthConfig.type).toBe("graphql");
    expect(returnedAuthConfig.auth.strategy.type).toBe("bearer_oauth");
    expect(returnedAuthConfig.auth.oauthConfig).toBeDefined();
    expect(returnedAuthConfig.auth.oauthConfig.clientId).toBe("oauth-client-id");
    // Client secret should NOT be returned
    expect(returnedAuthConfig.auth.oauthConfig.clientSecret).toBeUndefined();
  });

  it("should create GraphQL integration with custom headers", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      endpoint: "https://api.example.com/graphql",
      auth: {
        strategy: {
          type: "custom_headers",
          headers: {
            "X-Custom-Auth": "custom-value",
            "X-Tenant-ID": "tenant-123",
          },
        },
      },
    };

    const createResult: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "graphql",
      name: "graphql-with-custom-headers",
      authConfig: JSON.stringify(authConfig),
    });

    expect(createResult.createIntegration).toBeDefined();
    expect(createResult.createIntegration.provider).toBe("graphql");

    const returnedAuthConfig = JSON.parse(createResult.createIntegration.authConfig);
    expect(returnedAuthConfig.type).toBe("graphql");
    expect(returnedAuthConfig.auth.strategy.type).toBe("custom_headers");
    expect(returnedAuthConfig.auth.strategy.headers).toBeDefined();
  });

  it("should reject GraphQL integration with missing endpoint", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      // Missing endpoint
      auth: { strategy: { type: "none" } },
    };

    try {
      await graphqlClient.request(CREATE_INTEGRATION, {
        provider: "graphql",
        name: "invalid-graphql-integration",
        authConfig: JSON.stringify(authConfig),
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.response.errors[0].message).toContain("endpoint is required");
    }
  });

  it("should reject GraphQL integration with invalid endpoint URL", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      endpoint: "not-a-valid-url",
      auth: { strategy: { type: "none" } },
    };

    try {
      await graphqlClient.request(CREATE_INTEGRATION, {
        provider: "graphql",
        name: "invalid-graphql-integration",
        authConfig: JSON.stringify(authConfig),
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.response.errors[0].message).toContain("must be a valid URL");
    }
  });

  it("should reject GraphQL org-level api_key without apiKey field", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      endpoint: "https://api.example.com/graphql",
      auth: {
        strategy: {
          type: "api_key",
          // viewerScoped is false/undefined, so apiKey is required
        },
        // Missing apiKey field
      },
    };

    try {
      await graphqlClient.request(CREATE_INTEGRATION, {
        provider: "graphql",
        name: "invalid-graphql-integration",
        authConfig: JSON.stringify(authConfig),
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.response.errors[0].message).toContain(
        "auth.apiKey is required when using org-level api_key auth strategy"
      );
    }
  });

  it("should reject GraphQL bearer_oauth without oauthConfig", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      endpoint: "https://api.example.com/graphql",
      auth: {
        strategy: { type: "bearer_oauth" },
        // Missing oauthConfig
      },
    };

    try {
      await graphqlClient.request(CREATE_INTEGRATION, {
        provider: "graphql",
        name: "invalid-graphql-integration",
        authConfig: JSON.stringify(authConfig),
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.response.errors[0].message).toContain(
        "auth.oauthConfig is required when using bearer_oauth auth strategy"
      );
    }
  });

  it("should reject GraphQL custom_headers without headers", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "graphql",
      endpoint: "https://api.example.com/graphql",
      auth: {
        strategy: {
          type: "custom_headers",
          headers: {}, // Empty headers
        },
      },
    };

    try {
      await graphqlClient.request(CREATE_INTEGRATION, {
        provider: "graphql",
        name: "invalid-graphql-integration",
        authConfig: JSON.stringify(authConfig),
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.response.errors[0].message).toContain(
        "auth.strategy.headers must have at least one header"
      );
    }
  });
});
