import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

/**
 * OpenAPI Integration Tests
 *
 * Tests the full OpenAPI integration flow:
 * 1. Test OpenAPI server provides REST endpoints (runs via PM2 in tests container)
 * 2. Sandbox integration proxy connects to OpenAPI server
 * 3. User code can execute REST API calls through the proxy
 *
 * NOTE: The OpenAPI test server runs inside the tests container via PM2.
 * The sandbox connects to it via Docker networking at `tests:3458`.
 */

const TEST_OPENAPI_PORT = 3458;
// OpenAPI server runs in the same container (tests), sandbox connects via Docker network
const OPENAPI_SERVER_HOST_FOR_TESTS = "localhost";
const OPENAPI_SERVER_HOST_FOR_SANDBOX = "tests";
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
  const wrappedCode = "\nexport default async function(inputs, { integrations }) {\n  " + code + "\n}\n";

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
 * Creates an OpenAPI integration payload for testing.
 */
const createOpenAPIIntegrationPayload = (options: {
  name: string;
  baseUrl: string;
  authStrategy: AuthStrategy;
  apiKey?: string;
  accessToken?: string;
  spec?: string;
  specVersion?: "3.0" | "3.1";
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
      id: `openapi-integration-${Date.now()}`,
      provider: "openapi",
      name: options.name,
      authConfig: {
        type: "openapi",
        baseUrl: options.baseUrl,
        auth: {
          strategy: options.authStrategy,
          apiKey: options.apiKey,
        },
        spec: options.spec,
        specVersion: options.specVersion,
      },
      openapiConfig: {
        baseUrl: options.baseUrl,
        authHeaders,
        spec: options.spec,
        specVersion: options.specVersion,
      },
    },
  ];
};

