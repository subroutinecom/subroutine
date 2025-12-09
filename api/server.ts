import { rateLimiter } from "@hono-rate-limiter/hono-rate-limiter";
import type { Context } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createYoga } from "graphql-yoga";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { generateCode, GenerateCodeOptionsSchema } from "./agent/agent-code-generator.ts";
import { formatInput } from "./agent/agent-input-formatter.ts";
import { testMockMcpServers } from "./agent/agent-mock-mcp-tester.ts";
import { coerceToSchema } from "./agent/agent-type-coercer.ts";
import { createModel } from "./agent/utils/providers.ts";
import { Capability } from "./agent/utils/types.ts";
import { auth } from "./auth.ts";
import { getConfig } from "./config/loader.ts";
import { initializeDatabase } from "./db/index.ts";
import { buildContext, schema } from "./internal/schema.ts";
import { createLegacyMcpServer } from "./mcp-legacy-server.ts";
import { createMcpServer } from "./mcp-server.ts";
import { type AuthContext, authMiddleware } from "./middlewares/auth.ts";
import { graphqlAuthMiddleware } from "./middlewares/graphql-auth.ts";
import { registerMockMcpServers } from "./mock-mcp-servers.ts";
import { IntegrationAuthRequiredError } from "./models/errors.ts";
import { getOrganizationBySlug, isUserMemberOfOrganization } from "./models/organization.ts";
import { submitPatLink, validatePatLink } from "./models/pat-link.ts";
import { getRun, listRuns, runSubroutine } from "./models/run.ts";
import { generateSubroutine, getSubroutine, listSubroutines } from "./models/subroutine.ts";
import { registerAuthenticatedTestEndpoints, registerTestEndpoints } from "./testEndpoints.ts";
import { registerUiRoutes } from "./ui/server.tsx";
import { getLogger } from "./utils/logger.ts";
import { NodeResponseAdapter } from "./utils/mcp-adapter.ts";
const logger = getLogger("api/server.ts", "warn");

