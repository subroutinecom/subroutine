import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { gql } from "graphql-request";
import {
  createTestAuthClientWithJar,
  generateOrgName,
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

// GraphQL operations for connected accounts
const CREATE_CONNECTED_ACCOUNT = gql`
  mutation CreateConnectedAccount(
    $integrationId: String!
    $viewerId: String!
    $credentials: String!
    $accountIdentifier: String
  ) {
    createConnectedAccount(
      integrationId: $integrationId
      viewerId: $viewerId
      credentials: $credentials
      accountIdentifier: $accountIdentifier
    ) {
      id
      integrationId
      viewerId
      organizationId
      credentials
      accountIdentifier
      status
      lastUsedAt
      createdAt
      updatedAt
    }
  }
`;

const LIST_CONNECTED_ACCOUNTS = gql`
  query ListConnectedAccounts {
    connectedAccounts {
      id
      integrationId
      viewerId
      organizationId
      credentials
      accountIdentifier
      status
      lastUsedAt
      createdAt
      updatedAt
    }
  }
`;

const GET_CONNECTED_ACCOUNT = gql`
  query GetConnectedAccount($id: String!) {
    connectedAccount(id: $id) {
      id
      integrationId
      viewerId
      organizationId
      credentials
      accountIdentifier
      status
      lastUsedAt
      createdAt
      updatedAt
    }
  }
`;

const DELETE_CONNECTED_ACCOUNT = gql`
  mutation DeleteConnectedAccount($id: String!) {
    deleteConnectedAccount(id: $id)
  }
`;

const LIST_CONNECTED_ACCOUNTS_BY_INTEGRATION = gql`
  query ListConnectedAccountsByIntegration($integrationId: String!) {
    connectedAccountsByIntegration(integrationId: $integrationId) {
      id
      integrationId
      viewerId
      organizationId
      credentials
      accountIdentifier
      status
      lastUsedAt
      createdAt
      updatedAt
    }
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
      slug: orgName.toLowerCase().replace(/\s+/g, "-"),
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
      name: "Test GitHub Integration",
      authConfig: JSON.stringify(authConfig),
    });

    expect(createResult.createIntegration).toBeDefined();
    expect(createResult.createIntegration.id).toBeDefined();
    expect(createResult.createIntegration.provider).toBe("github");
    expect(createResult.createIntegration.name).toBe("Test GitHub Integration");
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
      name: "Updated GitHub Integration",
      enabled: false,
    });

    expect(updateResult.updateIntegration).toBeDefined();
    expect(updateResult.updateIntegration.id).toBe(integrationId);
    expect(updateResult.updateIntegration.name).toBe("Updated GitHub Integration");
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

  it("should create and manage connected accounts", async () => {
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

    const org = await authClient.organization.create({
      name: orgName,
      slug: orgName.toLowerCase().replace(/\s+/g, "-"),
    });

    await authClient.organization.setActive({
      organizationId: org.data!.id,
    });

    const graphqlClient = createGraphQLClient(cookieJar);

    // Create an integration first
    const authConfig = {
      type: "oauth2",
      clientId: "test-gmail-client-id",
      clientSecret: "test-gmail-client-secret",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      redirectUri: "http://localhost:3002/api/oauth/callback",
    };

    const createIntegrationResult: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "gmail",
      name: "Test Gmail Integration",
      authConfig: JSON.stringify(authConfig),
    });

    const integrationId = createIntegrationResult.createIntegration.id;

    // Create connected account
    const credentials = {
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      expiresAt: Date.now() + 3600000,
      tokenType: "Bearer" as const,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    };

    const testViewerId = "test-viewer-id-123";
    const createConnectedResult: any = await graphqlClient.request(CREATE_CONNECTED_ACCOUNT, {
      integrationId,
      viewerId: testViewerId,
      credentials: JSON.stringify(credentials),
      accountIdentifier: "test@example.com",
    });

    expect(createConnectedResult.createConnectedAccount).toBeDefined();
    expect(createConnectedResult.createConnectedAccount.id).toBeDefined();
    expect(createConnectedResult.createConnectedAccount.integrationId).toBe(integrationId);
    expect(createConnectedResult.createConnectedAccount.viewerId).toBe(testViewerId);
    expect(createConnectedResult.createConnectedAccount.accountIdentifier).toBe("test@example.com");
    expect(createConnectedResult.createConnectedAccount.status).toBe("active");

    const connectedAccountId = createConnectedResult.createConnectedAccount.id;

    // Verify credentials are encrypted and returned
    const returnedCreds = JSON.parse(createConnectedResult.createConnectedAccount.credentials);
    expect(returnedCreds.accessToken).toBe(credentials.accessToken);
    expect(returnedCreds.refreshToken).toBe(credentials.refreshToken);

    // List connected accounts
    const listConnectedResult: any = await graphqlClient.request(LIST_CONNECTED_ACCOUNTS);

    expect(listConnectedResult.connectedAccounts).toBeDefined();
    expect(listConnectedResult.connectedAccounts.length).toBeGreaterThan(0);
    expect(
      listConnectedResult.connectedAccounts.some((ca: any) => ca.id === connectedAccountId)
    ).toBe(true);

    // Get connected account
    const getConnectedResult: any = await graphqlClient.request(GET_CONNECTED_ACCOUNT, {
      id: connectedAccountId,
    });

    expect(getConnectedResult.connectedAccount).toBeDefined();
    expect(getConnectedResult.connectedAccount.id).toBe(connectedAccountId);

    // Delete connected account
    const deleteConnectedResult: any = await graphqlClient.request(DELETE_CONNECTED_ACCOUNT, {
      id: connectedAccountId,
    });

    expect(deleteConnectedResult.deleteConnectedAccount).toBe(true);

    // Verify deletion
    const getAfterDelete: any = await graphqlClient.request(GET_CONNECTED_ACCOUNT, {
      id: connectedAccountId,
    });

    expect(getAfterDelete.connectedAccount).toBeNull();
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
      slug: orgName1.toLowerCase().replace(/\s+/g, "-"),
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
      slug: orgName2.toLowerCase().replace(/\s+/g, "-"),
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
      name: "Org 1 Integration",
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
      slug: orgName.toLowerCase().replace(/\s+/g, "-"),
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
        name: "Test Integration",
        authConfig: JSON.stringify(authConfig),
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.response.errors[0].message).toContain("Invalid provider");
    }
  });

  it("should enforce user-level scoping for connected accounts", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: orgName.toLowerCase().replace(/\s+/g, "-"),
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

    const integration: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "github",
      name: "Test Integration",
      authConfig: JSON.stringify(authConfig),
    });

    const credentials = {
      accessToken: "test-token",
      refreshToken: "test-refresh",
      expiresAt: Date.now() + 3600000,
      tokenType: "Bearer" as const,
      scope: "repo",
    };

    const testViewerId = "test-viewer-scoping-123";
    const connectedAccount: any = await graphqlClient.request(CREATE_CONNECTED_ACCOUNT, {
      integrationId: integration.createIntegration.id,
      viewerId: testViewerId,
      credentials: JSON.stringify(credentials),
      accountIdentifier: "user@example.com",
    });

    expect(connectedAccount.createConnectedAccount.viewerId).toBe(testViewerId);

    const accounts: any = await graphqlClient.request(LIST_CONNECTED_ACCOUNTS);

    expect(accounts.connectedAccounts.length).toBe(1);
    expect(accounts.connectedAccounts[0].viewerId).toBe(testViewerId);
  });

  it("should cascade delete connected accounts when integration is deleted", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: orgName.toLowerCase().replace(/\s+/g, "-"),
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

    const integration: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "github",
      name: "Integration to Delete",
      authConfig: JSON.stringify(authConfig),
    });

    const credentials = {
      accessToken: "test-token",
      refreshToken: "test-refresh",
      expiresAt: Date.now() + 3600000,
      tokenType: "Bearer" as const,
      scope: "repo",
    };

    const testViewerId = "test-viewer-cascade-delete";
    const connectedAccount: any = await graphqlClient.request(CREATE_CONNECTED_ACCOUNT, {
      integrationId: integration.createIntegration.id,
      viewerId: testViewerId,
      credentials: JSON.stringify(credentials),
      accountIdentifier: "test@example.com",
    });

    const accountsBefore: any = await graphqlClient.request(
      LIST_CONNECTED_ACCOUNTS_BY_INTEGRATION,
      { integrationId: integration.createIntegration.id }
    );

    expect(accountsBefore.connectedAccountsByIntegration.length).toBe(1);

    await graphqlClient.request(DELETE_INTEGRATION, {
      id: integration.createIntegration.id,
    });

    const accountAfter: any = await graphqlClient.request(GET_CONNECTED_ACCOUNT, {
      id: connectedAccount.createConnectedAccount.id,
    });

    expect(accountAfter.connectedAccount).toBeNull();
  });

  it("should list connected accounts by integration", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail();
    const orgName = generateOrgName();
    const password = "TestPassword123!";

    await authClient.signUp.email({ email, password, name: "Test User" });
    await authClient.signIn.email({ email, password });

    const org = await authClient.organization.create({
      name: orgName,
      slug: orgName.toLowerCase().replace(/\s+/g, "-"),
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

    const integration: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "github",
      name: "Integration",
      authConfig: JSON.stringify(authConfig),
    });

    const credentials = {
      accessToken: "token1",
      refreshToken: "refresh1",
      expiresAt: Date.now() + 3600000,
      tokenType: "Bearer" as const,
      scope: "repo",
    };

    const testViewerId = "test-viewer-list-by-integration";
    await graphqlClient.request(CREATE_CONNECTED_ACCOUNT, {
      integrationId: integration.createIntegration.id,
      viewerId: testViewerId,
      credentials: JSON.stringify(credentials),
      accountIdentifier: "account1@example.com",
    });

    const result: any = await graphqlClient.request(LIST_CONNECTED_ACCOUNTS_BY_INTEGRATION, {
      integrationId: integration.createIntegration.id,
    });

    expect(result.connectedAccountsByIntegration.length).toBe(1);
    expect(result.connectedAccountsByIntegration[0].viewerId).toBe(testViewerId);
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
      slug: orgName.toLowerCase().replace(/\s+/g, "-"),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    // MCP config with viewer-scoped API key (PAT) - no apiKey field
    const authConfig = {
      type: "mcp",
      serverUrl: "https://api.example.com/mcp",
      transport: "streamable-http",
      authStrategy: {
        type: "api_key",
        viewerScoped: true,
        headerName: "Authorization",
      },
    };

    const createResult: any = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "mcp",
      name: "Viewer-Scoped PAT MCP Integration",
      authConfig: JSON.stringify(authConfig),
    });

    expect(createResult.createIntegration).toBeDefined();
    expect(createResult.createIntegration.id).toBeDefined();
    expect(createResult.createIntegration.provider).toBe("mcp");
    expect(createResult.createIntegration.name).toBe("Viewer-Scoped PAT MCP Integration");
    expect(createResult.createIntegration.enabled).toBe(true);

    // Verify authConfig is returned correctly
    const returnedAuthConfig = JSON.parse(createResult.createIntegration.authConfig);
    expect(returnedAuthConfig.type).toBe("mcp");
    expect(returnedAuthConfig.serverUrl).toBe("https://api.example.com/mcp");
    expect(returnedAuthConfig.authStrategy.type).toBe("api_key");
    expect(returnedAuthConfig.authStrategy.viewerScoped).toBe(true);
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
      slug: orgName.toLowerCase().replace(/\s+/g, "-"),
    });

    await authClient.organization.setActive({ organizationId: org.data!.id });

    const graphqlClient = createGraphQLClient(cookieJar);

    // MCP config with org-level API key but missing the apiKey field
    const authConfig = {
      type: "mcp",
      serverUrl: "https://api.example.com/mcp",
      transport: "streamable-http",
      authStrategy: {
        type: "api_key",
        // viewerScoped is false/undefined, so apiKey is required
      },
    };

    try {
      await graphqlClient.request(CREATE_INTEGRATION, {
        provider: "mcp",
        name: "Org-Level API Key MCP Integration",
        authConfig: JSON.stringify(authConfig),
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.response.errors[0].message).toContain(
        "authConfig.apiKey is required when using org-level api_key auth strategy"
      );
    }
  });
});
