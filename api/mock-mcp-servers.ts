import type { OpenAPIHono } from "@hono/zod-openapi";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getLogger } from "./utils/logger.ts";

const logger = getLogger("api/mock-mcp-servers.ts", "warn");

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
    {
      id: "msg_2",
      from: "newsletter@news.com",
      subject: "Weekly Update",
      body: "Here is the news",
    },
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
            text: JSON.stringify({
              success: true,
              sentTo: to,
              id: `sent_${Date.now()}`,
              subject,
              bodyLength: body.length,
            }),
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

  server.tool("listBranches", "List all branches in the repository", {}, async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(["main", "develop", "feature/login", "fix/header"]),
        },
      ],
    };
  });

  return server;
};

// --- Transport & Mounting Logic ---

const mountMcpServer = (app: OpenAPIHono<any>, path: string, createServerFn: () => McpServer) => {
  // Store transports by session ID (if we wanted sessions, but for simple mocks we can just do one-off or simple session)
  // For these simple mocks, we'll create a new transport per request if it's stateless,
  // but transports are usually long-lived for SSE.
  // Since the requirements are "mimic how the /mcp MCP server is set up", let's support JSON-RPC over POST.

  // We'll use a simple in-memory store for transports if client uses SSE/Session-ID
  const transports: Record<string, WebStandardStreamableHTTPServerTransport> = {};

  app.post(path, async (c) => {
    logger.info(`[MockMCP] Request to ${path}`);

    const sessionId = c.req.header("mcp-session-id");

    // Basic transport handling compatible with what api/server.ts does
    let transport: WebStandardStreamableHTTPServerTransport;

    // If session provided, look it up or create it
    if (sessionId) {
      if (!transports[sessionId]) {
        transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
          onsessioninitialized: (sid: string) => {
            transports[sid] = transport;
          },
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
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid: string) => {
          transports[sid] = transport;
        },
        enableJsonResponse: true,
      });
      const server = createServerFn();
      await server.connect(transport);
    }

    const body = await c.req.json();
    const headers = new Headers(c.req.raw.headers);
    if (!headers.get("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.get("content-type")) headers.set("content-type", "application/json");
    if (sessionId) headers.set("mcp-session-id", sessionId);

    const request = new Request(c.req.url, {
      method: c.req.method,
      headers,
      body: JSON.stringify(body),
    });
    return await transport.handleRequest(request, { parsedBody: body });
  });

  // Add GET endpoint for SSE if needed, but user mainly asked for "methods" which implies tool calls via POST.
  // Keeping it minimal with POST for now unless tests fail.
};

export const registerMockMcpServers = (app: OpenAPIHono<any>) => {
  mountMcpServer(app, "/mockMCP/weather", createWeatherServer);
  mountMcpServer(app, "/mockMCP/mail", createMailServer);
  mountMcpServer(app, "/mockMCP/codeRepo", createCodeRepoServer);
};
