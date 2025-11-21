import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { gql } from "graphql-request";
import { getDefaultAuthContext } from "../fixtures/apikey.ts";
import { makeRequest } from "../fixtures/request.ts";
import { createGraphQLClient } from "../utils/graphql-client.ts";

const MOCK_HEADERS: HeadersInit = { "x-use-mock": "true" };

interface Run {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  outputs?: Record<string, unknown> | null;
}

const pollRunCompletion = async (
  runId: string,
  maxAttempts = 40,
  intervalMs = 50
): Promise<Run> => {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await makeRequest({
      hostname: "api",
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
        hostname: "api",
        path: "/api/subroutine",
        method: "POST",
        headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
      },
      JSON.stringify({
        request: "Subroutine that uses Gmail",
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
        hostname: "api",
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
      authUrl: "http://api/tests/mock_oauth/authorize",
      tokenUrl: "http://api/tests/mock_oauth/token",
      redirectUri: "http://api/tests/mock_oauth/callback",
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

    const createResponse = await makeRequest(
      {
        hostname: "api",
        path: "/api/subroutine",
        method: "POST",
        headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
      },
      JSON.stringify({
        request: "Subroutine that uses mock integration",
        useMock: true,
        integrations: [integrationId],
      })
    );

    expect(createResponse.status).toBe(201);
    const createData = JSON.parse(createResponse.data);
    const subroutineId = createData.subroutine?.id as string;
    expect(subroutineId).toBeDefined();

    const viewerId = `viewer-${crypto.randomUUID()}@example.com`;
    const initialRun = await makeRequest(
      {
        hostname: "api",
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

    const secondRun = await makeRequest(
      {
        hostname: "api",
        path: `/api/subroutine/${subroutineId}/run`,
        method: "POST",
        headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
      },
      JSON.stringify({
        viewerId,
        inputs: { message: "hello" },
        wait: false,
      })
    );

    expect(secondRun.status).toBe(201);
    const secondRunData = JSON.parse(secondRun.data);
    const runId = secondRunData.run?.id as string;
    expect(runId).toBeDefined();

    const completedRun = await pollRunCompletion(runId);
    expect(completedRun.status).toBe("succeeded");
    const outputs = completedRun.outputs as { viewerId?: string; echo?: string };
    expect(outputs?.viewerId).toBe(viewerId);
    expect(outputs?.echo).toBe("hello");
  });
});
