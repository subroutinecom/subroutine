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

export const authMiddleware = async (c: Context<{ Variables: { auth: AuthContext } }>, next: Next) => {
  const startTime = Date.now();
  try {
    const path = new URL(c.req.url).pathname;

    if (path.startsWith("/api/auth/") || path === "/status" || path === "/graphql") {
      return next();
    }

    const apiKey = c.req.header("x-api-key");
    if (apiKey) {
      const apiKeyAuth = await verifyApiKey(apiKey);
      console.log(`API key auth verification completed in ${Date.now() - startTime}ms`);
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
    console.log(`API key auth verification completed in ${Date.now() - startTime}ms`);

    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
      console.log(`Session auth verification completed in ${Date.now() - startTime}ms`);

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

    console.log(`Session auth verification completed in ${Date.now() - startTime}ms`);
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required. Provide session cookie or x-api-key header.",
        },
      },
      401
    );
  } finally {
    console.log(`Auth middleware completed in ${Date.now() - startTime}ms`);
  }
};
