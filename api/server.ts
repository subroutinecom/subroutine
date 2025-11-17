import { cors } from "@hono/hono/cors";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createYoga } from "graphql-yoga";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { auth } from "./auth.ts";
import { getConfig } from "./config/loader.ts";
import { initializeDatabase } from "./db/index.ts";
import { buildContext, schema } from "./internal/schema.ts";
import { createMcpServer } from "./mcp-server.ts";
import { authMiddleware, type AuthContext } from "./middlewares/auth.ts";
import { graphqlAuthMiddleware } from "./middlewares/graphql-auth.ts";
import { getRun, listRuns, runSubroutine } from "./models/run.ts";
import { generateSubroutine, getSubroutine, listSubroutines } from "./models/subroutine.ts";
import { NodeResponseAdapter } from "./utils/mcp-adapter.ts";

const initialize = async () => {
  const app = new OpenAPIHono<{ Variables: { auth: AuthContext } }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const message = result.error.issues.map((i) => `${i.path.join(".")} ${i.message.toLowerCase()}`).join(", ");
        return c.json(
          {
            error: {
              code: "VALIDATION",
              message,
            },
          },
          400
        );
      }
    },
  });

  const PORT = process.env.PORT ? Number(process.env.PORT) : 80;

  await initializeDatabase();

  const config = await getConfig();

  app.use(
    "/api/auth/*",
    cors({
      origin: config.auth.allowedOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cookie", "x-api-key"],
      exposeHeaders: ["Set-Cookie"],
      maxAge: 86400,
    }) as any
  );

  app.get("/api/auth/test-route", (c) => {
    return c.json({ message: "Hono routing works!" });
  });

  app.on(["POST", "GET"], "/api/auth/*", async (c) => {
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace("/api/auth", "");
    const response = await auth.handler(c.req.raw);
    return response;
  });

  app.use(
    "/graphql",
    cors({
      origin: config.auth.allowedOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cookie"],
      exposeHeaders: ["Set-Cookie"],
      maxAge: 86400,
    }) as any
  );

  app.use("/graphql", graphqlAuthMiddleware);

  const yoga = createYoga({
    schema,
    context: async ({ request }) => {
      return buildContext(request.headers);
    },
    maskedErrors: false,
    cors: false,
  });

  app.all("/graphql", async (c) => {
    const response = await yoga.fetch(c.req.raw);
    return response;
  });

  app.use("*", authMiddleware);

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const ErrorSchema = z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  });

  const SubroutineSchema = z.object({
    id: z.string(),
    source: z.string(),
    inputsSchema: z.record(z.unknown()).optional(),
    outputsSchema: z.record(z.unknown()).optional(),
    initialInputs: z.record(z.unknown()).optional(),
    createdFrom: z.object({
      request: z.string(),
    }),
    createdAt: z.string(),
  });

  const RunSchema = z.object({
    id: z.string(),
    subroutineId: z.string(),
    status: z.enum(["queued", "running", "succeeded", "failed"]),
    startedAt: z.string().nullable().optional(),
    endedAt: z.string().nullable().optional(),
    outputs: z.record(z.unknown()).nullable().optional(),
    error: z.record(z.unknown()).nullable().optional(),
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/status",
      responses: {
        200: {
          description: "Service status",
          content: {
            "application/json": {
              schema: z.object({
                status: z.string(),
              }),
            },
          },
        },
      },
    }),
    (c) => {
      return c.json({ status: "ok" });
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/subroutine",
      description: "Create a new subroutine from a natural language description",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                request: z.string().describe("Natural language description of the desired subroutine"),
              }),
            },
          },
        },
        headers: z.object({
          "x-use-mock": z.string().optional(),
        }),
      },
      responses: {
        201: {
          description: "Subroutine created successfully",
          content: {
            "application/json": {
              schema: z.object({
                subroutineUri: z.string(),
                subroutine: SubroutineSchema,
              }),
            },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
        500: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
      },
    }),
    async (c) => {
      try {
        const { request } = c.req.valid("json");

        if (!request || typeof request !== "string") {
          return c.json(
            {
              error: {
                code: "VALIDATION",
                message: "request field is required and must be a string",
              },
            },
            400
          );
        }

        const useMock = c.req.header("x-use-mock") === "true";

        const subroutine = await generateSubroutine({
          request,
          useMock,
        });

        const response = c.json(
          {
            subroutineUri: `resource://subroutine/${subroutine.id}`,
            subroutine,
          },
          201
        );
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate subroutine";
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message,
            },
          },
          500
        );
      }
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/subroutine/execute_request",
      description: "Create and immediately execute a subroutine",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                request: z.string().describe("Natural language description of the desired subroutine"),
                timeoutMs: z.number().optional(),
              }),
            },
          },
        },
        headers: z.object({
          "x-use-mock": z.string().optional(),
        }),
      },
      responses: {
        201: {
          description: "Subroutine created and executed successfully",
          content: {
            "application/json": {
              schema: z.object({
                subroutineUri: z.string(),
                subroutine: SubroutineSchema,
                runUri: z.string(),
                run: RunSchema,
                initialInputs: z.record(z.unknown()),
              }),
            },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
        500: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
      },
    }),
    async (c) => {
      try {
        const { request, timeoutMs } = c.req.valid("json");

        if (!request || typeof request !== "string") {
          return c.json(
            {
              error: {
                code: "VALIDATION",
                message: "request field is required and must be a string",
              },
            },
            400
          );
        }

        const useMock = c.req.header("x-use-mock") === "true";
        const subroutine = await generateSubroutine({
          request,
          useMock,
          needsImmediateInputs: true,
        });

        if (!subroutine.initialInputs) {
          throw new Error("Generated subroutine did not include immediate inputs");
        }

        const run = await runSubroutine({
          subroutineId: subroutine.id,
          inputs: subroutine.initialInputs,
          timeoutMs,
        });

        return c.json(
          {
            subroutineUri: `resource://subroutine/${subroutine.id}`,
            subroutine,
            runUri: `resource://run/${run.id}`,
            run,
            initialInputs: subroutine.initialInputs,
          },
          201
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create and run subroutine";
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message,
            },
          },
          500
        );
      }
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/subroutine",
      description: "List all subroutines",
      responses: {
        200: {
          description: "List of all subroutines",
          content: {
            "application/json": {
              schema: z.object({
                subroutines: z.array(SubroutineSchema),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const subroutines = await listSubroutines();
      return c.json({ subroutines });
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/subroutine/{id}",
      description: "Get a specific subroutine by ID",
      request: {
        params: z.object({
          id: z.string().describe("Subroutine ID"),
        }),
      },
      responses: {
        200: {
          description: "Subroutine details",
          content: {
            "application/json": {
              schema: z.object({
                subroutine: SubroutineSchema,
              }),
            },
          },
        },
        404: {
          description: "Subroutine not found",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
      },
    }),
    // @ts-ignore - Hono OpenAPI types are overly strict about response unions
    async (c) => {
      const { id } = c.req.valid("param");
      const subroutine = await getSubroutine(id);

      if (!subroutine) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "subroutine not found",
            },
          },
          404
        );
      }

      return c.json({ subroutine });
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/subroutine/{id}/run",
      description: "Execute a subroutine with given inputs",
      request: {
        params: z.object({
          id: z.string().describe("Subroutine ID"),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                inputs: z.record(z.unknown()).optional(),
                timeoutMs: z.number().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: {
          description: "Run created successfully",
          content: {
            "application/json": {
              schema: z.object({
                runUri: z.string(),
                run: RunSchema,
              }),
            },
          },
        },
        404: {
          description: "Subroutine not found",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
        500: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
      },
    }),
    // @ts-ignore - Hono OpenAPI types are overly strict about response unions
    async (c) => {
      try {
        const { id } = c.req.valid("param");
        const { inputs, timeoutMs } = c.req.valid("json");

        const run = await runSubroutine({
          subroutineId: id,
          inputs,
          timeoutMs,
        });

        return c.json(
          {
            runUri: `resource://run/${run.id}`,
            run,
          },
          201
        );
      } catch (error) {
        if (error instanceof Error && error.message === "Subroutine not found") {
          return c.json(
            {
              error: {
                code: "NOT_FOUND",
                message: "subroutine not found",
              },
            },
            404
          );
        }

        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Failed to run subroutine",
            },
          },
          500
        );
      }
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/run",
      description: "List all subroutine runs",
      responses: {
        200: {
          description: "List of all runs",
          content: {
            "application/json": {
              schema: z.object({
                runs: z.array(RunSchema),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const runs = await listRuns();
      return c.json({ runs });
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/run/{id}",
      description: "Get a specific run by ID",
      request: {
        params: z.object({
          id: z.string().describe("Run ID"),
        }),
      },
      responses: {
        200: {
          description: "Run details",
          content: {
            "application/json": {
              schema: z.object({
                run: RunSchema,
              }),
            },
          },
        },
        404: {
          description: "Run not found",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
      },
    }),
    // @ts-ignore - Hono OpenAPI types are overly strict about response unions
    async (c) => {
      console.log("Fetching run with ID:", c.req.valid("param").id);
      const { id } = c.req.valid("param");
      const run = await getRun(id);
      console.log("Fetched run:", run);

      if (!run) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "run not found",
            },
          },
          404
        );
      }

      return c.json({ run });
    }
  );

  app.post("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    if (sessionId) {
      console.log(`Received MCP request for session: ${sessionId}`);
    } else {
      console.log("New MCP request");
    }

    try {
      let transport: StreamableHTTPServerTransport;
      const body = await c.req.json();
      console.log("MCP request body:", JSON.stringify(body, null, 2));

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            console.log(`Session initialized with ID: ${newSessionId}`);
            transports[newSessionId] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`Transport closed for session ${sid}, removing from transports map`);
            delete transports[sid];
          }
        };

        const server = createMcpServer();
        await server.connect(transport);
        const req = c.req.raw;
        const res = new NodeResponseAdapter();
        // @ts-ignore - MCP SDK expects Node.js HTTP response types
        await transport.handleRequest(req, res, body);
        const response = res.toResponse();
        console.log("MCP response status:", response.status);
        return response;
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

      const req = c.req.raw;
      const res = new NodeResponseAdapter();
      // @ts-ignore - MCP SDK expects Node.js HTTP response types
      await transport.handleRequest(req, res, body);
      return res.toResponse();
    } catch (error) {
      console.error("Error handling MCP request:", error);
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        },
        500
      );
    }
  });

  app.get("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    if (!sessionId || !transports[sessionId]) {
      return c.text("Invalid or missing session ID", 400);
    }

    console.log(`Establishing SSE stream for session ${sessionId}`);
    const transport = transports[sessionId];
    const req = c.req.raw;
    const res = new NodeResponseAdapter();
    // @ts-ignore - MCP SDK expects Node.js HTTP response types
    await transport.handleRequest(req, res);
    return res.toResponse();
  });

  app.delete("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    if (!sessionId || !transports[sessionId]) {
      return c.text("Invalid or missing session ID", 400);
    }

    console.log(`Received session termination request for session ${sessionId}`);

    try {
      const transport = transports[sessionId];
      const req = c.req.raw;
      const res = new NodeResponseAdapter();
      // @ts-ignore - MCP SDK expects Node.js HTTP response types
      await transport.handleRequest(req, res);
      return res.toResponse();
    } catch (error) {
      console.error("Error handling session termination:", error);
      return c.text("Error processing session termination", 500);
    }
  });

  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: {
      version: "1.0.0",
      title: "Subroutine API",
      description: "API for creating and running subroutines",
    },
  });

  Deno.serve({ port: PORT, hostname: "::" }, app.fetch);

  console.log(`Server running on port ${PORT}`);
  console.log(`GraphQL endpoint available at http://localhost:${PORT}/graphql`);
  console.log(`MCP endpoint available at http://localhost:${PORT}/mcp`);
  console.log(`OpenAPI spec available at http://localhost:${PORT}/openapi.json`);
};

initialize();
