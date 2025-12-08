import type { OpenAPIHono } from "@hono/zod-openapi";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { NodeResponseAdapter } from "./utils/mcp-adapter.ts";
import { getLogger } from "./utils/logger.ts";

const logger = getLogger("api/mock-mcp-servers.ts");

// --- Mock Server Factories ---

const createWeatherServer = () => {
  const server = new McpServer({
    name: "mock-weather-server",
    version: "1.0.0",
  });

  server.tool(
    "getForecast",
    "Get the weather forecast for a location",
    {
      location: z.string().describe("City name or coordinates"),
      days: z.number().min(1).max(7).optional().describe("Number of days"),
    },
    async ({ location, days = 1 }) => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              location,
              forecast: Array.from({ length: days }).map((_, i) => ({
                day: i + 1,
                condition: ["Sunny", "Cloudy", "Rainy"][i % 3],
                high: 20 + i,
                low: 15 + i,
              })),
            }),
          },
        ],
      };
    }
  );

  return server;
};

const createMailServer = () => {
  const server = new McpServer({
    name: "mock-mail-server",
    version: "1.0.0",
  });

  const messages = [
    { id: "msg_1", from: "boss@company.com", subject: "Urgent", body: "Meeting at 2pm" },
    { id: "msg_2", from: "newsletter@news.com", subject: "Weekly Update", body: "Here is the news" },
  ];

  server.tool(
    "listMessages",
    "List recent email messages",
    {
      limit: z.number().optional(),
    },
    async ({ limit = 10 }) => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(messages.slice(0, limit)),
          },
        ],
      };
    }
  );

  server.tool(
    "sendMessage",
    "Send an email message",
    {
      to: z.string().email(),
      subject: z.string(),
      body: z.string(),
    },
    async ({ to, subject, body }) => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, sentTo: to, id: `sent_${Date.now()}`, subject, bodyLength: body.length }),
          },
        ],
      };
    }
  );

  return server;
};

const createCodeRepoServer = () => {
  const server = new McpServer({
    name: "mock-code-repo-server",
    version: "1.0.0",
  });

  server.tool(
    "getCommit",
    "Get details of a specific commit",
    {
      commitId: z.string(),
    },
    async ({ commitId }) => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: commitId,
              message: "Fix bug in production",
              author: "developer@company.com",
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "listBranches",
    "List all branches in the repository",
    {},
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(["main", "develop", "feature/login", "fix/header"]),
          },
        ],
      };
    }
  );

  return server;
};

// --- Transport & Mounting Logic ---

const mountMcpServer = (app: OpenAPIHono<any>, path: string, createServerFn: () => McpServer) => {
  // Store transports by session ID (if we wanted sessions, but for simple mocks we can just do one-off or simple session)
  // For these simple mocks, we'll create a new transport per request if it's stateless, 
  // but transports are usually long-lived for SSE.
  // Since the requirements are "mimic how the /mcp MCP server is set up", let's support JSON-RPC over POST.
  
  // We'll use a simple in-memory store for transports if client uses SSE/Session-ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post(path, async (c) => {
    logger.info(`[MockMCP] Request to ${path}`);
    
    const sessionId = c.req.header("mcp-session-id");
    
    // Basic transport handling compatible with what api/server.ts does
    let transport: StreamableHTTPServerTransport;
    
    const res = new NodeResponseAdapter();
    if (!res.getHeader("content-type")) {
      res.setHeader("content-type", "application/json; charset=utf-8");
    }

    // If session provided, look it up or create it
    if (sessionId) {
      if (!transports[sessionId]) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
          onsessioninitialized: (sid) => { transports[sid] = transport; },
          enableJsonResponse: true,
        });
        
        const server = createServerFn();
        await server.connect(transport);
      } else {
        transport = transports[sessionId];
      }
    } else {
      // Stateless / One-off request (common for simple tools calls)
      // We still need a transport to handle the request/response cycle
      const newSessionId = crypto.randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => { transports[sid] = transport; },
        enableJsonResponse: true,
      });
      const server = createServerFn();
      await server.connect(transport);
      
      // Return the new session ID so the client can continue the session
      // This is crucial for the initialize -> initialized -> call flow
      res.setHeader("mcp-session-id", newSessionId);
    }

    // Adapt Hono Request/Response to Node.js style for the SDK
    const headersObj = Object.fromEntries(c.req.raw.headers.entries());
    // Force JSON Accept for non-streaming transport
    // This ensures the SDK knows we want JSON, avoiding 406 Not Acceptable
    headersObj["accept"] = "application/json, text/event-stream";
    
    if (!headersObj["content-type"]) headersObj["content-type"] = "application/json";
    if (sessionId) headersObj["mcp-session-id"] = sessionId;

    const nodeReq = {
      method: c.req.method,
      url: c.req.url,
      headers: headersObj,
    };

    const body = await c.req.json();
    
    // Wait for SDK to finish writing
    const finished = new Promise<void>((resolve) => {
      // @ts-ignore - NodeResponseAdapter implements once() but Typescript doesn't see it in the interface
      res.once("close", () => resolve());
    });

    // @ts-ignore - MCP SDK expects Node.js HTTP types
    await transport.handleRequest(nodeReq, res, body);
    await finished;

    return res.toResponse();
  });
  
  // Add GET endpoint for SSE if needed, but user mainly asked for "methods" which implies tool calls via POST.
  // Keeping it minimal with POST for now unless tests fail.
};

export const registerMockMcpServers = (app: OpenAPIHono<any>) => {
  mountMcpServer(app, "/mockMCP/weather", createWeatherServer);
  mountMcpServer(app, "/mockMCP/mail", createMailServer);
  mountMcpServer(app, "/mockMCP/codeRepo", createCodeRepoServer);
};
