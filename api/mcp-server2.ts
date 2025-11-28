import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Minimal, unauthenticated MCP server for /mcp2 routes.
// Intentionally does not rely on auth context; suitable for public access.

export const createMcpServer2 = (): McpServer => {
  const server = new McpServer(
    {
      name: "subroutine-mcp2-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Simple healthcheck tool to verify connectivity
  server.registerTool(
    "system.ping",
    {
      title: "Ping",
      description: "Health check that echoes a message.",
      inputSchema: {
        message: z.string().default("ping"),
      },
    },
    async ({ message }) => {
      const reply = message === "ping" ? "pong" : message;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ message: reply }),
          },
        ],
      };
    }
  );

  // Minimal info tool to describe the server
  server.registerTool(
    "system.info",
    {
      title: "Info",
      description: "Returns basic server information.",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: "subroutine-mcp2-server",
              version: "0.1.0",
            }),
          },
        ],
      };
    }
  );

  return server;
};
