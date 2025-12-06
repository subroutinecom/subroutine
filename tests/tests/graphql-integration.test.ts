import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

/**
 * GraphQL Integration Tests
 *
 * Tests the full GraphQL integration flow:
 * 1. Test GraphQL server provides queries (runs via PM2 in tests container)
 * 2. Sandbox integration proxy connects to GraphQL server
 * 3. User code can execute GraphQL queries through the proxy
 *
 * NOTE: The GraphQL test server runs inside the tests container via PM2.
 * The sandbox connects to it via Docker networking at `tests:3457`.
 */

const TEST_GRAPHQL_PORT = 3457;
// GraphQL server runs in the same container (tests), sandbox connects via Docker network
const GRAPHQL_SERVER_HOST_FOR_TESTS = "localhost";
const GRAPHQL_SERVER_HOST_FOR_SANDBOX = "tests";
const TEST_API_KEY = "test-secret-api-key-12345";

interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

interface TestResponse {
  status: number;
  data: string;
}

const makeRequest = (
  options: {
    hostname: string;
    port?: number;
    path: string;
    method?: string;
    headers?: HeadersInit;
  },
  data?: string
): Promise<TestResponse> => {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://${options.hostname}`);
    if (options.port) {
      url.port = options.port.toString();
    }
    url.pathname = options.path;

    const req = new Request(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: data,
    });

    fetch(req)
      .then(async (res) => {
        const body = await res.text();
        resolve({ status: res.status, data: body });
      })
      .catch((error) => {
        reject(error);
      });
  });
};

const executeTypescript = async (
  code: string,
  integrations?: unknown
): Promise<{ status: number; result: ExecutionResult }> => {
  const wrappedCode = "\nexport default async function() {\n  " + code + "\n}\n";

  const response = await makeRequest(
    {
      hostname: "sandbox",
      path: "/test/executeTypescript",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ code: wrappedCode, integrations })
  );

  return {
    status: response.status,
    result: JSON.parse(response.data),
  };
};

type AuthStrategy =
  | { type: "none" }
  | { type: "api_key"; headerName?: string; viewerScoped?: boolean }
  | { type: "bearer_oauth" }
  | { type: "custom_headers"; headers: Record<string, string> };

/**
 * Creates a GraphQL integration payload for testing.
 */
const createGraphQLIntegrationPayload = (options: {
  name: string;
  endpoint: string;
  authStrategy: AuthStrategy;
  apiKey?: string;
  accessToken?: string;
}) => {
  // Build auth headers based on strategy
  let authHeaders: Record<string, string> = {};

  switch (options.authStrategy.type) {
    case "none":
      break;
    case "api_key": {
      const key = options.authStrategy.viewerScoped
        ? options.accessToken
        : options.apiKey;
      if (key) {
        const headerName = options.authStrategy.headerName ?? "Authorization";
        if (headerName.toLowerCase() === "authorization") {
          authHeaders[headerName] = `Bearer ${key}`;
        } else {
          authHeaders[headerName] = key;
        }
      }
      break;
    }
    case "bearer_oauth":
      if (options.accessToken) {
        authHeaders["Authorization"] = `Bearer ${options.accessToken}`;
      }
      break;
    case "custom_headers":
      authHeaders = options.authStrategy.headers;
      break;
  }

  return [
    {
      id: `graphql-integration-${Date.now()}`,
      provider: "graphql",
      name: options.name,
      authConfig: {
        type: "graphql",
        endpoint: options.endpoint,
        auth: {
          strategy: options.authStrategy,
          apiKey: options.apiKey,
        },
      },
      graphqlConfig: {
        endpoint: options.endpoint,
        authHeaders,
      },
    },
  ];
};

