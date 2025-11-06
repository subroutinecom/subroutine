import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  generateSubroutine,
  getSubroutine,
  listSubroutines,
  runSubroutine,
  getRun,
  listRuns,
} from "./subroutine-service";

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
    },
  );

  server.registerResource(
    "subroutines-list",
    "resource://subroutines",
    {
      title: "Subroutines",
      description: "List of all generated subroutines",
      mimeType: "application/json",
    },
    () => {
      const allSubroutines = listSubroutines();
      return {
        contents: [
          {
            uri: "resource://subroutines",
            mimeType: "application/json",
            text: JSON.stringify(allSubroutines, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "subroutine-item",
    new ResourceTemplate("resource://subroutines/{id}", {
      list: () => {
        return {
          resources: listSubroutines().map((sub) => ({
            uri: `resource://subroutines/${sub.id}`,
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
    (uri, variables) => {
      const subroutineId = variables.id as string;
      const subroutine = getSubroutine(subroutineId);

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
    },
  );

  // Resource: run results
  server.registerResource(
    "run-item",
    new ResourceTemplate("resource://runs/{id}", {
      list: () => {
        return {
          resources: listRuns().map((run) => ({
            uri: `resource://runs/${run.id}`,
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
    (uri, variables) => {
      const runId = variables.id as string;
      const run = getRun(runId);

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
    },
  );

  // Tool: subroutine.generate
  server.registerTool(
    "subroutine.generate",
    {
      title: "Generate Subroutine",
      description: "Create and persist a subroutine from a natural request",
      inputSchema: {
        request: z.string().describe("Natural language request"),
      },
    },
    ({ request }) => {
      const subroutine = generateSubroutine({
        request,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                subroutineUri: `resource://subroutines/${subroutine.id}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
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
    ({ subroutineUri, inputs, timeoutMs }) => {
      const match = subroutineUri.match(/^resource:\/\/subroutines\/(.+)$/);
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
        const run = runSubroutine({
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
                  runUri: `resource://runs/${run.id}`,
                  status: run.status,
                },
                null,
                2,
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
    },
  );

  return server;
}
