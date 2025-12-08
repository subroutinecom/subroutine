/**
 * Test OpenAPI/REST Server for integration testing.
 *
 * Provides a simple REST API with OpenAPI spec for testing OpenAPI client integration:
 * - GET /echo?message=... - Returns the input message
 * - GET /add?a=...&b=... - Adds two numbers
 * - GET /auth-info - Returns information about the Authorization header
 * - GET /users - List users (with pagination)
 * - GET /users/{userId} - Get a specific user
 * - POST /users - Create a user
 * - PUT /users/{userId} - Update a user
 * - DELETE /users/{userId} - Delete a user
 *
 * Supports different auth modes:
 * - No auth (public)
 * - API key in custom header
 * - Bearer token in Authorization header
 */

import { Hono } from "@hono/hono";

export interface TestOpenAPIServerConfig {
  port: number;
  /** If set, requires this exact API key in the specified header */
  requiredApiKey?: {
    key: string;
    headerName: string;
  };
  /** If set, requires a Bearer token in Authorization header */
  requireBearerToken?: boolean;
}

// In-memory storage for users
const users = new Map<string, { id: string; name: string; email: string; createdAt: string }>();

// Initialize with some test data
users.set("user-1", {
  id: "user-1",
  name: "Alice",
  email: "alice@example.com",
  createdAt: new Date().toISOString(),
});
users.set("user-2", {
  id: "user-2",
  name: "Bob",
  email: "bob@example.com",
  createdAt: new Date().toISOString(),
});

/**
 * OpenAPI 3.0 specification for the test server.
 *
 * This spec uses $ref extensively to test proper $ref resolution:
 * - Schema references: $ref: "#/components/schemas/User"
 * - Parameter references: $ref: "#/components/parameters/UserId"
 * - Response references: $ref: "#/components/responses/NotFound"
 * - Nested references: UserWithPosts contains a $ref to Post
 */
