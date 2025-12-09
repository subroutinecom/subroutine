import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { gql } from "graphql-request";
import { getDefaultAuthContext } from "../fixtures/apikey.ts";
import { makeRequest } from "../fixtures/request.ts";
import { executeTypescript } from "../fixtures/sandbox-execution.ts";
import { createGraphQLClient } from "../utils/graphql-client.ts";

const MOCK_HEADERS: HeadersInit = { "x-use-mock": "true" };

interface Run {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  outputs?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
}

const pollRunCompletion = async (
  runId: string,
  maxAttempts = 40,
  intervalMs = 50
): Promise<Run> => {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await makeRequest({
      hostname: "api.subroutine.internal",
      path: `/api/run/${runId}`,
      method: "GET",
      headers: MOCK_HEADERS,
    });
    const data: { run: Run } = JSON.parse(response.data);
    if (data.run.status === "succeeded" || data.run.status === "failed") {
      return data.run;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Run ${runId} did not complete after ${maxAttempts * intervalMs}ms`);
};

const CREATE_INTEGRATION = gql`
  mutation CreateIntegration($provider: String!, $name: String!, $authConfig: String!) {
    createIntegration(provider: $provider, name: $name, authConfig: $authConfig) {
      id
      provider
      name
    }
  }
`;

describe("Subroutine integrations", { sanitizeOps: false, sanitizeResources: false }, () => {
  it("sandbox supports mock_oauth integration directly", async () => {
    const mockOAuthPayload = [
      {
        id: "test-mock-oauth-integration",
        provider: "mock_oauth",
        name: "Test Mock OAuth",
        authConfig: {
          type: "oauth2",
          clientId: "test-client-id",
          clientSecret: "test-secret",
        },
        account: {
          id: "account-1",
          viewerId: "test-viewer@example.com",
          accountIdentifier: "test-viewer@example.com",
          credentials: {
            accessToken: "mock-access-token",
            refreshToken: "mock-refresh-token",
            expiresAt: Date.now() + 3600000,
            tokenType: "Bearer",
          },
        },
      },
    ];

    const code = `
      export default async function(inputs, { integrations }) {
        const mock = await integrations.getMockOAuth();
        const result = await mock.ping("test-message");
        return result;
      }
    `;

    const { status, result } = await executeTypescript(code, { integrations: mockOAuthPayload });

    expect(status).toBe(200);
    expect(result.success).toBe(true);
    expect((result.result as { echo: string }).echo).toBe("test-message");
    expect((result.result as { viewerId: string }).viewerId).toBe("test-viewer@example.com");
  });

  it("requires OAuth when integration credentials are missing", async () => {
    const authContext = await getDefaultAuthContext();
    const graphqlClient = createGraphQLClient(authContext.cookieJar);

    const authConfig = {
      type: "oauth2",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      scopes: ["https://mail.google.com/"],
      authUrl: "https://example.com/auth",
      tokenUrl: "https://example.com/token",
      redirectUri: "https://subroutine.dev/api/oauth/callback",
    };

    const integrationResult = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "gmail",
      name: `Gmail Integration ${crypto.randomUUID()}`,
      authConfig: JSON.stringify(authConfig),
    });

    const integrationId = integrationResult.createIntegration?.id;
    if (!integrationId) {
      throw new Error("Failed to create test integration");
    }

    const createResponse = await makeRequest(
      {
        hostname: "api.subroutine.internal",
        path: "/api/subroutine",
        method: "POST",
        headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
      },
      JSON.stringify({
        request: "Subroutine that uses Gmail",
        viewerId: "viewer@example.com",
        useMock: true,
        integrations: [integrationId],
      })
    );

    expect(createResponse.status).toBe(201);
    const createData = JSON.parse(createResponse.data);
    const subroutineId = createData.subroutine?.id as string;
    expect(subroutineId).toBeDefined();

    const runResponse = await makeRequest(
      {
        hostname: "api.subroutine.internal",
        path: `/api/subroutine/${subroutineId}/run`,
        method: "POST",
        headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
      },
      JSON.stringify({
        viewerId: "viewer@example.com",
        inputs: {},
      })
    );

    expect(runResponse.status).toBe(403);
    const runData = JSON.parse(runResponse.data);
    expect(runData.error.code).toBe("INTEGRATION_AUTH_REQUIRED");
    expect(runData.error.integrationId).toBe(integrationId);
    expect(typeof runData.error.authorizationUrl).toBe("string");
    expect(runData.error.authorizationUrl).toContain(authConfig.authUrl);
    expect(typeof runData.error.state).toBe("string");
    expect(runData.error.viewerId).toBe("viewer@example.com");
  });

  it("runs subroutine via mock OAuth integration", async () => {
    const authContext = await getDefaultAuthContext();
    const graphqlClient = createGraphQLClient(authContext.cookieJar);

    const authConfig = {
      type: "oauth2",
      clientId: "mock-client-id",
      clientSecret: "mock-secret",
      scopes: [],
      authUrl: "http://api.subroutine.internal/tests/mock_oauth/authorize",
      tokenUrl: "http://api.subroutine.internal/tests/mock_oauth/token",
      redirectUri: "http://api.subroutine.internal/tests/mock_oauth/callback",
    };

    const integrationResult = await graphqlClient.request(CREATE_INTEGRATION, {
      provider: "mock_oauth",
      name: `Mock OAuth Integration ${crypto.randomUUID()}`,
      authConfig: JSON.stringify(authConfig),
    });

    const integrationId = integrationResult.createIntegration?.id;
    if (!integrationId) {
      throw new Error("Failed to create mock OAuth integration");
    }

    const viewerId = `viewer-${crypto.randomUUID()}@example.com`;

    const createResponse = await makeRequest(
      {
        hostname: "api.subroutine.internal",
        path: "/api/subroutine",
        method: "POST",
        headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
      },
      JSON.stringify({
        request: "Subroutine that uses mock integration",
        viewerId,
        useMock: true,
        integrations: [integrationId],
      })
    );

    expect(createResponse.status).toBe(201);
    const createData = JSON.parse(createResponse.data);
    const subroutineId = createData.subroutine?.id as string;
    expect(subroutineId).toBeDefined();

    const initialRun = await makeRequest(
      {
        hostname: "api.subroutine.internal",
        path: `/api/subroutine/${subroutineId}/run`,
        method: "POST",
        headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
      },
      JSON.stringify({
        viewerId,
        inputs: { message: "hello" },
      })
    );

    expect(initialRun.status).toBe(403);
    const initialRunData = JSON.parse(initialRun.data);
    const authorizationUrl = initialRunData.error.authorizationUrl as string;
    expect(authorizationUrl).toContain("/tests/mock_oauth/authorize");

    const authResponse = await fetch(authorizationUrl);
    expect(authResponse.status).toBe(200);
    await authResponse.text(); // Consume response body

    const secondRun = await makeRequest(
      {
        hostname: "api.subroutine.internal",
        path: `/api/subroutine/${subroutineId}/run`,
        method: "POST",
        headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
      },
      JSON.stringify({
        viewerId,
        inputs: { message: "hello" },
        wait: true,
      })
    );

    expect(secondRun.status).toBe(201);
    const secondRunData = JSON.parse(secondRun.data);
    const runId = secondRunData.run?.id as string;
    expect(runId).toBeDefined();

    const completedRun = await pollRunCompletion(runId);
    if (completedRun.status === "failed") {
      throw new Error(`Run failed with error: ${JSON.stringify(completedRun.error, null, 2)}`);
    }
    expect(completedRun.status).toBe("succeeded");
    const outputs = completedRun.outputs as { viewerId?: string; echo?: string };
    expect(outputs?.viewerId).toBe(viewerId);
    expect(outputs?.echo).toBe("hello");
  });
});
