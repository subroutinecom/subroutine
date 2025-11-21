import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRun, listRuns, runSubroutine } from "./models/run.ts";
import { generateSubroutine, getSubroutine, listSubroutines } from "./models/subroutine.ts";
import type { AuthContext } from "./middlewares/auth.ts";
import { IntegrationAuthRequiredError } from "./models/errors.ts";

const requireOrganizationId = (auth: AuthContext): string => {
  if (!auth.organizationId) {
    throw new Error("Active organization is required to use MCP");
  }
  return auth.organizationId;
};

export function createMcpServer(auth: AuthContext): McpServer {
  const organizationId = requireOrganizationId(auth);

  const server = new McpServer(
    {
      name: "subroutine-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  server.registerResource(
    "subroutine-list",
    "resource://subroutine",
    {
      title: "Subroutine",
      description: "List of all generated subroutines",
      mimeType: "application/json",
    },
    async () => {
      const allSubroutines = await listSubroutines(organizationId);
      return {
        contents: [
          {
            uri: "resource://subroutine",
            mimeType: "application/json",
            text: JSON.stringify(allSubroutines, null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "subroutine-item",
    new ResourceTemplate("resource://subroutine/{id}", {
      list: async () => {
        const subroutines = await listSubroutines(organizationId);
        return {
          resources: subroutines.map((sub) => ({
            uri: `resource://subroutine/${sub.id}`,
            name: `Subroutine ${sub.id}`,
            description: sub.createdFrom.request,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "Subroutine",
      description: "Individual subroutine resource",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const subroutineId = variables.id as string;
      const subroutine = await getSubroutine(subroutineId, organizationId);

      if (!subroutine) {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify({
                error: {
                  code: "NOT_FOUND",
                  message: "subroutine not found",
                },
              }),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(subroutine, null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "run-item",
    new ResourceTemplate("resource://run/{id}", {
      list: async () => {
        const runs = await listRuns(organizationId);
        return {
          resources: runs.map((run) => ({
            uri: `resource://run/${run.id}`,
            name: `Run ${run.id}`,
            description: `Status: ${run.status}`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "Run",
      description: "Subroutine execution run",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const runId = variables.id as string;
      const run = await getRun(runId, organizationId);

      if (!run) {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify({
                error: {
                  code: "NOT_FOUND",
                  message: "run not found",
                },
              }),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(run, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "subroutine.generate",
    {
      title: "Generate Subroutine",
      description: "Create and persist a subroutine from a natural request",
      inputSchema: {
        request: z.string().describe("Natural language request"),
        integrations: z.array(z.string()).optional(),
        useMock: z
          .boolean()
          .optional()
          .describe("Use mock code generation instead of AI (for testing)"),
      },
    },
    async ({ request, useMock, integrations }) => {
      console.log(`Generating subroutine for request: ${request}, useMock: ${useMock}`);

      const subroutine = await generateSubroutine({
        request,
        integrations,
        organizationId,
        useMock,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                subroutineUri: `resource://subroutine/${subroutine.id}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "subroutine.executeRequest",
    {
      title: "Execute Request",
      description:
        "Generate a brand-new subroutine for the provided request, immediately queue it for execution, and return references to track its progress.",
      inputSchema: {
        request: z.string().describe("Natural language description of the desired workflow"),
        viewerId: z.string().describe("External viewer identifier"),
        timeoutMs: z.number().optional(),
        integrations: z.array(z.string()).optional(),
        useMock: z
          .boolean()
          .optional()
          .describe("Use mock code generation instead of AI (for testing)"),
      },
    },
    async ({ request, viewerId, timeoutMs, useMock, integrations }) => {
      console.log(`Executing request via generated subroutine: ${request}`, {
        useMock,
        timeoutMs,
      });

      const subroutine = await generateSubroutine({
        request,
        integrations,
        organizationId,
        useMock,
        needsImmediateInputs: true,
      });

      if (!subroutine.initialInputs) {
        throw new Error("Generated subroutine is missing initial inputs");
      }

      try {
        const run = await runSubroutine({
          subroutineId: subroutine.id,
          organizationId,
          userId: auth.userId,
          viewerId,
          inputs: subroutine.initialInputs,
          timeoutMs,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                [
                  {
                    subroutineUri: `resource://subroutine/${subroutine.id}`,
                    request,
                    initialInputs: subroutine.initialInputs,
                  },
                  {
                    runUri: `resource://run/${run.id}`,
                    status: run.status,
                  },
                ],
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof IntegrationAuthRequiredError) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: {
                    code: "INTEGRATION_AUTH_REQUIRED",
                    message: error.message,
                    integrationId: error.integrationId,
                    provider: error.provider,
                    authorizationUrl: error.authorizationUrl,
                    state: error.state,
                    viewerId: error.viewerId,
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

  server.registerTool(
    "subroutine.run",
    {
      title: "Run Subroutine",
      description: "Execute a previously generated subroutine",
      inputSchema: {
        subroutineUri: z.string().describe("URI of the subroutine"),
        viewerId: z.string().describe("External viewer identifier"),
        inputs: z.record(z.unknown()).optional(),
        timeoutMs: z.number().optional(),
        wait: z.boolean().optional().describe("If false, return immediately without waiting. Default: true"),
      },
    },
    async ({ subroutineUri, viewerId, inputs, timeoutMs, wait }) => {
      const match = subroutineUri.match(/^resource:\/\/subroutine\/(.+)$/);
      if (!match) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: {
                  code: "VALIDATION",
                  message: "invalid subroutine URI format",
                },
              }),
            },
          ],
        };
      }

      const subroutineId = match[1];

      try {
        const run = await runSubroutine({
          subroutineId,
          organizationId,
          userId: auth.userId,
          viewerId,
          inputs,
          timeoutMs,
          wait: wait ?? true,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  runUri: `resource://run/${run.id}`,
                  status: run.status,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof IntegrationAuthRequiredError) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: {
                    code: "INTEGRATION_AUTH_REQUIRED",
                    message: error.message,
                    integrationId: error.integrationId,
                    provider: error.provider,
                    authorizationUrl: error.authorizationUrl,
                    state: error.state,
                    viewerId: error.viewerId,
                  },
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: {
                  code:
                    error instanceof Error && error.message === "Subroutine not found"
                      ? "NOT_FOUND"
                      : "UNKNOWN",
                  message:
                    error instanceof Error && error.message === "Subroutine not found"
                      ? "subroutine not found"
                      : "failed to run subroutine",
                },
              }),
            },
          ],
        };
      }
    }
  );

  return server;
}
