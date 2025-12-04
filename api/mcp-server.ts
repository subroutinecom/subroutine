import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { IntegrationAuthRequiredError } from "./models/errors.ts";
import { executeRequest } from "./models/subroutine.ts";
import { getLogger } from "./utils/logger.ts";
const logger = getLogger("mcp-server");


export type McpServerContext = {
  organizationId: string;
  sessionId: string; // Used as viewerId for subroutine calls
};

export const createMcpServer = (ctx: McpServerContext): McpServer => {
  const { organizationId, sessionId } = ctx;

  const server = new McpServer(
    {
      name: "subroutine-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Main tool - handle a natural language request by generating and executing code
  server.registerTool(
    "handleRequest",
    {
      title: "Handle Request",
      description:
        "Handle a natural language request by generating and executing code that uses the organization's configured integrations (e.g., Gmail, Calendar, GitHub, Slack). Describe what you want to accomplish and the system will determine how to do it.",
      inputSchema: {
        request: z.string().describe("Natural language description of what to do"),
      },
    },
    async ({ request }) => {
      logger.info(`[MCP] handleRequest: ${request}`);

      try {
        const { subroutine, run } = await executeRequest({
          request,
          organizationId,
          viewerId: sessionId,
          wait: true,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  subroutineId: subroutine.id,
                  runId: run.id,
                  status: run.status,
                  outputs: run.outputs,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof IntegrationAuthRequiredError) {
          const req = error.requirements[0];
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: {
                    code: "INTEGRATION_AUTH_REQUIRED",
                    message: error.message,
                    integrationId: req?.integrationId ?? error.integrationId,
                    authorizationUrl: req?.authorizationUrl ?? "",
                    authInstructions: req?.authInstructions,
                    requirements: error.requirements,
                  },
                }),
              },
            ],
          };
        }
        throw error;
      }
    }
  );

  return server;
};