const ENABLE_MOCK_OAUTH = Deno.env.get("ENABLE_MOCK_OAUTH") === "true";
const initialize = async () => {
  const app = new OpenAPIHono<{ Variables: { auth: AuthContext } }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const message = result.error.issues
          .map((i) => `${i.path.join(".")} ${i.message.toLowerCase()}`)
          .join(", ");
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

  // Global error handler to ensure all uncaught errors return JSON
  app.onError((err, c) => {
    logger.error("Unhandled error:", err);

    // Handle IntegrationAuthRequiredError specially
    if (err instanceof IntegrationAuthRequiredError) {
      return c.json(
        {
          error: {
            code: "INTEGRATION_AUTH_REQUIRED",
            message: err.message,
            integrationId: err.integrationId,
            provider: err.provider,
            authorizationUrl: err.authorizationUrl,
            state: err.state,
            viewerId: err.viewerId,
            requirements: err.requirements,
          },
        },
        403
      );
    }

    // Return all other errors as JSON with error details
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      500
    );
  });

  const PORT = process.env.PORT ? Number(process.env.PORT) : 80;

  await initializeDatabase();

  const config = await getConfig();

  app.use(
    "/admin-config.json",
    cors({
      origin: config.auth.allowedOrigins,
      credentials: true,
      allowMethods: ["GET", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 86400,
    }) as any
  );

  app.get("/admin-config.json", (c) => {
    const apiUrl = config.apiUrl ?? config.baseUrl;
    const graphqlUrl = `${apiUrl}/graphql`;
    const authBaseUrl = config.auth.baseUrl ?? apiUrl;
    const redirectBase = apiUrl;
    return c.json({
      apiUrl,
      graphqlUrl,
      authBaseUrl,
      redirectBase,
    });
  });

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

  registerUiRoutes(app);

  app.on(["POST", "GET"], "/api/auth/*", async (c) => {
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace("/api/auth", "");
    const response = await auth.handler(c.req.raw);
    return response;
  });

  // The MCP plugin auto-hosts these at /api/auth/.well-known/*, but some clients
  // expect them at the standard /.well-known/* locations
  app.get("/.well-known/oauth-authorization-server", (c) =>
    c.redirect("/api/auth/.well-known/oauth-authorization-server")
  );
  app.get("/.well-known/oauth-protected-resource", (c) =>
    c.redirect("/api/auth/.well-known/oauth-protected-resource")
  );

  app.use(
    "/api/oauth/*",
    cors({
      origin: config.auth.allowedOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cookie"],
      exposeHeaders: ["Set-Cookie"],
      maxAge: 86400,
    }) as any
  );

  app.use(
    "/api/subroutine/*",
    cors({
      origin: config.auth.allowedOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cookie", "x-api-key", "x-use-mock"],
      exposeHeaders: ["Set-Cookie"],
      maxAge: 86400,
    }) as any
  );

  app.use(
    "/api/subroutine",
    cors({
      origin: config.auth.allowedOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cookie", "x-api-key", "x-use-mock"],
      exposeHeaders: ["Set-Cookie"],
      maxAge: 86400,
    }) as any
  );

  app.use(
    "/api/run/*",
    cors({
      origin: config.auth.allowedOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cookie", "x-api-key"],
      exposeHeaders: ["Set-Cookie"],
      maxAge: 86400,
    }) as any
  );

  app.use(
    "/api/run",
    cors({
      origin: config.auth.allowedOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cookie", "x-api-key"],
      exposeHeaders: ["Set-Cookie"],
      maxAge: 86400,
    }) as any
  );

  app.get("/api/oauth/callback", async (c) => {
    try {
      const code = c.req.query("code");
      const state = c.req.query("state");
      const error = c.req.query("error");
      const errorDescription = c.req.query("error_description");

      if (error) {
        const message = errorDescription || error;
        const params = new URLSearchParams({
          success: "false",
          error: message,
        });
        return c.redirect(`/oauth/result?${params.toString()}`);
      }

      if (!code || !state) {
        const params = new URLSearchParams({
          success: "false",
          error: "Missing required parameters",
        });
        return c.redirect(`/oauth/result?${params.toString()}`);
      }

      const { handleOAuthCallback } = await import("./services/oauth.ts");
      const result = await handleOAuthCallback({ code, state });

      if (result.success) {
        const params = new URLSearchParams({
          success: "true",
          provider: result.provider || "",
          integrationId: result.integrationId || "",
          connectedAccountId: result.connectedAccountId || "",
        });
        return c.redirect(`/oauth/result?${params.toString()}`);
      } else {
        const params = new URLSearchParams({
          success: "false",
          error: result.error || "Unknown error",
        });
        return c.redirect(`/oauth/result?${params.toString()}`);
      }
    } catch (error) {
      logger.error("OAuth callback error:", error);
      const params = new URLSearchParams({
        success: "false",
        error: "An unexpected error occurred",
      });
      return c.redirect(`/oauth/result?${params.toString()}`);
    }
  });

  if (ENABLE_MOCK_OAUTH) {
    registerTestEndpoints(app);
  }

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

  app.use(
    "/api/pat-link/*",
    cors({
      origin: "*", // Public endpoint - allow any origin
      credentials: false,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 86400,
    }) as any
  );

  const getClientIp = (c: { req: { header: (name: string) => string | undefined } }) => {
    return (
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown"
    );
  };

  const rateLimitEnabled = config.rateLimit?.enabled ?? true;

  const patLinkGetLimiter = rateLimitEnabled
    ? rateLimiter({
        windowMs: config.rateLimit?.patLinkGet?.windowMs ?? 60000,
        limit: config.rateLimit?.patLinkGet?.limit ?? 30,
        standardHeaders: "draft-6",
        keyGenerator: getClientIp,
      })
    : async (_c: Context, next: () => Promise<void>) => next();

  const patLinkSubmitLimiter = rateLimitEnabled
    ? rateLimiter({
        windowMs: config.rateLimit?.patLinkSubmit?.windowMs ?? 60000,
        limit: config.rateLimit?.patLinkSubmit?.limit ?? 5,
        standardHeaders: "draft-6",
        keyGenerator: getClientIp,
      })
    : async (_c: Context, next: () => Promise<void>) => next();

  // GET /api/pat-link/:id - Get PAT link info (public)
  // @ts-expect-error - hono-rate-limiter types have minor incompatibility with local Hono types
  app.get("/api/pat-link/:id", patLinkGetLimiter, async (c) => {
    const id = c.req.param("id") as string;

    const validation = await validatePatLink(id);

    if (!validation.valid || !validation.patLink) {
      return c.json(
        {
          error: {
            code: "INVALID_LINK",
            message: validation.error || "Invalid or expired link",
          },
        },
        404
      );
    }

    const patLink = validation.patLink;

    return c.json({
      id: patLink.id,
      integration: patLink.integration,
      expiresAt: patLink.expiresAt,
    });
  });

  // @ts-expect-error - hono-rate-limiter types have minor incompatibility with local Hono types
  app.post("/api/pat-link/:id/submit", patLinkSubmitLimiter, async (c) => {
    const id = c.req.param("id") as string;

    let body: { pat?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid JSON body",
          },
        },
        400
      );
    }

    if (!body.pat || typeof body.pat !== "string") {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "pat field is required",
          },
        },
        400
      );
    }

    const result = await submitPatLink(id, body.pat);

    if (!result.success) {
      return c.json(
        {
          error: {
            code: "SUBMISSION_FAILED",
            message: result.error || "Failed to submit token",
          },
        },
        400
      );
    }

    return c.json({ success: true });
  });

  if (Deno.env.get("NODE_ENV") !== "production") {
    app.post("/api/dev/generate-code", async (c) => {
      const RequestSchema = GenerateCodeOptionsSchema.extend({
        request: z.string(),
      });

      let body: z.infer<typeof RequestSchema>;
      try {
        const json = await c.req.json();
        body = RequestSchema.parse(json);
      } catch (error) {
        logger.error("Failed to parse generate code options", error);
        return c.json(
          {
            success: false,
            error: error instanceof z.ZodError ? error.issues : "Invalid JSON body",
          },
          400
        );
      }

      const model = await createModel(Capability.CODING);
      if (!model) {
        return c.json({ success: false, error: "Failed to create coding model" }, 500);
      }
      const result = await generateCode(model, body.request, body);

      return c.json(result);
    });

    app.post("/api/dev/type-coerce", async (c) => {
      let body: {
        input: unknown;
        schema?: string;
        instructions?: string;
        mode?: "auto" | "json" | "tool";
      };

      try {
        body = await c.req.json();
      } catch {
        return c.json({ success: false, error: "Invalid JSON body" }, 400);
      }

      if (!body.schema || typeof body.schema !== "string") {
        return c.json(
          { success: false, error: "schema field is required and must be a string" },
          400
        );
      }

      const result = await coerceToSchema<string>({
        input: body.input,
        schema: body.schema,
        instructions: body.instructions,
        mode: body.mode,
      });

      if (!result.success) {
        return c.json(result, 400);
      }

      return c.json(result);
    });

    app.post("/api/dev/input-format", async (c) => {
      let body: {
        input: unknown;
        schema?: string;
        mode?: "auto" | "json" | "tool";
      };

      try {
        body = await c.req.json();
      } catch {
        return c.json({ success: false, error: "Invalid JSON body" }, 400);
      }

      if (!body.schema || typeof body.schema !== "string") {
        return c.json(
          { success: false, error: "schema field is required and must be a string" },
          400
        );
      }

      const result = await formatInput<string>({
        input: body.input,
        schema: body.schema,
        mode: body.mode,
      });

      if (!result.success) {
        return c.json(result, 400);
      }

      return c.json(result);
    });

    app.post("/api/dev/test-mock-mcp", async (c) => {
      let body: { prompt?: string } = {};
      try {
        body = await c.req.json();
      } catch {
        // Ignore JSON parse error, use default prompt
      }

      const prompt =
        body.prompt ||
        "What is the weather in Paris? Do I have any urgent emails? And what is the latest commit on main?";

      const result = await testMockMcpServers(PORT, prompt);
      if (!result.success) {
        return c.json(result, 500);
      }
      return c.json(result);
    });

    registerMockMcpServers(app);
  }

  app.use("*", authMiddleware);

  // Register test endpoints that require authentication
  if (ENABLE_MOCK_OAUTH) {
    registerAuthenticatedTestEndpoints(app);
  }

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const ErrorSchema = z.object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .passthrough(),
  });

  const SubroutineSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    integrationIds: z.array(z.string()),
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
    organizationId: z.string(),
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
                request: z
                  .string()
                  .describe("Natural language description of the desired subroutine"),
                viewerId: z.string().describe("External viewer identifier"),
                integrations: z.array(z.string()).optional(),
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
        403: {
          description: "Organization required or integration authorization needed",
          content: {
            "application/json": {
              schema: ErrorSchema,
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
      const auth = c.get("auth");
      if (!auth?.organizationId) {
        return c.json(
          {
            error: {
              code: "ORGANIZATION_REQUIRED",
              message: "Active organization is required to create subroutines",
            },
          },
          403
        );
      }

      try {
        const { request, viewerId, integrations } = c.req.valid("json");

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
          viewerId,
          integrations,
          organizationId: auth.organizationId,
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
        if (error instanceof IntegrationAuthRequiredError) {
          return c.json(
            {
              error: {
                code: "INTEGRATION_AUTH_REQUIRED",
                message: error.message,
                integrationId: error.integrationId,
                provider: error.provider,
                authorizationUrl: error.authorizationUrl,
                state: error.state,
                viewerId: error.viewerId,
                requirements: error.requirements,
              },
            },
            403
          );
        }

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
                request: z
                  .string()
                  .describe("Natural language description of the desired subroutine"),
                viewerId: z.string().describe("External viewer identifier"),
                timeoutMs: z.number().optional(),
                integrations: z.array(z.string()).optional(),
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
        403: {
          description: "Organization required or integration authorization needed",
          content: {
            "application/json": {
              schema: ErrorSchema,
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
      const auth = c.get("auth");
      if (!auth?.organizationId) {
        return c.json(
          {
            error: {
              code: "ORGANIZATION_REQUIRED",
              message: "Active organization is required to create subroutines",
            },
          },
          403
        );
      }

      // Track subroutine separately so we can include it in error responses
      let generatedSubroutine: Awaited<ReturnType<typeof generateSubroutine>> | null = null;

      try {
        const { request, timeoutMs, integrations, viewerId } = c.req.valid("json");

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
        generatedSubroutine = await generateSubroutine({
          request,
          viewerId,
          integrations,
          organizationId: auth.organizationId,
          useMock,
          shouldGenerateInputs: true,
        });
        if (!generatedSubroutine.initialInputs) {
          throw new Error("Generated subroutine did not include generated inputs");
        }

        const run = await runSubroutine({
          subroutineId: generatedSubroutine.id,
          organizationId: auth.organizationId,
          viewerId,
          inputs: generatedSubroutine.initialInputs,
          timeoutMs,
          wait: true,
        });

        return c.json(
          {
            subroutineUri: `resource://subroutine/${generatedSubroutine.id}`,
            subroutine: generatedSubroutine,
            runUri: `resource://run/${run.id}`,
            run,
            initialInputs: generatedSubroutine.initialInputs,
          },
          201
        );
      } catch (error) {
        if (error instanceof IntegrationAuthRequiredError) {
          // Include subroutine data if it was generated before the auth error
          return c.json(
            {
              error: {
                code: "INTEGRATION_AUTH_REQUIRED",
                message: error.message,
                integrationId: error.integrationId,
                provider: error.provider,
                authorizationUrl: error.authorizationUrl,
                state: error.state,
                viewerId: error.viewerId,
                requirements: error.requirements,
              },
              // If subroutine was generated before the runtime auth error, include it
              ...(generatedSubroutine && {
                subroutine: generatedSubroutine,
                subroutineUri: `resource://subroutine/${generatedSubroutine.id}`,
              }),
            },
            403
          );
        }

        const message =
          error instanceof Error ? error.message : "Failed to create and run subroutine";
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
        403: {
          description: "Organization required",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      if (!auth?.organizationId) {
        return c.json(
          {
            error: {
              code: "ORGANIZATION_REQUIRED",
              message: "Active organization is required to list subroutines",
            },
          },
          403
        );
      }

      const subroutines = await listSubroutines(auth.organizationId);
      return c.json({ subroutines }) as never;
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
        403: {
          description: "Organization required",
          content: {
            "application/json": {
              schema: ErrorSchema,
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
      const auth = c.get("auth");
      if (!auth?.organizationId) {
        return c.json(
          {
            error: {
              code: "ORGANIZATION_REQUIRED",
              message: "Active organization is required to view this subroutine",
            },
          },
          403
        );
      }

      const { id } = c.req.valid("param");
      const subroutine = await getSubroutine(id, auth.organizationId);

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
                viewerId: z.string().describe("External viewer identifier"),
                inputs: z.record(z.unknown()).optional(),
                timeoutMs: z.number().optional(),
                wait: z
                  .boolean()
                  .optional()
                  .describe(
                    "If false, return immediately without waiting for execution. Default: true (waits for completion)"
                  ),
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
        403: {
          description: "Organization required or integration authorization needed",
          content: {
            "application/json": {
              schema: ErrorSchema,
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
      const auth = c.get("auth");
      if (!auth?.organizationId) {
        return c.json(
          {
            error: {
              code: "ORGANIZATION_REQUIRED",
              message: "Active organization is required to run a subroutine",
            },
          },
          403
        );
      }

      try {
        const { id } = c.req.valid("param");
        const { viewerId, inputs, timeoutMs, wait } = c.req.valid("json");

        const run = await runSubroutine({
          subroutineId: id,
          organizationId: auth.organizationId,
          viewerId,
          inputs,
          timeoutMs,
          wait: wait ?? true,
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

        if (error instanceof IntegrationAuthRequiredError) {
          return c.json(
            {
              error: {
                code: "INTEGRATION_AUTH_REQUIRED",
                message: error.message,
                integrationId: error.integrationId,
                provider: error.provider,
                authorizationUrl: error.authorizationUrl,
                state: error.state,
                viewerId: error.viewerId,
                requirements: error.requirements,
              },
            },
            403
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
        403: {
          description: "Organization required",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
      },
    }),
    async (c) => {
      const auth = c.get("auth");
      if (!auth?.organizationId) {
        return c.json(
          {
            error: {
              code: "ORGANIZATION_REQUIRED",
              message: "Active organization is required to list runs",
            },
          },
          403
        );
      }

      const runs = await listRuns(auth.organizationId);
      return c.json({ runs }) as never;
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
        403: {
          description: "Organization required",
          content: {
            "application/json": {
              schema: ErrorSchema,
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
      const auth = c.get("auth");
      if (!auth?.organizationId) {
        return c.json(
          {
            error: {
              code: "ORGANIZATION_REQUIRED",
              message: "Active organization is required to view run details",
            },
          },
          403
        );
      }

      logger.info("Fetching run with ID:", c.req.valid("param").id);
      const { id } = c.req.valid("param");
      const run = await getRun(id, auth.organizationId);
      logger.info("Fetched run:", run);

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

  app.post("/mcp-legacy", async (c) => {
    const auth = c.get("auth");
    if (!auth?.organizationId) {
      return c.json(
        {
          error: {
            code: "ORGANIZATION_REQUIRED",
            message: "Active organization is required to use MCP",
          },
        },
        403
      );
    }

    const sessionId = c.req.header("mcp-session-id");

    if (sessionId) {
      logger.info(`Received MCP request for session: ${sessionId}`);
    } else {
      logger.info("New MCP request");
    }

    try {
      let transport: StreamableHTTPServerTransport;
      const body = await c.req.json();
      logger.info("MCP request body:", JSON.stringify(body, null, 2));

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            logger.info(`Session initialized with ID: ${newSessionId}`);
            transports[newSessionId] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            logger.info(`Transport closed for session ${sid}, removing from transports map`);
            delete transports[sid];
          }
        };

        const server = createLegacyMcpServer(auth);
        await server.connect(transport);
        const req = c.req.raw;
        const res = new NodeResponseAdapter();
        // @ts-ignore - MCP SDK expects Node.js HTTP response types
        await transport.handleRequest(req, res, body);
        const response = res.toResponse();
        logger.info("MCP response status:", response.status);
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

      // Ensure Accept header includes both when talking to streamable transport
      const headersObj = Object.fromEntries(c.req.raw.headers.entries());
      const currentAccept = (headersObj["accept"] ?? headersObj["Accept"] ?? "") as string;
      const needsEventStream = !currentAccept.includes("text/event-stream");
      if (needsEventStream) {
        headersObj["accept"] = "application/json, text/event-stream";
      }
      if (!("content-type" in headersObj) && !("Content-Type" in headersObj)) {
        headersObj["content-type"] = "application/json";
      }

      const nodeReq = {
        method: c.req.method,
        url: c.req.url,
        headers: headersObj,
      };

      const res = new NodeResponseAdapter();
      // Default to JSON responses for POST when JSON fallback is enabled
      if (!res.getHeader("content-type")) {
        res.setHeader("content-type", "application/json; charset=utf-8");
      }
      // @ts-ignore - MCP SDK expects Node.js HTTP response types
      await transport.handleRequest(nodeReq, res, body);
      return res.toResponse();
    } catch (error) {
      logger.error("Error handling MCP request:", error);
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

  app.get("/mcp-legacy", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    if (!sessionId || !transports[sessionId]) {
      return c.text("Invalid or missing session ID", 400);
    }

    logger.info(`Establishing SSE stream for session ${sessionId}`);
    const transport = transports[sessionId];
    const req = c.req.raw;
    const res = new NodeResponseAdapter();
    if (!res.getHeader("content-type")) {
      res.setHeader("content-type", "text/event-stream; charset=utf-8");
    }
    // @ts-ignore - MCP SDK expects Node.js HTTP response types
    await transport.handleRequest(req, res);
    return res.toResponse();
  });

  app.delete("/mcp-legacy", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    if (!sessionId || !transports[sessionId]) {
      return c.text("Invalid or missing session ID", 400);
    }

    logger.info(`Received session termination request for session ${sessionId}`);

    try {
      const transport = transports[sessionId];
      const req = c.req.raw;
      const res = new NodeResponseAdapter();
      // @ts-ignore - MCP SDK expects Node.js HTTP response types
      await transport.handleRequest(req, res);
      return res.toResponse();
    } catch (error) {
      logger.error("Error handling session termination:", error);
      return c.text("Error processing session termination", 500);
    }
  });

  const mcpOAuthTransports: Record<string, StreamableHTTPServerTransport> = {};

  // Helper to extract orgSlug from @-prefixed path param
  const extractOrgSlug = (atOrg: string) => atOrg.slice(1); // Remove @ prefix

  // MCP OAuth routes use regex pattern because Hono's router doesn't handle /@literal correctly
  app.get("/:atOrg{@[^/]+}", async (c) => {
    const orgSlug = extractOrgSlug(c.req.param("atOrg")!);

    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return c.json({ error: "Organization not found" }, 404);
    }

    return c.json({
      name: `${org.name} MCP Server`,
      version: "0.1.0",
      protocolVersion: "2025-03-26",
    });
  });

  app.post("/:atOrg{@[^/]+}", async (c) => {
    const orgSlug = extractOrgSlug(c.req.param("atOrg")!);

    // 1. Look up organization by slug
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000 as const, message: "Organization not found" },
          id: null,
        },
        404
      );
    }

    // 2. Validate OAuth session using better-auth MCP plugin
    // Type assertion needed because TypeScript doesn't infer plugin methods
    // getMcpSession returns the OAuth access token data with userId directly
    const getMcpSession = (auth.api as any).getMcpSession as (opts: {
      headers: Headers;
    }) => Promise<{ userId: string; accessToken: string; scopes: string } | null>;
    const session = await getMcpSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      const resourceUrl = `${config.apiUrl ?? config.baseUrl}/@${orgSlug}`;
      c.header("WWW-Authenticate", `Bearer resource="${resourceUrl}"`);
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001 as const, message: "Unauthorized" },
          id: null,
        },
        401
      );
    }

    // 3. Verify user is a member of the organization
    const isMember = await isUserMemberOfOrganization(session.userId, org.id);
    if (!isMember) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32003 as const, message: "Not a member of this organization" },
          id: null,
        },
        403
      );
    }

    // 4. Handle MCP request with organization context
    const transportKey = `${org.id}:${session.userId}`;

    try {
      let transport: StreamableHTTPServerTransport;
      const body = await c.req.json();
      const initialize = isInitializeRequest(body);

      if (!mcpOAuthTransports[transportKey]) {
        if (!initialize) {
          return c.json(
            {
              jsonrpc: "2.0",
              error: {
                code: -32000 as const,
                message: "Bad Request: No valid session initialized",
              },
              id: null,
            },
            400
          );
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => transportKey,
          onsessioninitialized: (newSessionId) => {
            mcpOAuthTransports[newSessionId] = transport;
          },
          enableJsonResponse: true,
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && mcpOAuthTransports[sid]) {
            delete mcpOAuthTransports[sid];
          }
        };

        const server = createMcpServer({
          organizationId: org.id,
          userId: session.userId,
        });
        await server.connect(transport);
      } else {
        if (initialize) {
          // Reset the existing session to allow re-initialization
          delete mcpOAuthTransports[transportKey];
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => transportKey,
            onsessioninitialized: (newSessionId) => {
              mcpOAuthTransports[newSessionId] = transport;
            },
            enableJsonResponse: true,
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && mcpOAuthTransports[sid]) {
              delete mcpOAuthTransports[sid];
            }
          };

          const server = createMcpServer({
            organizationId: org.id,
            userId: session.userId,
          });
          await server.connect(transport);
        } else {
          transport = mcpOAuthTransports[transportKey];
        }
      }

      const headersObj = Object.fromEntries(c.req.raw.headers.entries());
      // Force JSON Accept for non-streaming transport
      const currentAccept = (headersObj["accept"] ?? headersObj["Accept"] ?? "") as string;
      if (!currentAccept) {
        headersObj["accept"] = "application/json";
      }
      if (!("content-type" in headersObj) && !("Content-Type" in headersObj)) {
        headersObj["content-type"] = "application/json";
      }
      // Ensure session header is present for the transport
      headersObj["mcp-session-id"] = transportKey;

      const nodeReq = {
        method: c.req.method,
        url: c.req.url,
        headers: headersObj,
      };

      const res = new NodeResponseAdapter();
      // Explicit JSON content-type (default) before SDK writes
      if (!res.getHeader("content-type")) {
        res.setHeader("content-type", "application/json; charset=utf-8");
      }

      // Wait for SDK to finish writing (it calls end asynchronously)
      const finished = new Promise<void>((resolve) => {
        // @ts-ignore - adapter implements once
        res.once("close", () => resolve());
      });
      // @ts-ignore - MCP SDK expects Node.js HTTP response types
      await transport.handleRequest(nodeReq, res, body);
      await finished;
      const debugOut = {
        status: res.statusCode,
        headers: res.getHeaders(),
        body: res.getBodyText(),
      };
      logger.info("MCP OAuth POST response", JSON.stringify(debugOut));
      return res.toResponse();
    } catch (error) {
      logger.error("Error handling MCP OAuth request:", error);
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32603 as const, message: "Internal server error" },
          id: null,
        },
        500
      );
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

  logger.info(`Server running on port ${PORT}`);
  logger.info(`GraphQL endpoint available at http://localhost:${PORT}/graphql`);
  logger.info(`MCP OAuth endpoint available at http://localhost:${PORT}/@{orgSlug}`);
  logger.info(`MCP legacy endpoint available at http://localhost:${PORT}/mcp-legacy`);
  logger.info(`OpenAPI spec available at http://localhost:${PORT}/openapi.json`);
};

initialize();
