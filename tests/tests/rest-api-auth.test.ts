import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { getTestApiKey } from "../fixtures/apikey.ts";

const API_BASE = "http://api:80";
const VIEWER_ID = "viewer-123";

/**
 * Helper to make REST API requests
 */
const makeRequest = async (
  path: string,
  options?: {
    method?: string;
    apiKey?: string;
    body?: any;
    headers?: Record<string, string>;
  }
) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-use-mock": "true", // Use mock for faster tests
    ...options?.headers,
  };

  if (options?.apiKey) {
    headers["x-api-key"] = options.apiKey;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    data,
  };
};

describe("REST API Authentication", { sanitizeOps: false, sanitizeResources: false }, () => {
  describe("Public Endpoints", () => {
    it("should allow /status without authentication", async () => {
      const response = await makeRequest("/status");

      expect(response.status).toBe(200);
      expect(response.data.status).toBe("ok");
    });
  });

  describe("Protected Endpoints - No Auth", () => {
    it("should reject /api/subroutine POST without authentication", async () => {
      const response = await makeRequest("/api/subroutine", {
        method: "POST",
        body: { request: "Create a hello world function" },
      });

      expect(response.status).toBe(401);
      expect(response.data.error.code).toBe("UNAUTHORIZED");
      expect(response.data.error.message).toContain("Authentication required");
    });

    it("should reject /api/subroutine GET without authentication", async () => {
      const response = await makeRequest("/api/subroutine");

      expect(response.status).toBe(401);
      expect(response.data.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject /api/run GET without authentication", async () => {
      const response = await makeRequest("/api/run");

      expect(response.status).toBe(401);
      expect(response.data.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Protected Endpoints - Invalid API Key", () => {
    it("should reject requests with invalid API key", async () => {
      const response = await makeRequest("/api/subroutine", {
        apiKey: "invalid_key_12345",
      });

      expect(response.status).toBe(401);
      expect(response.data.error.code).toBe("UNAUTHORIZED");
      expect(response.data.error.message).toBe("Invalid API key");
    });
  });

  describe("Protected Endpoints - Valid API Key", () => {
    it("should allow /api/subroutine POST with valid API key", async () => {
      const apiKey = await getTestApiKey();

      const response = await makeRequest("/api/subroutine", {
        method: "POST",
        apiKey,
        body: { request: "Create a hello world function" },
      });

      expect(response.status).toBe(201);
      expect(response.data.subroutine).toBeDefined();
      expect(response.data.subroutine.id).toBeDefined();
      expect(response.data.subroutine.source).toBeDefined();
    });

    it("should allow /api/subroutine GET with valid API key", async () => {
      const apiKey = await getTestApiKey();

      const response = await makeRequest("/api/subroutine", {
        apiKey,
      });

      expect(response.status).toBe(200);
      expect(response.data.subroutines).toBeDefined();
      expect(Array.isArray(response.data.subroutines)).toBe(true);
    });

    it("should allow /api/run GET with valid API key", async () => {
      const apiKey = await getTestApiKey();

      const response = await makeRequest("/api/run", {
        apiKey,
      });

      expect(response.status).toBe(200);
      expect(response.data.runs).toBeDefined();
      expect(Array.isArray(response.data.runs)).toBe(true);
    });

    it("should allow creating and running a subroutine with API key", async () => {
      const apiKey = await getTestApiKey();

      // Create subroutine
      const createResponse = await makeRequest("/api/subroutine", {
        method: "POST",
        apiKey,
        body: { request: "Create a function that adds two numbers" },
      });

      expect(createResponse.status).toBe(201);
      const subroutineId = createResponse.data.subroutine.id;

      // Run subroutine
      const runResponse = await makeRequest(`/api/subroutine/${subroutineId}/run`, {
        method: "POST",
        apiKey,
        body: { viewerId: VIEWER_ID, inputs: { a: 5, b: 3 } },
      });

      expect(runResponse.status).toBe(201);
      expect(runResponse.data.run).toBeDefined();
      expect(runResponse.data.run.subroutineId).toBe(subroutineId);
    });

    it("should allow execute_request with API key", async () => {
      const apiKey = await getTestApiKey();

      const response = await makeRequest("/api/subroutine/execute_request", {
        method: "POST",
        apiKey,
        body: {
          request: "Create a function that multiplies two numbers",
          timeoutMs: 5000,
          viewerId: VIEWER_ID,
        },
      });

      expect(response.status).toBe(201);
      expect(response.data.subroutine).toBeDefined();
      expect(response.data.run).toBeDefined();
      expect(response.data.initialInputs).toBeDefined();
    });
  });

  describe("MCP Endpoints - Authentication", () => {
    it("should reject /mcp POST without authentication", async () => {
      const response = await makeRequest("/mcp", {
        method: "POST",
        body: {
          jsonrpc: "2.0",
          method: "initialize",
          params: {},
          id: 1,
        },
      });

      expect(response.status).toBe(401);
      expect(response.data.error.code).toBe("UNAUTHORIZED");
    });

    it("should allow /mcp POST with valid API key", async () => {
      const apiKey = await getTestApiKey();

      const response = await makeRequest("/mcp", {
        method: "POST",
        apiKey,
        body: {
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
          id: 1,
        },
      });

      // Should not return 401 (unauthorized) - any other status means auth passed
      expect(response.status).not.toBe(401);
      expect([200, 400, 406, 500]).toContain(response.status);
    });
  });

  describe("API Key Header Variations", () => {
    it("should work with lowercase x-api-key header", async () => {
      const apiKey = await getTestApiKey();

      const response = await makeRequest("/api/subroutine", {
        headers: {
          "x-api-key": apiKey,
          "x-use-mock": "true",
        },
      });

      expect(response.status).toBe(200);
    });

    it("should work with mixed case X-Api-Key header", async () => {
      const apiKey = await getTestApiKey();

      const headers: Record<string, string> = {
        "X-Api-Key": apiKey,
        "x-use-mock": "true",
        "Content-Type": "application/json",
      };

      const response = await fetch(`${API_BASE}/api/subroutine`, {
        headers,
      });

      expect(response.status).toBe(200);
    });
  });
});