const openAPISpec = {
  openapi: "3.0.3",
  info: {
    title: "Test REST API",
    description: "A test REST API for OpenAPI integration testing with extensive $ref usage",
    version: "1.0.0",
  },
  servers: [
    {
      url: "http://localhost:3458",
      description: "Local test server",
    },
  ],
  paths: {
    "/echo": {
      get: {
        operationId: "echo",
        summary: "Echo a message back",
        parameters: [
          {
            name: "message",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "The message to echo back",
          },
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EchoResponse" },
              },
            },
          },
        },
      },
    },
    "/add": {
      get: {
        operationId: "add",
        summary: "Add two numbers",
        parameters: [
          { $ref: "#/components/parameters/NumberA" },
          { $ref: "#/components/parameters/NumberB" },
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AddResult" },
              },
            },
          },
        },
      },
    },
    "/auth-info": {
      get: {
        operationId: "getAuthInfo",
        summary: "Get information about the current authentication",
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthInfo" },
              },
            },
          },
        },
      },
    },
    "/users": {
      get: {
        operationId: "listUsers",
        summary: "List all users",
        parameters: [
          { $ref: "#/components/parameters/Limit" },
          { $ref: "#/components/parameters/Offset" },
        ],
        responses: {
          "200": {
            description: "List of users",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserList" },
              },
            },
          },
        },
      },
      post: {
        operationId: "createUser",
        summary: "Create a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateUserRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "User created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
        },
      },
    },
    "/users/{userId}": {
      parameters: [
        { $ref: "#/components/parameters/UserId" },
      ],
      get: {
        operationId: "getUser",
        summary: "Get a user by ID",
        responses: {
          "200": {
            description: "User found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      put: {
        operationId: "updateUser",
        summary: "Update a user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateUserRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "User updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        operationId: "deleteUser",
        summary: "Delete a user",
        responses: {
          "204": {
            description: "User deleted",
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/users/{userId}/posts": {
      parameters: [
        { $ref: "#/components/parameters/UserId" },
      ],
      get: {
        operationId: "getUserPosts",
        summary: "Get posts by a user (demonstrates nested $ref resolution)",
        responses: {
          "200": {
            description: "User's posts",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Post" },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/users/{userId}/profile": {
      parameters: [
        { $ref: "#/components/parameters/UserId" },
      ],
      get: {
        operationId: "getUserProfile",
        summary: "Get user profile with nested refs (UserWithPosts contains User and Post refs)",
        responses: {
          "200": {
            description: "User profile with posts",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserWithPosts" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  },
  components: {
    parameters: {
      UserId: {
        name: "userId",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "The unique identifier of the user",
      },
      Limit: {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", default: 10 },
        description: "Maximum number of items to return",
      },
      Offset: {
        name: "offset",
        in: "query",
        required: false,
        schema: { type: "integer", default: 0 },
        description: "Number of items to skip",
      },
      NumberA: {
        name: "a",
        in: "query",
        required: true,
        schema: { type: "integer" },
        description: "First number to add",
      },
      NumberB: {
        name: "b",
        in: "query",
        required: true,
        schema: { type: "integer" },
        description: "Second number to add",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Post: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
          authorId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      UserWithPosts: {
        type: "object",
        description: "User with their posts - demonstrates nested $ref resolution",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          posts: {
            type: "array",
            items: { $ref: "#/components/schemas/Post" },
          },
          postCount: { type: "integer" },
        },
      },
      UserList: {
        type: "object",
        properties: {
          users: {
            type: "array",
            items: { $ref: "#/components/schemas/User" },
          },
          total: { type: "integer" },
        },
      },
      CreateUserRequest: {
        type: "object",
        required: ["name", "email"],
        properties: {
          name: { type: "string" },
          email: { type: "string" },
        },
      },
      UpdateUserRequest: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
        },
      },
      EchoResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
      AddResult: {
        type: "object",
        properties: {
          result: { type: "integer" },
          a: { type: "integer" },
          b: { type: "integer" },
        },
      },
      AuthInfo: {
        type: "object",
        properties: {
          hasAuth: { type: "boolean" },
          authType: { type: "string", nullable: true },
          tokenPrefix: { type: "string", nullable: true },
          tokenLength: { type: "integer" },
          customHeaders: {
            type: "array",
            items: { $ref: "#/components/schemas/CustomHeader" },
          },
        },
      },
      CustomHeader: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "string" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
    responses: {
      NotFound: {
        description: "The requested resource was not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
      },
      BearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
  },
};

/**
 * Creates and starts a test OpenAPI server.
 * Returns a cleanup function to stop the server.
 */
export const startTestOpenAPIServer = (
  config: TestOpenAPIServerConfig
): {
  stop: () => void;
  port: number;
  url: string;
  specUrl: string;
} => {
  const { port, requiredApiKey, requireBearerToken } = config;

  const app = new Hono();

  // Auth middleware
  app.use("*", async (c, next) => {
    const path = c.req.path;

    // Skip auth for health check and OpenAPI spec
    if (path === "/health" || path === "/openapi.json") {
      return next();
    }

    // Check API key auth
    if (requiredApiKey) {
      const headerValue = c.req.header(requiredApiKey.headerName);
      if (!headerValue) {
        return c.json(
          { error: `${requiredApiKey.headerName} header required` },
          401
        );
      }
      if (headerValue !== requiredApiKey.key) {
        return c.json({ error: "Invalid API key" }, 401);
      }
    }

    // Check Bearer token auth
    if (requireBearerToken) {
      const authHeader = c.req.header("authorization");
      if (!authHeader) {
        return c.json({ error: "Authorization header required" }, 401);
      }
      if (!authHeader.startsWith("Bearer ")) {
        return c.json({ error: "Bearer token required" }, 401);
      }
      const token = authHeader.replace("Bearer ", "");
      if (!token || token.length === 0) {
        return c.json({ error: "Token cannot be empty" }, 401);
      }
    }

    return next();
  });

  // OpenAPI spec endpoint
  app.get("/openapi.json", (c) => {
    // Update the server URL dynamically
    const spec = {
      ...openAPISpec,
      servers: [{ url: `http://localhost:${port}`, description: "Test server" }],
    };
    return c.json(spec);
  });

  // Health check
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      endpoints: ["/echo", "/add", "/auth-info", "/users", "/users/{userId}"],
      authMode: requiredApiKey
        ? `api_key (${requiredApiKey.headerName})`
        : requireBearerToken
          ? "bearer"
          : "none",
    });
  });

  // Echo endpoint
  app.get("/echo", (c) => {
    const message = c.req.query("message") ?? "";
    return c.json({ message });
  });

  // Add endpoint
  app.get("/add", (c) => {
    const a = parseInt(c.req.query("a") ?? "0");
    const b = parseInt(c.req.query("b") ?? "0");
    return c.json({ result: a + b, a, b });
  });

  // Auth info endpoint
  app.get("/auth-info", (c) => {
    const authHeader = c.req.header("authorization");
    const hasAuth = !!authHeader;
    let authType: string | null = null;
    let tokenPrefix: string | null = null;
    let tokenLength = 0;

    if (authHeader) {
      if (authHeader.startsWith("Bearer ")) {
        authType = "bearer";
        const token = authHeader.replace("Bearer ", "");
        tokenPrefix = token.substring(0, 20);
        tokenLength = token.length;
      } else {
        authType = "other";
        tokenPrefix = authHeader.substring(0, 20);
        tokenLength = authHeader.length;
      }
    }

    // Collect custom headers (X-* headers)
    const customHeaders: Array<{ name: string; value: string }> = [];
    c.req.raw.headers.forEach((value, name) => {
      if (name.toLowerCase().startsWith("x-")) {
        customHeaders.push({ name, value });
      }
    });

    return c.json({
      hasAuth,
      authType,
      tokenPrefix,
      tokenLength,
      customHeaders,
    });
  });

  // List users
  app.get("/users", (c) => {
    const limit = parseInt(c.req.query("limit") ?? "10");
    const offset = parseInt(c.req.query("offset") ?? "0");
    const allUsers = Array.from(users.values());
    const paginatedUsers = allUsers.slice(offset, offset + limit);
    return c.json({
      users: paginatedUsers,
      total: allUsers.length,
    });
  });

  // Get user by ID
  app.get("/users/:userId", (c) => {
    const userId = c.req.param("userId");
    const user = users.get(userId);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json(user);
  });

  // Create user
  app.post("/users", async (c) => {
    const body = await c.req.json<{ name: string; email: string }>();
    const id = `user-${Date.now()}`;
    const user = {
      id,
      name: body.name,
      email: body.email,
      createdAt: new Date().toISOString(),
    };
    users.set(id, user);
    return c.json(user, 201);
  });

  // Update user
  app.put("/users/:userId", async (c) => {
    const userId = c.req.param("userId");
    const existingUser = users.get(userId);
    if (!existingUser) {
      return c.json({ error: "User not found" }, 404);
    }
    const body = await c.req.json<{ name?: string; email?: string }>();
    const updatedUser = {
      ...existingUser,
      name: body.name ?? existingUser.name,
      email: body.email ?? existingUser.email,
    };
    users.set(userId, updatedUser);
    return c.json(updatedUser);
  });

  // Delete user
  app.delete("/users/:userId", (c) => {
    const userId = c.req.param("userId");
    if (!users.has(userId)) {
      return c.json({ error: "User not found" }, 404);
    }
    users.delete(userId);
    return c.body(null, 204);
  });

  // Get user posts (demonstrates $ref resolution for array items)
  app.get("/users/:userId/posts", (c) => {
    const userId = c.req.param("userId");
    if (!users.has(userId)) {
      return c.json({ error: "User not found" }, 404);
    }
    // Return mock posts for the user
    return c.json([
      {
        id: `post-${userId}-1`,
        title: "First Post",
        content: "This is the first post content",
        authorId: userId,
        createdAt: new Date().toISOString(),
      },
      {
        id: `post-${userId}-2`,
        title: "Second Post",
        content: "This is the second post content",
        authorId: userId,
        createdAt: new Date().toISOString(),
      },
    ]);
  });

  // Get user profile with posts (demonstrates nested $ref resolution)
  app.get("/users/:userId/profile", (c) => {
    const userId = c.req.param("userId");
    const user = users.get(userId);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    // Return user with their posts (demonstrates UserWithPosts schema with nested refs)
    return c.json({
      user,
      posts: [
        {
          id: `post-${userId}-1`,
          title: "First Post",
          content: "This is the first post content",
          authorId: userId,
          createdAt: new Date().toISOString(),
        },
      ],
      postCount: 1,
    });
  });

  const abortController = new AbortController();

  Deno.serve(
    {
      port,
      hostname: "0.0.0.0",
      signal: abortController.signal,
      onListen: () => {
        console.log(`Test OpenAPI server running on http://0.0.0.0:${port}`);
      },
    },
    app.fetch
  );

  return {
    stop: () => {
      abortController.abort();
    },
    port,
    url: `http://0.0.0.0:${port}`,
    specUrl: `http://0.0.0.0:${port}/openapi.json`,
  };
};

// Allow running directly
if (import.meta.main) {
  const port = parseInt(Deno.env.get("PORT") ?? "3458");
  const apiKey = Deno.env.get("REQUIRED_API_KEY");
  const apiKeyHeader = Deno.env.get("API_KEY_HEADER") ?? "X-API-Key";
  const requireBearer = Deno.env.get("REQUIRE_BEARER") === "true";

  const server = startTestOpenAPIServer({
    port,
    requiredApiKey: apiKey ? { key: apiKey, headerName: apiKeyHeader } : undefined,
    requireBearerToken: requireBearer,
  });

  console.log(`REST API: ${server.url}`);
  console.log(`OpenAPI spec: ${server.specUrl}`);
  console.log(`Health check: http://127.0.0.1:${port}/health`);
  if (apiKey) {
    console.log(`Auth required: API key in ${apiKeyHeader} header`);
  } else if (requireBearer) {
    console.log("Auth required: Bearer token");
  } else {
    console.log("Auth: None required");
  }
}
