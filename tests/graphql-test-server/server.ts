/**
 * Test GraphQL Server for integration testing.
 *
 * Provides a simple GraphQL API for testing GraphQL client integration:
 * - echo: Returns the input message
 * - add: Adds two numbers
 * - getAuthInfo: Returns information about the Authorization header
 * - concat: Concatenates strings (for testing arrays)
 *
 * Supports different auth modes:
 * - No auth (public)
 * - API key in custom header
 * - Bearer token in Authorization header
 */

import { createYoga, createSchema } from "graphql-yoga";
import { Hono } from "@hono/hono";

export interface TestGraphQLServerConfig {
  port: number;
  /** If set, requires this exact API key in the specified header */
  requiredApiKey?: {
    key: string;
    headerName: string;
  };
  /** If set, requires a Bearer token in Authorization header */
  requireBearerToken?: boolean;
}

/**
 * Creates and starts a test GraphQL server.
 * Returns a cleanup function to stop the server.
 */
export const startTestGraphQLServer = (
  config: TestGraphQLServerConfig
): {
  stop: () => void;
  port: number;
  url: string;
} => {
  const { port, requiredApiKey, requireBearerToken } = config;

  // Store the current request's auth header for getAuthInfo resolver
  let currentAuthHeader: string | null = null;
  let currentCustomHeaders: Record<string, string> = {};

  const schema = createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        """
        Returns the input message back. Useful for testing basic connectivity.
        """
        echo(message: String!): String!

        """
        Adds two numbers together and returns the result.
        """
        add(a: Int!, b: Int!): AddResult!

        """
        Returns information about the authentication header.
        Useful for testing auth passthrough.
        """
        getAuthInfo: AuthInfo!

        """
        Concatenates multiple strings with an optional separator.
        """
        concat(strings: [String!]!, separator: String): String!

        """
        Returns a greeting for a user. Tests variables.
        """
        greet(name: String!, excited: Boolean): String!
      }

      type Mutation {
        """
        Creates a test item. Useful for testing mutations.
        """
        createItem(name: String!, value: Int!): Item!
      }

      type AddResult {
        result: Int!
        a: Int!
        b: Int!
      }

      type AuthInfo {
        hasAuth: Boolean!
        authType: String
        tokenPrefix: String
        tokenLength: Int!
        customHeaders: [HeaderEntry!]!
      }

      type HeaderEntry {
        name: String!
        value: String!
      }

      type Item {
        id: String!
        name: String!
        value: Int!
        createdAt: String!
      }
    `,
    resolvers: {
      Query: {
        echo: (_: unknown, { message }: { message: string }) => message,

        add: (_: unknown, { a, b }: { a: number; b: number }) => ({
          result: a + b,
          a,
          b,
        }),

        getAuthInfo: () => {
          const hasAuth = !!currentAuthHeader;
          let authType: string | null = null;
          let tokenPrefix: string | null = null;
          let tokenLength = 0;

          if (currentAuthHeader) {
            if (currentAuthHeader.startsWith("Bearer ")) {
              authType = "bearer";
              const token = currentAuthHeader.replace("Bearer ", "");
              tokenPrefix = token.substring(0, 20);
              tokenLength = token.length;
            } else {
              authType = "other";
              tokenPrefix = currentAuthHeader.substring(0, 20);
              tokenLength = currentAuthHeader.length;
            }
          }

          // Include custom headers (X-* headers)
          const customHeaders = Object.entries(currentCustomHeaders)
            .filter(([name]) => name.toLowerCase().startsWith("x-"))
            .map(([name, value]) => ({ name, value }));

          return {
            hasAuth,
            authType,
            tokenPrefix,
            tokenLength,
            customHeaders,
          };
        },

        concat: (
          _: unknown,
          { strings, separator }: { strings: string[]; separator?: string }
        ) => strings.join(separator ?? ""),

        greet: (
          _: unknown,
          { name, excited }: { name: string; excited?: boolean }
        ) => (excited ? `Hello, ${name}!!!` : `Hello, ${name}.`),
      },
      Mutation: {
        createItem: (
          _: unknown,
          { name, value }: { name: string; value: number }
        ) => ({
          id: crypto.randomUUID(),
          name,
          value,
          createdAt: new Date().toISOString(),
        }),
      },
    },
  });

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    // Capture headers before each request
    context: ({ request }) => {
      currentAuthHeader = request.headers.get("authorization");
      currentCustomHeaders = {};
      request.headers.forEach((value, name) => {
        currentCustomHeaders[name] = value;
      });
      return {};
    },
  });

  const app = new Hono();

  // Auth middleware for GraphQL endpoint
  app.use("/graphql", async (c, next) => {
    // Check API key auth
    if (requiredApiKey) {
      const headerValue = c.req.header(requiredApiKey.headerName);
      if (!headerValue) {
        return c.json(
          { errors: [{ message: `${requiredApiKey.headerName} header required` }] },
          401
        );
      }
      if (headerValue !== requiredApiKey.key) {
        return c.json(
          { errors: [{ message: "Invalid API key" }] },
          401
        );
      }
    }

    // Check Bearer token auth
    if (requireBearerToken) {
      const authHeader = c.req.header("authorization");
      if (!authHeader) {
        return c.json(
          { errors: [{ message: "Authorization header required" }] },
          401
        );
      }
      if (!authHeader.startsWith("Bearer ")) {
        return c.json(
          { errors: [{ message: "Bearer token required" }] },
          401
        );
      }
      const token = authHeader.replace("Bearer ", "");
      if (!token || token.length === 0) {
        return c.json(
          { errors: [{ message: "Token cannot be empty" }] },
          401
        );
      }
    }

    return next();
  });

  // Mount GraphQL yoga
  app.on(["GET", "POST"], "/graphql", async (c) => {
    const response = await yoga.handle(c.req.raw, {});
    return response;
  });

  // Health check
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      queries: ["echo", "add", "getAuthInfo", "concat", "greet"],
      mutations: ["createItem"],
      authMode: requiredApiKey
        ? `api_key (${requiredApiKey.headerName})`
        : requireBearerToken
          ? "bearer"
          : "none",
    });
  });

  const abortController = new AbortController();

  Deno.serve(
    {
      port,
      hostname: "0.0.0.0",
      signal: abortController.signal,
      onListen: () => {
        console.log(`Test GraphQL server running on http://0.0.0.0:${port}`);
      },
    },
    app.fetch
  );

  return {
    stop: () => {
      abortController.abort();
    },
    port,
    url: `http://0.0.0.0:${port}/graphql`,
  };
};

// Allow running directly
if (import.meta.main) {
  const port = parseInt(Deno.env.get("PORT") ?? "3457");
  const apiKey = Deno.env.get("REQUIRED_API_KEY");
  const apiKeyHeader = Deno.env.get("API_KEY_HEADER") ?? "X-API-Key";
  const requireBearer = Deno.env.get("REQUIRE_BEARER") === "true";

  const server = startTestGraphQLServer({
    port,
    requiredApiKey: apiKey ? { key: apiKey, headerName: apiKeyHeader } : undefined,
    requireBearerToken: requireBearer,
  });

  console.log(`GraphQL endpoint: ${server.url}`);
  console.log(`Health check: http://127.0.0.1:${port}/health`);
  if (apiKey) {
    console.log(`Auth required: API key in ${apiKeyHeader} header`);
  } else if (requireBearer) {
    console.log("Auth required: Bearer token");
  } else {
    console.log("Auth: None required");
  }
}
