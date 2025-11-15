import type { Context, Next } from "hono";
import { auth } from "../auth.ts";
import { verifyApiKey } from "../models/apikey.ts";

export type AuthContext = {
  type: "apikey" | "session";
  userId: string;
  organizationId?: string | null;
  user?: any;
  session?: any;
};

export const authMiddleware = async (
  c: Context<{ Variables: { auth: AuthContext } }>,
  next: Next,
) => {
  const path = new URL(c.req.url).pathname;

  if (path.startsWith("/api/auth/") || path === "/status") {
    return next();
  }

  const apiKey = c.req.header("x-api-key");
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
      401,
    );
  }

  try {
    const sessionData = await auth.api.getSession({
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
    console.error("Session auth error:", error);
  }

  return c.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message:
          "Authentication required. Provide session cookie or x-api-key header.",
      },
    },
    401,
  );
};
