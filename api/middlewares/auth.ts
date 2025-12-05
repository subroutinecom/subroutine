import type { Context, Next } from "hono";
import { auth } from "../auth.ts";
import { verifyApiKey } from "../models/apikey.ts";
import { getLogger } from "../utils/logger.ts";
const logger = getLogger("api/middlewares/auth.ts");

type ApiSession = Awaited<ReturnType<typeof auth.api.getSession>>;
type SessionData = NonNullable<ApiSession>;

export type AuthContext = {
  type: "apikey" | "session";
  userId: string;
  organizationId?: string | null;
  user?: SessionData["user"];
  session?: SessionData["session"];
};

export const authMiddleware = async (
  c: Context<{ Variables: { auth: AuthContext } }>,
  next: Next
) => {
  const path = new URL(c.req.url).pathname;

  if (
    path.startsWith("/api/auth/") ||
    path === "/status" ||
    path === "/graphql" ||
    path.startsWith("/@") ||
    path.startsWith("/.well-known/")
  ) {
    return next();
  }

  // Check for API key in x-api-key header (legacy support)
  let apiKey = c.req.header("x-api-key");

  // Check for Bearer token in Authorization header (MCP standard)
  if (!apiKey) {
    const authHeader = c.req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7); // Remove "Bearer " prefix
    }
  }

  if (apiKey) {
    const apiKeyAuth = await verifyApiKey(apiKey);
    if (apiKeyAuth) {
      c.set("auth", {
        type: "apikey",
        userId: apiKeyAuth.userId,
        organizationId: apiKeyAuth.organizationId,
      });
      return next();
    }
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid API key",
        },
      },
      401
    );
  }

  try {
    const sessionData: ApiSession = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (sessionData?.session && sessionData?.user) {
      c.set("auth", {
        type: "session",
        userId: sessionData.user.id,
        organizationId: sessionData.session.activeOrganizationId,
        user: sessionData.user,
        session: sessionData.session,
      });
      return next();
    }
  } catch (error) {
    logger.error("Session auth error:", error);
  }

  return c.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message:
          "Authentication required. Provide session cookie, x-api-key header, or Authorization: Bearer token.",
      },
    },
    401
  );
};
