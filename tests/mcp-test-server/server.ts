/**
 * Test MCP Server for integration testing.
 *
 * Provides simple tools for testing MCP client integration:
 * - echo: Returns the input message
 * - add: Adds two numbers
 * - getAuthInfo: Returns information about the Authorization header
 * - throwError: Intentionally throws an error for testing error handling
 * - slowOperation: Delays response for testing timeouts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "@hono/hono";
import { z } from "zod";

export interface TestMcpServerConfig {
  port: number;
  /** If set, requires this exact token in Authorization: Bearer header */
  requiredToken?: string;
  /** If set, enables OAuth discovery endpoints */
  oauthDiscovery?: {
    /** The authorization server URL (defaults to same origin) */
    authorizationServer?: string;
    /** Supported scopes */
    scopes?: string[];
    /** Resource name for the server */
    resourceName?: string;
  };
}

/**
 * Creates and starts a test MCP server.
 * Returns a cleanup function to stop the server.
 */
export const startTestMcpServer = (
  config: TestMcpServerConfig
): {
  stop: () => void;
  port: number;
  url: string;
} => {
  const { port, requiredToken, oauthDiscovery } = config;

  // Track auth header per session for getAuthInfo tool
  // This prevents race conditions when multiple sessions run concurrently
  const sessionAuthHeaders = new Map<string, string | null>();

  const createMcpServer = (sessionId: string): McpServer => {
    const server = new McpServer(
      {
        name: "test-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Tool: echo - returns the input message
    server.tool(
      "echo",
      "Returns the input message back. Useful for testing basic connectivity.",
      {
        message: z.string().describe("The message to echo back"),
      },
      async ({ message }) => {
        return {
          content: [
            {
              type: "text",
              text: message,
            },
          ],
        };
      }
    );

    // Tool: add - adds two numbers
    server.tool(
      "add",
      "Adds two numbers together and returns the result.",
      {
        a: z.number().describe("First number"),
        b: z.number().describe("Second number"),
      },
      async ({ a, b }) => {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result: a + b }),
            },
          ],
        };
      }
    );

    // Tool: getAuthInfo - returns auth header information
    server.tool(
      "getAuthInfo",
      "Returns information about the authentication header. Useful for testing auth passthrough.",
      {},
      async () => {
        // Get auth header for this session
        const authHeader = sessionAuthHeaders.get(sessionId) ?? null;
        const hasAuth = !!authHeader;
        const tokenPrefix = authHeader?.replace("Bearer ", "").substring(0, 20) ?? null;
        const fullToken = authHeader?.replace("Bearer ", "") ?? null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                hasAuth,
                tokenPrefix,
                tokenLength: fullToken?.length ?? 0,
              }),
            },
          ],
        };
      }
    );

    // Tool: throwError - intentionally throws for testing error handling
    server.tool(
      "throwError",
      "Intentionally throws an error. Useful for testing error handling.",
      {
        message: z.string().optional().describe("Custom error message"),
      },
      async ({ message }) => {
        throw new Error(message ?? "Intentional test error");
      }
    );

    // Tool: slowOperation - delays response for timeout testing
    server.tool(
      "slowOperation",
      "Delays response by specified milliseconds. Useful for testing timeouts.",
      {
        delayMs: z.number().describe("Delay in milliseconds"),
      },
      async ({ delayMs }) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ delayed: true, delayMs }),
            },
          ],
        };
      }
    );

    // Tool: concat - concatenates strings (for testing multiple args)
    server.tool(
      "concat",
      "Concatenates multiple strings with an optional separator.",
      {
        strings: z.array(z.string()).describe("Array of strings to concatenate"),
        separator: z.string().optional().describe("Separator between strings (default: '')"),
      },
      async ({ strings, separator }) => {
        return {
          content: [
            {
              type: "text",
              text: strings.join(separator ?? ""),
            },
          ],
        };
      }
    );

    return server;
  };

  const app = new Hono();

  // Store transports by session ID
  const transports: Record<string, WebStandardStreamableHTTPServerTransport> = {};

  // Auth middleware - validates token but doesn't store it yet (no session ID)
  app.use("/mcp", async (c, next) => {
    const authHeader = c.req.header("authorization");

    if (requiredToken) {
      if (!authHeader) {
        return c.json({ error: "Authorization header required" }, 401);
      }
      const token = authHeader.replace("Bearer ", "");
      if (token !== requiredToken) {
        return c.json({ error: "Invalid token" }, 401);
      }
    }

    return next();
  });

  // MCP endpoint - POST for requests
  app.post("/mcp", async (c) => {
    try {
      const sessionId = c.req.header("mcp-session-id");
      const authHeader = c.req.header("authorization") ?? null;

      let body: unknown;
      try {
        body = await c.req.json();
      } catch (error) {
        return c.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32700,
              message: "Parse error",
              data: error instanceof Error ? error.message : String(error),
            },
            id: null,
          },
          400
        );
      }

      // Check if this is an initialize request
      const isInitialize =
        body && typeof body === "object" && "method" in body && body.method === "initialize";

      let transport: WebStandardStreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
        // Update auth header for existing session (in case it changed)
        sessionAuthHeaders.set(sessionId, authHeader);
      } else if (!sessionId && isInitialize) {
        // Generate session ID upfront so we can pass it to createMcpServer
        const newSessionId = crypto.randomUUID();

        transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid: string) => {
          transports[sid] = transport;
          // Store auth header for this session
          sessionAuthHeaders.set(sid, authHeader);
          },
          // Allow JSON responses without SSE for simpler testing
          enableJsonResponse: true,
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            delete transports[sid];
            sessionAuthHeaders.delete(sid);
          }
        };

        const server = createMcpServer(newSessionId);
        await server.connect(transport);
      } else {
        return c.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          },
          400
        );
      }

      const headers = new Headers(c.req.raw.headers);
      if (!headers.get("content-type")) {
        headers.set("content-type", "application/json");
      }
      const request = new Request(c.req.url, {
        method: c.req.method,
        headers,
        body: JSON.stringify(body),
      });
      return await transport.handleRequest(request, { parsedBody: body });
    } catch (error) {
      console.error("MCP test server POST handler failed:", error);
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Internal MCP test server error",
            data: error instanceof Error ? error.message : String(error),
          },
          id: null,
        },
        500
      );
    }
  });

  // MCP endpoint - GET for SSE (not needed for JSON-response tests)
  app.get("/mcp", (c) => {
    return c.text("Method not allowed", 405);
  });

  // MCP endpoint - DELETE for session termination (unused in tests)
  app.delete("/mcp", (c) => {
    return c.text("Method not allowed", 405);
  });

  // OAuth Discovery Endpoints (RFC 9728 & RFC 8414)
  if (oauthDiscovery) {
    const baseUrl = `http://0.0.0.0:${port}`;
    const authServer = oauthDiscovery.authorizationServer ?? baseUrl;

    // RFC 9728: OAuth 2.0 Protected Resource Metadata
    app.get("/.well-known/oauth-protected-resource", (c) => {
      return c.json({
        resource: `${baseUrl}/mcp`,
        authorization_servers: [authServer],
        scopes_supported: oauthDiscovery.scopes ?? ["read", "write"],
        bearer_methods_supported: ["header"],
        resource_name: oauthDiscovery.resourceName ?? "Test MCP Server",
      });
    });

    // Path-specific protected resource metadata
    app.get("/.well-known/oauth-protected-resource/mcp", (c) => {
      return c.json({
        resource: `${baseUrl}/mcp`,
        authorization_servers: [authServer],
        scopes_supported: oauthDiscovery.scopes ?? ["read", "write"],
        bearer_methods_supported: ["header"],
        resource_name: oauthDiscovery.resourceName ?? "Test MCP Server",
      });
    });

    // RFC 8414: OAuth 2.0 Authorization Server Metadata
    app.get("/.well-known/oauth-authorization-server", (c) => {
      return c.json({
        issuer: authServer,
        authorization_endpoint: `${authServer}/oauth/authorize`,
        token_endpoint: `${authServer}/oauth/token`,
        registration_endpoint: `${authServer}/oauth/register`,
        scopes_supported: oauthDiscovery.scopes ?? ["read", "write"],
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256", "plain"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      });
    });

    // OpenID Connect style discovery (alternative location)
    app.get("/.well-known/openid-configuration", (c) => {
      return c.json({
        issuer: authServer,
        authorization_endpoint: `${authServer}/oauth/authorize`,
        token_endpoint: `${authServer}/oauth/token`,
        registration_endpoint: `${authServer}/oauth/register`,
        scopes_supported: oauthDiscovery.scopes ?? ["read", "write"],
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256", "plain"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      });
    });
  }

  // Health check
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      tools: ["echo", "add", "getAuthInfo", "throwError", "slowOperation", "concat"],
      oauthDiscoveryEnabled: !!oauthDiscovery,
    });
  });

  const abortController = new AbortController();

  Deno.serve(
    {
      port,
      hostname: "0.0.0.0",
      signal: abortController.signal,
      onListen: () => {
        console.log(`Test MCP server running on http://0.0.0.0:${port}`);
      },
    },
    app.fetch
  );

  return {
    stop: () => {
      abortController.abort();
    },
    port,
    url: `http://0.0.0.0:${port}/mcp`,
  };
};

// Allow running directly
if (import.meta.main) {
  const port = parseInt(Deno.env.get("PORT") ?? "3456");
  const requiredToken = Deno.env.get("REQUIRED_TOKEN");
  const enableOAuthDiscovery = Deno.env.get("ENABLE_OAUTH_DISCOVERY") === "true";
  const oauthScopes = Deno.env
    .get("OAUTH_SCOPES")
    ?.split(",")
    .map((s) => s.trim());

  const server = startTestMcpServer({
    port,
    requiredToken: requiredToken || undefined,
    oauthDiscovery: enableOAuthDiscovery
      ? {
          scopes: oauthScopes,
          resourceName: "Test MCP Server",
        }
      : undefined,
  });

  console.log(`MCP endpoint: ${server.url}`);
  console.log(`Health check: http://127.0.0.1:${port}/health`);
  if (requiredToken) {
    console.log(`Auth required: Bearer ${requiredToken.substring(0, 10)}...`);
  } else {
    console.log("Auth: None required");
  }
  if (enableOAuthDiscovery) {
    console.log(`OAuth discovery: Enabled (scopes: ${oauthScopes?.join(", ") ?? "read, write"})`);
  }
}
