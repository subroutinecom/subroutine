import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { gql } from "graphql-request";
import type { CookieJar } from "tough-cookie";
import {
  createTestAuthClientWithJar,
  generateOrgName,
  generateSlug,
  generateTestEmail,
} from "../utils/auth-client.ts";
import { createGraphQLClient } from "../utils/graphql-client.ts";

const API_BASE = "http://api.subroutine.internal:80";

// GraphQL operations
const CREATE_INTEGRATION = gql`
  mutation CreateIntegration($provider: String!, $name: String!, $authConfig: String!) {
    createIntegration(provider: $provider, name: $name, authConfig: $authConfig) {
      id
      name
    }
  }
`;

// Helper to generate PAT link via authenticated REST endpoint
const generatePatLink = async (
  cookieJar: CookieJar,
  integrationId: string,
  viewerId: string
): Promise<{ id: string; url: string; expiresAt: string }> => {
  const cookies = await cookieJar.getCookies(API_BASE);
  const cookieHeader = cookies.map((c) => `${c.key}=${c.value}`).join("; ");

  const response = await fetch(`${API_BASE}/tests/pat-link/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ integrationId, viewerId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to generate PAT link");
  }

  return response.json();
};

describe("PAT Link API", { sanitizeOps: false, sanitizeResources: false }, () => {
  it("should generate PAT link and retrieve it via REST API", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    // Create test user and organization
    const email = generateTestEmail("pat-link");
    const orgName = generateOrgName("PAT-Link-Test");
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
      slug: generateSlug(orgName),
    });

    expect(org.data).toBeDefined();

    await authClient.organization.setActive({
      organizationId: org.data!.id,
    });

    const graphqlClient = createGraphQLClient(cookieJar);

    // Create a viewer-scoped MCP integration
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
      metadata: {
        authInstructions: "Please enter your API key from Settings > API Keys",
        patLabel: "API Key",
        helpUrl: "https://example.com/help/api-keys",
      },
    };

    const createResult = (await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "mcp",
      name: "Test PAT Integration",
      authConfig: JSON.stringify(authConfig),
    })) as { createIntegration: { id: string; name: string } };

    const integrationId = createResult.createIntegration.id;

    // Generate a PAT link via REST API
    const patLinkResult = await generatePatLink(cookieJar, integrationId, "test-viewer-123");

    expect(patLinkResult).toBeDefined();
    expect(patLinkResult.id).toBeDefined();
    expect(patLinkResult.url).toContain("/pat/");
    expect(patLinkResult.expiresAt).toBeDefined();

    const patLinkId = patLinkResult.id;

    // Test: GET the PAT link info via public REST API
    const response = await fetch(`${API_BASE}/api/pat-link/${patLinkId}`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe(patLinkId);
    expect(data.integration).toBeDefined();
    expect(data.integration.name).toBe("Test PAT Integration");
    expect(data.integration.authInstructions).toBe(
      "Please enter your API key from Settings > API Keys"
    );
    expect(data.integration.patLabel).toBe("API Key");
    expect(data.integration.helpUrl).toBe("https://example.com/help/api-keys");
  });

  it("should return 404 for invalid PAT link ID", async () => {
    const response = await fetch(`${API_BASE}/api/pat-link/invalid-link-id-123`);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBeDefined();
  });

  it("should submit PAT and create connected account", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail("pat-submit");
    const orgName = generateOrgName("PAT-Submit-Test");
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
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({
      organizationId: org.data!.id,
    });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "mcp",
      serverUrl: "https://api.example.com/mcp",
      transport: "streamable-http",
      auth: {
        strategy: {
          type: "api_key",
          viewerScoped: true,
        },
      },
    };

    const createResult = (await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "mcp",
      name: "Test PAT Submit Integration",
      authConfig: JSON.stringify(authConfig),
    })) as { createIntegration: { id: string; name: string } };

    const integrationId = createResult.createIntegration.id;

    const patLinkResult = await generatePatLink(cookieJar, integrationId, "test-viewer-submit-456");

    const patLinkId = patLinkResult.id;

    // Submit a PAT via REST API
    const response = await fetch(`${API_BASE}/api/pat-link/${patLinkId}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pat: "test-personal-access-token-12345" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("should reject already-used PAT link", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail("pat-used");
    const orgName = generateOrgName("PAT-Used-Test");
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
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({
      organizationId: org.data!.id,
    });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "mcp",
      serverUrl: "https://api.example.com/mcp",
      transport: "streamable-http",
      auth: {
        strategy: {
          type: "api_key",
          viewerScoped: true,
        },
      },
    };

    const createResult = (await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "mcp",
      name: "Test PAT Used Integration",
      authConfig: JSON.stringify(authConfig),
    })) as { createIntegration: { id: string; name: string } };

    const integrationId = createResult.createIntegration.id;

    const patLinkResult = await generatePatLink(cookieJar, integrationId, "test-viewer-used-789");

    const patLinkId = patLinkResult.id;

    // First submission should succeed
    const firstResponse = await fetch(`${API_BASE}/api/pat-link/${patLinkId}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pat: "test-token-first-use" }),
    });
    expect(firstResponse.status).toBe(200);

    // Second submission should fail (link already used)
    const secondResponse = await fetch(`${API_BASE}/api/pat-link/${patLinkId}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pat: "test-token-second-use" }),
    });
    const data = await secondResponse.json();

    expect(secondResponse.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("should reject invalid PAT link on submit", async () => {
    const response = await fetch(`${API_BASE}/api/pat-link/invalid-link-id-456/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pat: "test-token" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("should require pat field on submit", async () => {
    const { client: authClient, cookieJar } = createTestAuthClientWithJar();

    const email = generateTestEmail("pat-required");
    const orgName = generateOrgName("PAT-Required-Test");
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
      slug: generateSlug(orgName),
    });

    await authClient.organization.setActive({
      organizationId: org.data!.id,
    });

    const graphqlClient = createGraphQLClient(cookieJar);

    const authConfig = {
      type: "mcp",
      serverUrl: "https://api.example.com/mcp",
      transport: "streamable-http",
      auth: {
        strategy: {
          type: "api_key",
          viewerScoped: true,
        },
      },
    };

    const createResult = (await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "mcp",
      name: "Test PAT Required Integration",
      authConfig: JSON.stringify(authConfig),
    })) as { createIntegration: { id: string; name: string } };

    const integrationId = createResult.createIntegration.id;

    const patLinkResult = await generatePatLink(
      cookieJar,
      integrationId,
      "test-viewer-required-000"
    );

    const patLinkId = patLinkResult.id;

    // Submit without pat field
    const response = await fetch(`${API_BASE}/api/pat-link/${patLinkId}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });
});
