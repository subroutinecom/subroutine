import type { Context, Next } from "hono";

export const graphqlAuthMiddleware = async (
  c: Context,
  next: Next,
) => {
  const apiKey = c.req.header("x-api-key");
  if (apiKey) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message:
            "GraphQL endpoint does not accept API key authentication. Please use session cookies.",
        },
      },
      401,
    );
  }

  return next();
};
