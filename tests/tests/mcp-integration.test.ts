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

type AuthStrategy =
  | { type: "none" }
  | { type: "api_key"; headerName?: string }
  | { type: "bearer_oauth" };

/**
 * Creates an MCP integration payload for testing.
 */
const createMcpIntegrationPayload = (options: {
  name: string;
  serverUrl: string;
  authStrategy: AuthStrategy;
  apiKey?: string;
  accessToken?: string;
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
        auth: {
          strategy: options.authStrategy,
          apiKey: options.apiKey,
        },
      },
      mcpConfig: {
        serverUrl: options.serverUrl,
        transport: "streamable-http" as const,
        authStrategy: options.authStrategy,
        apiKey: options.apiKey,
        accessToken: options.accessToken,
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
        const mcp = await integrations.getMcpClient("test-mcp");
        const { tools } = await mcp.listTools();
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
        const mcp = await integrations.getMcpClient("test-mcp");
        const result = await mcp.callTool({ name: "echo", arguments: { message: "Hello from sandbox!" } });
        // Echo returns raw text, not JSON
        return result.content[0]?.text;
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
        const mcp = await integrations.getMcpClient("test-mcp");
        const result = await mcp.callTool({ name: "add", arguments: { a: 5, b: 7 } });
        // Parse text content from MCP response
        const text = result.content[0]?.text;
        return JSON.parse(text);
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
        const mcp = await integrations.getMcpClient("test-mcp");
        const result = await mcp.callTool({ name: "concat", arguments: { strings: ["a", "b", "c"], separator: "-" } });
        // Concat returns raw text, not JSON
        return result.content[0]?.text;
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
        const mcp = await integrations.getMcpClient("test-mcp");
        const result = await mcp.callTool({ name: "getAuthInfo", arguments: {} });
        // Parse text content from MCP response
        const text = result.content[0]?.text;
        return JSON.parse(text);
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
        const mcp = await integrations.getMcpClient("test-mcp-auth");
        const result = await mcp.callTool({ name: "getAuthInfo", arguments: {} });
        const text = result.content[0]?.text;
        return JSON.parse(text);
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
        const mcp = await integrations.getMcpClient("test-mcp-auth");
        const echoResult = await mcp.callTool({ name: "echo", arguments: { message: "authenticated!" } });
        const addResult = await mcp.callTool({ name: "add", arguments: { a: 10, b: 20 } });
        return {
          echo: echoResult.content[0]?.text,  // echo returns raw text
          add: JSON.parse(addResult.content[0]?.text)  // add returns JSON
        };
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { echo: string; add: { result: number } };
      expect(data.echo).toBe("authenticated!");
      expect(data.add.result).toBe(30);
    });
  });

  describe("MCP Integration Proxy - Bearer Passthrough (Viewer-Scoped OAuth)", () => {
    const VIEWER_ACCESS_TOKEN = "viewer-oauth-access-token-abc123xyz";

    it("should pass viewer's access token in Authorization header", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp-oauth",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "bearer_oauth" },
        accessToken: VIEWER_ACCESS_TOKEN,
      });

      const code = `
        const mcp = await integrations.getMcpClient("test-mcp-oauth");
        const result = await mcp.callTool({ name: "getAuthInfo", arguments: {} });
        const text = result.content[0]?.text;
        return JSON.parse(text);
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { hasAuth: boolean; tokenPrefix: string; tokenLength: number };
      expect(data.hasAuth).toBe(true);
      expect(data.tokenPrefix).toBe(VIEWER_ACCESS_TOKEN.substring(0, 20));
      expect(data.tokenLength).toBe(VIEWER_ACCESS_TOKEN.length);
    });

    it("should work with tools when bearer passthrough auth is configured", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp-oauth",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "bearer_oauth" },
        accessToken: VIEWER_ACCESS_TOKEN,
      });

      const code = `
        const mcp = await integrations.getMcpClient("test-mcp-oauth");
        const echoResult = await mcp.callTool({ name: "echo", arguments: { message: "authenticated with oauth!" } });
        const addResult = await mcp.callTool({ name: "add", arguments: { a: 100, b: 200 } });
        return {
          echo: echoResult.content[0]?.text,  // echo returns raw text
          add: JSON.parse(addResult.content[0]?.text)  // add returns JSON
        };
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { echo: string; add: { result: number } };
      expect(data.echo).toBe("authenticated with oauth!");
      expect(data.add.result).toBe(300);
    });

    it("should fail when bearer passthrough is configured but no access token provided", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp-oauth-notoken",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "bearer_oauth" },
        // No accessToken provided - simulating a viewer without connected account
      });

      const code = `
        try {
          const mcp = await integrations.getMcpClient("test-mcp-oauth-notoken");
          return { error: false };
        } catch (error) {
          return { error: true, message: error.message };
        }
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { error: boolean; message?: string };
      expect(data.error).toBe(true);
      // The error should mention bearer_oauth requiring accessToken
      expect(data.message).toContain("accessToken");
    });

    it("should use different tokens for different viewer sessions", async () => {
      const viewer1Token = "viewer1-token-aaa111";
      const viewer2Token = "viewer2-token-bbb222";

      // Simulate two different viewers accessing the same MCP integration
      const payload1 = createMcpIntegrationPayload({
        name: "test-mcp-viewer1",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "bearer_oauth" },
        accessToken: viewer1Token,
      });

      const payload2 = createMcpIntegrationPayload({
        name: "test-mcp-viewer2",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "bearer_oauth" },
        accessToken: viewer2Token,
      });

      const code1 = `
        const mcp = await integrations.getMcpClient("test-mcp-viewer1");
        const result = await mcp.callTool({ name: "getAuthInfo", arguments: {} });
        const text = result.content[0]?.text;
        return JSON.parse(text);
      `;

      const code2 = `
        const mcp = await integrations.getMcpClient("test-mcp-viewer2");
        const result = await mcp.callTool({ name: "getAuthInfo", arguments: {} });
        const text = result.content[0]?.text;
        return JSON.parse(text);
      `;

      const [result1, result2] = await Promise.all([
        executeTypescript(code1, payload1),
        executeTypescript(code2, payload2),
      ]);

      expect(result1.status).toBe(200);
      expect(result1.result.success).toBe(true);
      expect(result2.status).toBe(200);
      expect(result2.result.success).toBe(true);

      const data1 = result1.result.result as { tokenPrefix: string };
      const data2 = result2.result.result as { tokenPrefix: string };

      // Each viewer should see their own token
      expect(data1.tokenPrefix).toBe(viewer1Token.substring(0, 20));
      expect(data2.tokenPrefix).toBe(viewer2Token.substring(0, 20));
      expect(data1.tokenPrefix).not.toBe(data2.tokenPrefix);
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
        const mcp = await integrations.getMcpClient("test-mcp");

        const results = [];
        for (let i = 1; i <= 5; i++) {
          const result = await mcp.callTool({ name: "add", arguments: { a: i, b: i } });
          const parsed = JSON.parse(result.content[0]?.text);
          results.push(parsed.result);
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
        const mcp = await integrations.getMcpClient("test-mcp");

        const results = await Promise.all([
          mcp.callTool({ name: "echo", arguments: { message: "one" } }),
          mcp.callTool({ name: "echo", arguments: { message: "two" } }),
          mcp.callTool({ name: "echo", arguments: { message: "three" } }),
        ]);

        // Echo returns raw text, not JSON
        return results.map(r => r.content[0]?.text);
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
        const mcp = await integrations.getMcpClient("test-mcp");

        const result = await mcp.callTool({ name: "throwError", arguments: { message: "Test error from tool" } });
        // The MCP SDK returns isError: true for tool errors
        if (result.isError) {
          const errorText = result.content[0]?.text || "Unknown error";
          return {
            caught: true,
            message: errorText,
            isError: result.isError
          };
        }
        return { caught: false };
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { caught: boolean; message: string; isError: boolean };
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
        const mcp = await integrations.getMcpClient("test-mcp");

        try {
          const result = await mcp.callTool({ name: "nonExistentTool", arguments: { foo: "bar" } });
          // MCP SDK may return error in result instead of throwing
          if (result.isError) {
            return { isError: true, errorContent: result.content };
          }
          return { isError: false, result };
        } catch (error) {
          return { threw: true, message: error.message };
        }
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { isError?: boolean; threw?: boolean; message?: string };
      // Either the SDK throws or returns isError: true
      expect(data.isError || data.threw).toBe(true);
    });

    it("should fail gracefully when MCP server is unreachable", async () => {
      const payload = createMcpIntegrationPayload({
        name: "unreachable-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:59999/mcp`, // Non-existent port
        authStrategy: { type: "none" },
      });

      const code = `
        try {
          const mcp = await integrations.getMcpClient("unreachable-mcp");
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

  describe("MCP Integration - Client Access by Name", () => {
    it("should access MCP client by integration name", async () => {
      const payload = createMcpIntegrationPayload({
        name: "my-cool-mcp-server",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        // Access MCP client by the exact integration name
        const mcp = await integrations.getMcpClient("my-cool-mcp-server");
        const result = await mcp.callTool({ name: "echo", arguments: { message: "name test" } });
        // Echo returns raw text, not JSON
        return result.content[0]?.text;
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.result).toBe("name test");
    });

    it("should throw clear error for non-existent integration name", async () => {
      const payload = createMcpIntegrationPayload({
        name: "test-mcp",
        serverUrl: `http://${MCP_SERVER_HOST_FOR_SANDBOX}:${TEST_MCP_PORT}/mcp`,
        authStrategy: { type: "none" },
      });

      const code = `
        try {
          const mcp = await integrations.getMcpClient("wrong-name");
          return { error: false };
        } catch (error) {
          return { error: true, message: error.message };
        }
      `;

      const { status, result } = await executeTypescript(code, payload);

      expect(status).toBe(200);
      expect(result.success).toBe(true);

      const data = result.result as { error: boolean; message: string };
      expect(data.error).toBe(true);
      expect(data.message).toContain("not found");
      expect(data.message).toContain("test-mcp"); // Should list available names
    });
  });
});
