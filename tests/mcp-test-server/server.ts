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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Hono } from "@hono/hono";
import { z } from "zod";

export interface TestMcpServerConfig {
  port: number;
  /** If set, requires this exact token in Authorization: Bearer header */
  requiredToken?: string;
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
  const { port, requiredToken } = config;

  // Track auth header from requests for getAuthInfo tool
  let lastAuthHeader: string | null = null;

  const createMcpServer = (): McpServer => {
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
        const hasAuth = !!lastAuthHeader;
        const tokenPrefix = lastAuthHeader?.replace("Bearer ", "").substring(0, 20) ?? null;
        const fullToken = lastAuthHeader?.replace("Bearer ", "") ?? null;

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
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Auth middleware
  app.use("/mcp", async (c, next) => {
    const authHeader = c.req.header("authorization");
    lastAuthHeader = authHeader ?? null;

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
    const sessionId = c.req.header("mcp-session-id");
    const body = await c.req.json();

    // Check if this is an initialize request
    const isInitialize =
      body && typeof body === "object" && "method" in body && body.method === "initialize";

    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitialize) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
        },
        // Allow JSON responses without SSE for simpler testing
        enableJsonResponse: true,
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      const server = createMcpServer();
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

    // Create a custom response handler with Promise-based completion
    const responseHeaders: Record<string, string> = {};
    const responseChunks: Uint8Array[] = [];
    let responseStatus = 200;
    let resolveResponse: () => void;
    const responseComplete = new Promise<void>((resolve) => {
      resolveResponse = resolve;
    });

    // Create an event-emitter-like interface for Node.js HTTP response compatibility
    type EventCallback = (...args: unknown[]) => void;
    const eventHandlers: Record<string, EventCallback[]> = {};

    const mockRes = {
      writeHead: (status: number, headers?: Record<string, string>) => {
        responseStatus = status;
        if (headers) {
          Object.assign(responseHeaders, headers);
        }
        return mockRes;
      },
      setHeader: (name: string, value: string) => {
        responseHeaders[name] = value;
        return mockRes;
      },
      write: (chunk: string | Uint8Array) => {
        if (typeof chunk === "string") {
          responseChunks.push(new TextEncoder().encode(chunk));
        } else {
          responseChunks.push(chunk);
        }
        return true;
      },
      end: (chunk?: string | Uint8Array) => {
        if (chunk) {
          mockRes.write(chunk);
        }
        // Emit 'close' event
        const handlers = eventHandlers["close"] ?? [];
        for (const handler of handlers) {
          handler();
        }
        // Signal that the response is complete
        resolveResponse();
      },
      on: (event: string, handler: EventCallback) => {
        if (!eventHandlers[event]) {
          eventHandlers[event] = [];
        }
        eventHandlers[event].push(handler);
        return mockRes;
      },
      once: (event: string, handler: EventCallback) => {
        return mockRes.on(event, handler);
      },
      removeListener: (_event: string, _handler: EventCallback) => {
        return mockRes;
      },
      flushHeaders: () => {
        return mockRes;
      },
      get headersSent() {
        return Object.keys(responseHeaders).length > 0;
      },
      get writableEnded() {
        return false;
      },
    };

    // Create a Node.js-like request object with proper headers access
    const nodeReq = {
      method: c.req.method,
      url: c.req.url,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    };

    // @ts-ignore - MCP SDK expects Node.js HTTP types
    await transport.handleRequest(nodeReq, mockRes, body);

    // Wait for the response to be fully written (SDK calls end() asynchronously)
    await responseComplete;

    const totalLength = responseChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const responseBody = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of responseChunks) {
      responseBody.set(chunk, offset);
      offset += chunk.length;
    }

    return new Response(responseBody.length > 0 ? responseBody : null, {
      status: responseStatus,
      headers: responseHeaders,
    });
  });

  // MCP endpoint - GET for SSE
  app.get("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    if (!sessionId || !transports[sessionId]) {
      return c.text("Invalid or missing session ID", 400);
    }

    const transport = transports[sessionId];
    const responseHeaders: Record<string, string> = {};
    const responseChunks: Uint8Array[] = [];

    const mockRes = {
      writeHead: (_status: number, headers?: Record<string, string>) => {
        if (headers) {
          Object.assign(responseHeaders, headers);
        }
        return mockRes;
      },
      setHeader: (name: string, value: string) => {
        responseHeaders[name] = value;
        return mockRes;
      },
      write: (chunk: string | Uint8Array) => {
        if (typeof chunk === "string") {
          responseChunks.push(new TextEncoder().encode(chunk));
        } else {
          responseChunks.push(chunk);
        }
        return true;
      },
      end: () => {},
      get headersSent() {
        return false;
      },
      get writableEnded() {
        return false;
      },
    };

    // @ts-ignore - MCP SDK expects Node.js HTTP types
    await transport.handleRequest(c.req.raw, mockRes);

    const totalLength = responseChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const responseBody = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of responseChunks) {
      responseBody.set(chunk, offset);
      offset += chunk.length;
    }

    return new Response(responseBody.length > 0 ? responseBody : null, {
      status: 200,
      headers: responseHeaders,
    });
  });

  // MCP endpoint - DELETE for session termination
  app.delete("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    if (!sessionId || !transports[sessionId]) {
      return c.text("Invalid or missing session ID", 400);
    }

    const transport = transports[sessionId];
    const mockRes = {
      writeHead: () => mockRes,
      setHeader: () => mockRes,
      write: () => true,
      end: () => {},
      get headersSent() {
        return false;
      },
      get writableEnded() {
        return false;
      },
    };

    // @ts-ignore - MCP SDK expects Node.js HTTP types
    await transport.handleRequest(c.req.raw, mockRes);

    return c.text("Session terminated", 200);
  });

  // Health check
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      tools: ["echo", "add", "getAuthInfo", "throwError", "slowOperation", "concat"],
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

  const server = startTestMcpServer({
    port,
    requiredToken: requiredToken || undefined,
  });

  console.log(`MCP endpoint: ${server.url}`);
  console.log(`Health check: http://127.0.0.1:${port}/health`);
  if (requiredToken) {
    console.log(`Auth required: Bearer ${requiredToken.substring(0, 10)}...`);
  } else {
    console.log("Auth: None required");
  }
}