describe("GraphQL Integration Tests", { sanitizeOps: false, sanitizeResources: false }, () => {
  describe("GraphQL Server Health", () => {
    it("should have test GraphQL server running", async () => {
      const response = await fetch(
        `http://${GRAPHQL_SERVER_HOST_FOR_TESTS}:${TEST_GRAPHQL_PORT}/health`
      );
      expect(response.ok).toBe(true);

      const health = await response.json();
      expect(health.status).toBe("ok");
      expect(health.queries).toContain("echo");
      expect(health.queries).toContain("add");
      expect(health.queries).toContain("getAuthInfo");
    });
  });

  describe("GraphQL Integration Proxy - No Auth", () => {
    it("should execute echo query", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        const result = await client.request(\`
          query Echo($message: String!) {
            echo(message: $message)
          }
        \`, { message: "Hello from sandbox!" });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { echo: string };
      expect(data.echo).toBe("Hello from sandbox!");
    });

    it("should execute add query", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        const result = await client.request(\`
          query Add($a: Int!, $b: Int!) {
            add(a: $a, b: $b) {
              result
              a
              b
            }
          }
        \`, { a: 5, b: 7 });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { add: { result: number; a: number; b: number } };
      expect(data.add.result).toBe(12);
      expect(data.add.a).toBe(5);
      expect(data.add.b).toBe(7);
    });

    it("should execute concat query with array argument", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        const result = await client.request(\`
          query Concat($strings: [String!]!, $separator: String) {
            concat(strings: $strings, separator: $separator)
          }
        \`, { strings: ["Hello", "World", "GraphQL"], separator: " " });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { concat: string };
      expect(data.concat).toBe("Hello World GraphQL");
    });

    it("should execute mutation", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        const result = await client.request(\`
          mutation CreateItem($name: String!, $value: Int!) {
            createItem(name: $name, value: $value) {
              id
              name
              value
              createdAt
            }
          }
        \`, { name: "Test Item", value: 42 });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { createItem: { id: string; name: string; value: number } };
      expect(data.createItem.name).toBe("Test Item");
      expect(data.createItem.value).toBe(42);
      expect(data.createItem.id).toBeDefined();
    });

    it("should report no auth when none provided", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        const result = await client.request(\`
          query {
            getAuthInfo {
              hasAuth
              authType
              tokenPrefix
              tokenLength
            }
          }
        \`);
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { getAuthInfo: { hasAuth: boolean } };
      expect(data.getAuthInfo.hasAuth).toBe(false);
    });
  });

  describe("GraphQL Integration Proxy - API Key Auth", () => {
    it("should pass API key in custom header", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "api_key", headerName: "X-API-Key" },
        apiKey: TEST_API_KEY,
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        const result = await client.request(\`
          query {
            getAuthInfo {
              hasAuth
              customHeaders {
                name
                value
              }
            }
          }
        \`);
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        getAuthInfo: {
          hasAuth: boolean;
          customHeaders: Array<{ name: string; value: string }>;
        };
      };
      // X-API-Key is a custom header, not Authorization
      const apiKeyHeader = data.getAuthInfo.customHeaders.find(
        (h) => h.name.toLowerCase() === "x-api-key"
      );
      expect(apiKeyHeader).toBeDefined();
      expect(apiKeyHeader!.value).toBe(TEST_API_KEY);
    });

    it("should pass API key in Authorization header as Bearer token", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "api_key" }, // defaults to Authorization header
        apiKey: TEST_API_KEY,
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        const result = await client.request(\`
          query {
            getAuthInfo {
              hasAuth
              authType
              tokenPrefix
              tokenLength
            }
          }
        \`);
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        getAuthInfo: {
          hasAuth: boolean;
          authType: string;
          tokenPrefix: string;
          tokenLength: number;
        };
      };
      expect(data.getAuthInfo.hasAuth).toBe(true);
      expect(data.getAuthInfo.authType).toBe("bearer");
      expect(data.getAuthInfo.tokenPrefix).toBe(TEST_API_KEY.substring(0, 20));
    });
  });

  describe("GraphQL Integration Proxy - Bearer OAuth", () => {
    it("should pass viewer access token in Authorization header", async () => {
      const viewerAccessToken = "viewer-oauth-access-token-xyz789";
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "bearer_oauth" },
        accessToken: viewerAccessToken,
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        const result = await client.request(\`
          query {
            getAuthInfo {
              hasAuth
              authType
              tokenPrefix
              tokenLength
            }
          }
        \`);
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        getAuthInfo: {
          hasAuth: boolean;
          authType: string;
          tokenPrefix: string;
          tokenLength: number;
        };
      };
      expect(data.getAuthInfo.hasAuth).toBe(true);
      expect(data.getAuthInfo.authType).toBe("bearer");
      expect(data.getAuthInfo.tokenPrefix).toBe(viewerAccessToken.substring(0, 20));
      expect(data.getAuthInfo.tokenLength).toBe(viewerAccessToken.length);
    });
  });

  describe("GraphQL Integration Proxy - Custom Headers", () => {
    it("should pass custom headers", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: {
          type: "custom_headers",
          headers: {
            "X-Custom-Auth": "custom-secret-value",
            "X-Tenant-ID": "tenant-123",
          },
        },
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        const result = await client.request(\`
          query {
            getAuthInfo {
              hasAuth
              customHeaders {
                name
                value
              }
            }
          }
        \`);
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        getAuthInfo: {
          hasAuth: boolean;
          customHeaders: Array<{ name: string; value: string }>;
        };
      };

      const customAuthHeader = data.getAuthInfo.customHeaders.find(
        (h) => h.name.toLowerCase() === "x-custom-auth"
      );
      const tenantHeader = data.getAuthInfo.customHeaders.find(
        (h) => h.name.toLowerCase() === "x-tenant-id"
      );

      expect(customAuthHeader).toBeDefined();
      expect(customAuthHeader!.value).toBe("custom-secret-value");
      expect(tenantHeader).toBeDefined();
      expect(tenantHeader!.value).toBe("tenant-123");
    });
  });

  describe("GraphQL Integration - Error Handling", () => {
    it("should handle GraphQL errors gracefully", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "none" },
      });

      // Query a non-existent field
      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        try {
          await client.request(\`
            query {
              nonExistentField
            }
          \`);
          return { error: "Should have thrown" };
        } catch (e) {
          return { error: e.message, hasError: true };
        }
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { error: string; hasError: boolean };
      expect(data.hasError).toBe(true);
      expect(data.error).toContain("nonExistentField");
    });

    it("should fail gracefully when GraphQL server is unreachable", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "test-graphql",
        endpoint: "http://nonexistent-server:9999/graphql",
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getGraphQLClient("test-graphql");
        try {
          await client.request(\`query { echo(message: "test") }\`);
          return { error: "Should have thrown" };
        } catch (e) {
          return { error: e.message, hasError: true };
        }
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { error: string; hasError: boolean };
      expect(data.hasError).toBe(true);
    });
  });

  describe("GraphQL Integration - Client Access by Name", () => {
    it("should access GraphQL client by integration name", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "my-custom-graphql-api",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getGraphQLClient("my-custom-graphql-api");
        const result = await client.request(\`
          query Greet($name: String!, $excited: Boolean) {
            greet(name: $name, excited: $excited)
          }
        \`, { name: "GraphQL", excited: true });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { greet: string };
      expect(data.greet).toBe("Hello, GraphQL!!!");
    });

    it("should throw clear error for non-existent integration name", async () => {
      const payload = createGraphQLIntegrationPayload({
        name: "existing-graphql",
        endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
        authStrategy: { type: "none" },
      });

      const code = `
        try {
          await integrations.getGraphQLClient("nonexistent-graphql");
          return { error: "Should have thrown" };
        } catch (e) {
          return { error: e.message, hasError: true };
        }
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { error: string; hasError: boolean };
      expect(data.hasError).toBe(true);
      expect(data.error).toContain("nonexistent-graphql");
      expect(data.error).toContain("not found");
    });
  });

  describe("GraphQL Integration - Multiple Integrations", () => {
    it("should handle multiple GraphQL integrations", async () => {
      const payload = [
        ...createGraphQLIntegrationPayload({
          name: "graphql-api-1",
          endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
          authStrategy: { type: "none" },
        }),
        ...createGraphQLIntegrationPayload({
          name: "graphql-api-2",
          endpoint: `http://${GRAPHQL_SERVER_HOST_FOR_SANDBOX}:${TEST_GRAPHQL_PORT}/graphql`,
          authStrategy: { type: "api_key", headerName: "X-API-Key" },
          apiKey: "different-api-key",
        }),
      ];

      const code = `
        const client1 = await integrations.getGraphQLClient("graphql-api-1");
        const client2 = await integrations.getGraphQLClient("graphql-api-2");

        const [result1, result2] = await Promise.all([
          client1.request(\`query { echo(message: "from api 1") }\`),
          client2.request(\`query { getAuthInfo { customHeaders { name value } } }\`),
        ]);

        return { result1, result2 };
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        result1: { echo: string };
        result2: { getAuthInfo: { customHeaders: Array<{ name: string; value: string }> } };
      };

      expect(data.result1.echo).toBe("from api 1");
      const apiKeyHeader = data.result2.getAuthInfo.customHeaders.find(
        (h) => h.name.toLowerCase() === "x-api-key"
      );
      expect(apiKeyHeader?.value).toBe("different-api-key");
    });
  });
});
