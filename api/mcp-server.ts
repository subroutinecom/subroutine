import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRun, listRuns, runSubroutine } from "./models/run.ts";
import { generateSubroutine, getSubroutine, listSubroutines } from "./models/subroutine.ts";

export function createMcpServer(): McpServer {
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
      const allSubroutines = await listSubroutines();
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
        const subroutines = await listSubroutines();
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
      const subroutine = await getSubroutine(subroutineId);

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

  // Resource: run results
  server.registerResource(
    "run-item",
    new ResourceTemplate("resource://run/{id}", {
      list: async () => {
        const runs = await listRuns();
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
      const run = await getRun(runId);

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

  // Tool: subroutine.generate
  server.registerTool(
    "subroutine.generate",
    {
      title: "Generate Subroutine",
      description: "Create and persist a subroutine from a natural request",
      inputSchema: {
        request: z.string().describe("Natural language request"),
        useMock: z.boolean().optional().describe("Use mock code generation instead of AI (for testing)"),
      },
    },
    async ({ request, useMock }) => {
      console.log(`Generating subroutine for request: ${request}, useMock: ${useMock}`);

      const subroutine = await generateSubroutine({
        request,
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

  // Tool: subroutine.run
  server.registerTool(
    "subroutine.run",
    {
      title: "Run Subroutine",
      description: "Execute a previously generated subroutine",
      inputSchema: {
        subroutineUri: z.string().describe("URI of the subroutine"),
        inputs: z.record(z.unknown()).optional(),
        timeoutMs: z.number().optional(),
      },
    },
    async ({ subroutineUri, inputs, timeoutMs }) => {
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
          inputs,
          timeoutMs,
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
      } catch (_error) {
        return {
          content: [
            {
              type: "text",
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
    }
  );

  return server;
}
