import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

/**
 * MCP Integration Tests
 *
 * Tests the full MCP integration flow:
 * 1. Test MCP server provides tools (runs via PM2 in tests container)
 * 2. Sandbox integration proxy connects to MCP server
 * 3. User code can call MCP tools through the proxy
 *
 * NOTE: The MCP test server runs inside the tests container via PM2.
 * The sandbox connects to it via Docker networking at `tests:3456`.
 */

const TEST_MCP_PORT = 3456;
// MCP server runs in the same container (tests), sandbox connects via Docker network
const MCP_SERVER_HOST_FOR_TESTS = "localhost";
const MCP_SERVER_HOST_FOR_SANDBOX = "tests";
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

/**
 * Creates an MCP integration payload for testing.
 */
const createMcpIntegrationPayload = (options: {
  name: string;
  serverUrl: string;
  authStrategy: { type: "none" } | { type: "api_key"; headerName?: string };
  apiKey?: string;
}) => {
  return [
    {
      id: `mcp-integration-${Date.now()}`,
      provider: "mcp",
      name: options.name,
      authConfig: {
        type: "mcp",
        serverUrl: options.serverUrl,
        transport: "streamable-http",
        authStrategy: options.authStrategy,
        apiKey: options.apiKey,
      },
      mcpConfig: {
        serverUrl: options.serverUrl,
        transport: "streamable-http" as const,
        authStrategy: options.authStrategy,
        apiKey: options.apiKey,
      },
    },
  ];
};

describe("MCP Integration Tests", () => {
  // MCP test server runs as a Docker service - no beforeAll/afterAll needed

  describe("MCP Server Health", () => {
    it("should have test MCP server running", async () => {
      // The MCP test server runs in the same container via PM2
      const response = await fetch(`http://${MCP_SERVER_HOST_FOR_TESTS}:${TEST_MCP_PORT}/health`);
      expect(response.ok).toBe(true);

      const health = await response.json();
      expect(health.status).toBe("ok");
      expect(health.tools).toContain("echo");
      expect(health.tools).toContain("add");
      expect(health.tools).toContain("getAuthInfo");
    });
  });

  describe("MCP Integration Proxy - No Auth", () => {
    it("should connect to MCP server and discover tools", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        const mcp = await integrations.getTestMcp();
        const tools = await mcp._listTools();
        return {
          toolCount: tools.length,
          toolNames: tools.map(t => t.name).sort()
        };
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { toolCount: number; toolNames: string[] };
      expect(data.toolCount).toBeGreaterThanOrEqual(3);
      expect(data.toolNames).toContain("echo");
      expect(data.toolNames).toContain("add");
      expect(data.toolNames).toContain("getAuthInfo");
    });

    it("should call echo tool successfully", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        const mcp = await integrations.getTestMcp();
        const result = await mcp.echo({ message: "Hello from sandbox!" });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.result).toBe("Hello from sandbox!");
    });

    it("should call add tool successfully", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        const mcp = await integrations.getTestMcp();
        const result = await mcp.add({ a: 5, b: 7 });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { result: number };
      expect(data.result).toBe(12);
    });

    it("should call concat tool with array argument", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        const mcp = await integrations.getTestMcp();
        const result = await mcp.concat({ strings: ["a", "b", "c"], separator: "-" });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.result).toBe("a-b-c");
    });

    it("should report no auth when none provided", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        const mcp = await integrations.getTestMcp();
        const authInfo = await mcp.getAuthInfo({});
        return authInfo;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { hasAuth: boolean; tokenPrefix: string | null };
      expect(data.hasAuth).toBe(false);
      expect(data.tokenPrefix).toBeNull();
    });
  });

  describe("MCP Integration Proxy - API Key Auth", () => {
    it("should pass API key in Authorization header", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp-auth",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "api_key" },
        apiKey: TEST_API_KEY,
      });

      const code = `
        const mcp = await integrations.getTestMcpAuth();
        const authInfo = await mcp.getAuthInfo({});
        return authInfo;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { hasAuth: boolean; tokenPrefix: string; tokenLength: number };
      expect(data.hasAuth).toBe(true);
      expect(data.tokenPrefix).toBe(TEST_API_KEY.substring(0, 20));
      expect(data.tokenLength).toBe(TEST_API_KEY.length);
    });

    it("should work with tools when API key auth is configured", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp-auth",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "api_key" },
        apiKey: TEST_API_KEY,
      });

      const code = `
        const mcp = await integrations.getTestMcpAuth();
        const echoResult = await mcp.echo({ message: "authenticated!" });
        const addResult = await mcp.add({ a: 10, b: 20 });
        return { echo: echoResult, add: addResult };
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { echo: string; add: { result: number } };
      expect(data.echo).toBe("authenticated!");
      expect(data.add.result).toBe(30);
    });
  });

  describe("MCP Integration - Multiple Calls", () => {
    it("should handle multiple sequential tool calls", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        const mcp = await integrations.getTestMcp();

        const results = [];
        for (let i = 1; i <= 5; i++) {
          const result = await mcp.add({ a: i, b: i });
          results.push(result.result);
        }

        return results;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.result).toEqual([2, 4, 6, 8, 10]);
    });

    it("should handle concurrent tool calls", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        const mcp = await integrations.getTestMcp();

        const results = await Promise.all([
          mcp.echo({ message: "one" }),
          mcp.echo({ message: "two" }),
          mcp.echo({ message: "three" }),
        ]);

        return results;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.result).toEqual(["one", "two", "three"]);
    });
  });

  describe("MCP Integration - Error Handling", () => {
    it("should handle tool errors gracefully", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        const mcp = await integrations.getTestMcp();

        try {
          await mcp.throwError({ message: "Test error from tool" });
          return { caught: false };
        } catch (error) {
          return {
            caught: true,
            message: error.message,
            includesToolName: error.message.includes("throwError")
          };
        }
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { caught: boolean; message: string; includesToolName: boolean };
      expect(data.caught).toBe(true);
      expect(data.message).toContain("Test error from tool");
    });

    it("should handle non-existent tool calls", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        const mcp = await integrations.getTestMcp();

        try {
          await mcp.nonExistentTool({ foo: "bar" });
          return { caught: false };
        } catch (error) {
          return { caught: true, message: error.message };
        }
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { caught: boolean; message: string };
      expect(data.caught).toBe(true);
    });

    it("should fail gracefully when MCP server is unreachable", async () => {
      const payload = createMcpIntegrationPayload({
        name: "unreachable-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:59999/mcp`, // Non-existent port
        authStrategy: { type: "none" },
      });

      const code = `
        try {
          const mcp = await integrations.getUnreachableMcp();
          return { connected: true };
        } catch (error) {
          return { connected: false, error: error.message };
        }
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      // The execution itself succeeds, but getting the integration should fail
      expect(result.success).toBe(true);

      const data = result.result as { connected: boolean; error?: string };
      expect(data.connected).toBe(false);
      expect(data.error).toBeTruthy();
    });
  });

  describe("MCP Integration - Getter Name Generation", () => {
    it("should generate correct getter name from integration name", async () => {
      const payload = createMcpIntegrationPayload({
        name: "my-cool-mcp-server",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        // The getter name should be getMyCoolMcpServer based on the name
        const mcp = await integrations.getMyCoolMcpServer();
        const result = await mcp.echo({ message: "getter test" });
        return result;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.result).toBe("getter test");
    });
  });
});