describe("OpenAPI Integration Tests", { sanitizeOps: false, sanitizeResources: false }, () => {
  describe("OpenAPI Server Health", () => {
    it("should have test OpenAPI server running", async () => {
      const response = await fetch(
        `http://${OPENAPI_SERVER_HOST_FOR_TESTS}:${TEST_OPENAPI_PORT}/health`
      );
      expect(response.ok).toBe(true);

      const health = await response.json();
      expect(health.status).toBe("ok");
      expect(health.endpoints).toContain("/echo");
      expect(health.endpoints).toContain("/add");
      expect(health.endpoints).toContain("/auth-info");
      expect(health.endpoints).toContain("/users");
    });

    it("should serve OpenAPI spec", async () => {
      const response = await fetch(
        `http://${OPENAPI_SERVER_HOST_FOR_TESTS}:${TEST_OPENAPI_PORT}/openapi.json`
      );
      expect(response.ok).toBe(true);

      const spec = await response.json();
      expect(spec.openapi).toBe("3.0.3");
      expect(spec.info.title).toBe("Test REST API");
      expect(spec.paths["/echo"]).toBeDefined();
      expect(spec.paths["/users"]).toBeDefined();
    });
  });

  describe("OpenAPI Integration Proxy - No Auth", () => {
    it("should execute GET request with query parameters", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("GET", "/echo", { message: "Hello from sandbox!" });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { message: string };
      expect(data.message).toBe("Hello from sandbox!");
    });

    it("should execute GET request with multiple query parameters", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("GET", "/add", { a: 5, b: 7 });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { result: number; a: number; b: number };
      expect(data.result).toBe(12);
      expect(data.a).toBe(5);
      expect(data.b).toBe(7);
    });

    it("should execute GET request with path parameter", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("GET", "/users/{userId}", { userId: "user-1" });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { id: string; name: string; email: string };
      expect(data.id).toBe("user-1");
      expect(data.name).toBe("Alice");
      expect(data.email).toBe("alice@example.com");
    });

    it("should execute POST request with body", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("POST", "/users", {}, { name: "Charlie", email: "charlie@example.com" });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { id: string; name: string; email: string };
      expect(data.name).toBe("Charlie");
      expect(data.email).toBe("charlie@example.com");
      expect(data.id).toBeDefined();
    });

    it("should execute PUT request with path parameter and body", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("PUT", "/users/{userId}", { userId: "user-2" }, { name: "Robert" });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { id: string; name: string; email: string };
      expect(data.id).toBe("user-2");
      expect(data.name).toBe("Robert");
    });

    it("should execute GET request with pagination parameters", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("GET", "/users", { limit: 10, offset: 0 });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { users: Array<{ id: string }>; total: number };
      expect(data.users).toBeDefined();
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.total).toBeGreaterThan(0);
    });

    it("should report no auth when none provided", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("GET", "/auth-info");
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { hasAuth: boolean };
      expect(data.hasAuth).toBe(false);
    });
  });

  describe("OpenAPI Integration Proxy - API Key Auth", () => {
    it("should pass API key in custom header", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "api_key", headerName: "X-API-Key" },
        apiKey: TEST_API_KEY,
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("GET", "/auth-info");
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        hasAuth: boolean;
        customHeaders: Array<{ name: string; value: string }>;
      };
      // X-API-Key is a custom header, not Authorization
      const apiKeyHeader = data.customHeaders.find(
        (h) => h.name.toLowerCase() === "x-api-key"
      );
      expect(apiKeyHeader).toBeDefined();
      expect(apiKeyHeader!.value).toBe(TEST_API_KEY);
    });

    it("should pass API key in Authorization header as Bearer token", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "api_key" }, // defaults to Authorization header
        apiKey: TEST_API_KEY,
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("GET", "/auth-info");
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        hasAuth: boolean;
        authType: string;
        tokenPrefix: string;
        tokenLength: number;
      };
      expect(data.hasAuth).toBe(true);
      expect(data.authType).toBe("bearer");
      expect(data.tokenPrefix).toBe(TEST_API_KEY.substring(0, 20));
    });
  });

  describe("OpenAPI Integration Proxy - Bearer OAuth", () => {
    it("should pass viewer access token in Authorization header", async () => {
      const viewerAccessToken = "viewer-oauth-access-token-xyz789";
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "bearer_oauth" },
        accessToken: viewerAccessToken,
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("GET", "/auth-info");
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        hasAuth: boolean;
        authType: string;
        tokenPrefix: string;
        tokenLength: number;
      };
      expect(data.hasAuth).toBe(true);
      expect(data.authType).toBe("bearer");
      expect(data.tokenPrefix).toBe(viewerAccessToken.substring(0, 20));
      expect(data.tokenLength).toBe(viewerAccessToken.length);
    });
  });

  describe("OpenAPI Integration Proxy - Custom Headers", () => {
    it("should pass custom headers", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: {
          type: "custom_headers",
          headers: {
            "X-Custom-Auth": "custom-secret-value",
            "X-Tenant-ID": "tenant-123",
          },
        },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const result = await client.request("GET", "/auth-info");
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        hasAuth: boolean;
        customHeaders: Array<{ name: string; value: string }>;
      };

      const customAuthHeader = data.customHeaders.find(
        (h) => h.name.toLowerCase() === "x-custom-auth"
      );
      const tenantHeader = data.customHeaders.find(
        (h) => h.name.toLowerCase() === "x-tenant-id"
      );

      expect(customAuthHeader).toBeDefined();
      expect(customAuthHeader!.value).toBe("custom-secret-value");
      expect(tenantHeader).toBeDefined();
      expect(tenantHeader!.value).toBe("tenant-123");
    });
  });

  describe("OpenAPI Integration - Error Handling", () => {
    it("should handle 404 errors gracefully", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        try {
          await client.request("GET", "/users/{userId}", { userId: "nonexistent-user" });
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
      expect(data.error).toContain("404");
    });

    it("should fail gracefully when OpenAPI server is unreachable", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: "http://nonexistent-server:9999",
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        try {
          await client.request("GET", "/echo", { message: "test" });
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

  describe("OpenAPI Integration - Client Access by Name", () => {
    it("should access OpenAPI client by integration name", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "my-custom-rest-api",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        const client = await integrations.getOpenAPIClient("my-custom-rest-api");
        const result = await client.request("GET", "/echo", { message: "test" });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { message: string };
      expect(data.message).toBe("test");
    });

    it("should throw clear error for non-existent integration name", async () => {
      const payload = createOpenAPIIntegrationPayload({
        name: "existing-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const code = `
        try {
          await integrations.getOpenAPIClient("nonexistent-openapi");
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
      expect(data.error).toContain("nonexistent-openapi");
      expect(data.error).toContain("not found");
    });
  });

  describe("OpenAPI Integration - Multiple Integrations", () => {
    it("should handle multiple OpenAPI integrations", async () => {
      const payload = [
        ...createOpenAPIIntegrationPayload({
          name: "openapi-api-1",
          baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
          authStrategy: { type: "none" },
        }),
        ...createOpenAPIIntegrationPayload({
          name: "openapi-api-2",
          baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
          authStrategy: { type: "api_key", headerName: "X-API-Key" },
          apiKey: "different-api-key",
        }),
      ];

      const code = `
        const client1 = await integrations.getOpenAPIClient("openapi-api-1");
        const client2 = await integrations.getOpenAPIClient("openapi-api-2");

        const [result1, result2] = await Promise.all([
          client1.request("GET", "/echo", { message: "from api 1" }),
          client2.request("GET", "/auth-info"),
        ]);

        return { result1, result2 };
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as {
        result1: { message: string };
        result2: { customHeaders: Array<{ name: string; value: string }> };
      };

      expect(data.result1.message).toBe("from api 1");
      const apiKeyHeader = data.result2.customHeaders.find(
        (h) => h.name.toLowerCase() === "x-api-key"
      );
      expect(apiKeyHeader?.value).toBe("different-api-key");
    });
  });

  describe("OpenAPI Integration - HTTP Methods", () => {
    it("should support DELETE request", async () => {
      // First create a user to delete
      const createPayload = createOpenAPIIntegrationPayload({
        name: "test-openapi",
        baseUrl: `http://${OPENAPI_SERVER_HOST_FOR_SANDBOX}:${TEST_OPENAPI_PORT}`,
        authStrategy: { type: "none" },
      });

      const createCode = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        const user = await client.request("POST", "/users", {}, { name: "ToDelete", email: "delete@test.com" });
        return user;
      `;

      const createResult = await executeTypescript(createCode, createPayload);
      expect(createResult.result.success).toBe(true);
      const createdUser = createResult.result.result as { id: string };

      // Now delete the user
      const deleteCode = `
        const client = await integrations.getOpenAPIClient("test-openapi");
        try {
          await client.request("DELETE", "/users/{userId}", { userId: "${createdUser.id}" });
          // Verify it's deleted by trying to get it
          await client.request("GET", "/users/{userId}", { userId: "${createdUser.id}" });
          return { deleted: false };
        } catch (e) {
          // Should get 404 when trying to fetch deleted user
          return { deleted: true, error: e.message };
        }
      `;

      const { status, result } = await executeTypescript(deleteCode, createPayload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { deleted: boolean };
      expect(data.deleted).toBe(true);
    });
  });
});
