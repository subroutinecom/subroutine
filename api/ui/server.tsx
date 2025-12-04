import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { auth } from "../auth.ts";
import { getConfig } from "../config/loader.ts";
import { renderUi } from "./router.tsx";
import { getLogger } from "../utils/logger.ts";
const logger = getLogger("ui.server");


export const registerUiRoutes = (app: Hono<any>) => {
  const shouldForwardJsonAuth = (request: Request): boolean => {
    const contentType = request.headers.get("content-type") ?? "";
    const accept = request.headers.get("accept") ?? "";
    return contentType.includes("application/json") || accept.includes("application/json");
  };

  const forwardAuthRequest = (request: Request): Promise<Response> => auth.handler(request);

  app.get("/login", (c) => {
    const html = renderUi("/login");
    return c.html("<!DOCTYPE html>" + html);
  });

  app.post("/api/auth/sign-in/social", async (c) => {
    if (shouldForwardJsonAuth(c.req.raw)) {
      return forwardAuthRequest(c.req.raw);
    }

    try {
      const body = await c.req.parseBody();
      const provider = body.provider as string;
      const callbackURL = (body.callbackURL as string) || "/mcp";

      const response = await auth.api.signInSocial({
        body: { provider, callbackURL },
        asResponse: true,
      });

      const data = await response.json();

      if (data.url && data.redirect) {
        const headers = new Headers();
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() === "set-cookie") {
            headers.append(key, value);
          }
        });
        headers.set("Location", data.url);

        return new Response(null, {
          status: 302,
          headers,
        });
      }

      return c.redirect(`/mcp?error=${encodeURIComponent("Failed to start OAuth flow")}`);
    } catch (error) {
      logger.error("Social sign-in error:", error);
      return c.redirect("/mcp?error=An+unexpected+error+occurred");
    }
  });

  // Custom handler for email sign-in to support form redirects
  app.post("/api/auth/sign-in/email", async (c) => {
    if (shouldForwardJsonAuth(c.req.raw)) {
      return forwardAuthRequest(c.req.raw);
    }

    try {
      const body = await c.req.parseBody();
      const email = body.email as string;
      const password = body.password as string;
      const callbackURL = c.req.query("callbackURL") || "/mcp";

      const response = await auth.api.signInEmail({
        body: {
          email,
          password,
        },
        asResponse: true, // Get the full response to forward headers (cookies)
      });

      if (response.status === 200) {
        // Success - redirect to callback URL
        // We need to copy the Set-Cookie headers from the auth response
        const headers = new Headers();
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() === "set-cookie") {
            headers.append(key, value);
          }
        });
        headers.set("Location", callbackURL);

        return new Response(null, {
          status: 302,
          headers,
        });
      } else {
        // Failure - redirect back to login with error
        const errorData = await response.json();
        const errorMsg = errorData.message || "Invalid credentials";
        return c.redirect(`/login?error=${encodeURIComponent(errorMsg)}`);
      }
    } catch (error) {
      logger.error("Sign in error:", error);
      return c.redirect("/login?error=An+unexpected+error+occurred");
    }
  });

  // Custom handler for email sign-up to support form redirects
  app.post("/api/auth/sign-up/email", async (c) => {
    if (shouldForwardJsonAuth(c.req.raw)) {
      return forwardAuthRequest(c.req.raw);
    }

    try {
      const body = await c.req.parseBody();
      const email = body.email as string;
      const password = body.password as string;
      const name = (body.name as string) || email;
      const callbackURL = c.req.query("callbackURL") || "/mcp";

      const response = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name,
        },
        asResponse: true, // Get the full response to forward headers (cookies)
      });

      if (response.status === 200) {
        // Success - redirect to callback URL
        // We need to copy the Set-Cookie headers from the auth response
        const headers = new Headers();
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() === "set-cookie") {
            headers.append(key, value);
          }
        });
        headers.set("Location", callbackURL);

        return new Response(null, {
          status: 302,
          headers,
        });
      } else {
        // Failure - redirect back to signup with error
        const errorData = await response.json();
        const errorMsg = errorData.message || "Sign up failed";
        return c.redirect(`/mcp?mode=signup&error=${encodeURIComponent(errorMsg)}`);
      }
    } catch (error) {
      logger.error("Sign up error:", error);
      return c.redirect("/mcp?mode=signup&error=An+unexpected+error+occurred");
    }
  });

  // Custom handler for sign-out to support form redirects
  app.post("/api/auth/sign-out", async (c) => {
    if (shouldForwardJsonAuth(c.req.raw)) {
      return forwardAuthRequest(c.req.raw);
    }

    try {
      const callbackURL = c.req.query("callbackURL") || "/";

      const response = await auth.api.signOut({
        headers: c.req.raw.headers,
        asResponse: true,
      });

      // We need to copy the Set-Cookie headers from the auth response to clear cookies
      const headers = new Headers();
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
          headers.append(key, value);
        }
      });
      headers.set("Location", callbackURL);

      return new Response(null, {
        status: 302,
        headers,
      });
    } catch (error) {
      logger.error("Sign out error:", error);
      return c.redirect("/");
    }
  });

  app.get("/mcp", async (c) => {
    // Check if user is authenticated
    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      logger.info("GET /mcp - Session check:", {
        hasSession: !!sessionData?.session,
        hasUser: !!sessionData?.user,
        userId: sessionData?.user?.id,
        organizationId: sessionData?.session?.activeOrganizationId,
      });

      if (sessionData?.session && sessionData?.user) {
        let activeOrganizationId = sessionData.session.activeOrganizationId;

        // If no active organization, try to find one or create one
        if (!activeOrganizationId) {
          logger.info("GET /mcp - No active organization, checking existing orgs...");
          const organizations = await auth.api.listOrganizations({
            headers: c.req.raw.headers,
          });

          if (organizations && organizations.length > 0) {
            // Use the first available organization
            activeOrganizationId = organizations[0].id;
            logger.info("GET /mcp - Found existing org, setting active:", activeOrganizationId);
          } else {
            // Create a new "Personal" organization
            logger.info("GET /mcp - No orgs found, creating Personal org...");
            const newOrg = await auth.api.createOrganization({
              headers: c.req.raw.headers,
              body: {
                name: "Personal",
                slug: `personal-${randomUUID().slice(0, 8)}`,
              },
            });

            if (newOrg) {
              activeOrganizationId = newOrg.id;
              logger.info("GET /mcp - Created Personal org:", activeOrganizationId);
            }
          }

          // Set the active organization for the session
          if (activeOrganizationId) {
            await auth.api.setActiveOrganization({
              headers: c.req.raw.headers,
              body: {
                organizationId: activeOrganizationId,
              },
            });
          }
        }

        if (activeOrganizationId) {
          // User is authenticated and has an org - check if they have an existing MCP session
          const { getActiveSession, createSession } = await import("../models/mcp-session.ts");

          let mcpSession = await getActiveSession(activeOrganizationId);

          if (mcpSession) {
            logger.info(
              "GET /mcp - Found existing session, redirecting to:",
              `/mcp/${mcpSession.id}`
            );
            return c.redirect(`/mcp/${mcpSession.id}`, 302);
          } else {
            // Create new session
            mcpSession = await createSession(activeOrganizationId);
            logger.info("GET /mcp - Created new session, redirecting to:", `/mcp/${mcpSession.id}`);
            return c.redirect(`/mcp/${mcpSession.id}`, 302);
          }
        } else {
          logger.info("GET /mcp - Failed to determine active organization");
        }
      }
    } catch (error) {
      logger.info("GET /mcp - Auth check error:", error);
      // If auth check fails, fall through to show login
    }

    // Check if user wants to sign up
    const url = new URL(c.req.url);
    const isSignUp = url.searchParams.get("mode") === "signup";

    logger.info("GET /mcp - Not authenticated, showing login. isSignUp:", isSignUp);

    // User is not authenticated - show login page
    const config = await getConfig();
    const authProviders = {
      github: config.auth.providers.github,
      google: config.auth.providers.google,
      emailPassword: config.auth.providers.emailPassword,
    };
    const html = renderUi("/mcp", { authProviders, authBaseUrl: config.baseUrl, isSignUp });
    return c.html("<!DOCTYPE html>" + html);
  });

  app.get("/mcp/:sessionId", async (c) => {
    const { sessionId } = c.req.param();
    logger.info("GET /mcp/:sessionId - Checking auth for session:", sessionId);

    // Check if user is authenticated
    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      logger.info("GET /mcp/:sessionId - Session check:", {
        hasSession: !!sessionData?.session,
        hasUser: !!sessionData?.user,
        userId: sessionData?.user?.id,
        organizationId: sessionData?.session?.activeOrganizationId,
      });

      if (sessionData?.session && sessionData?.user && sessionData.session.activeOrganizationId) {
        // User is authenticated - verify the session belongs to their organization
        const { getSession, createSession } = await import("../models/mcp-session.ts");

        let mcpSession = await getSession(sessionId, sessionData.session.activeOrganizationId);

        if (!mcpSession) {
          // Session doesn't exist or doesn't belong to this org - create it
          logger.info("GET /mcp/:sessionId - Session not found, creating it");
          mcpSession = await createSession(sessionData.session.activeOrganizationId, sessionId);
        }

        // Show session page
        logger.info("GET /mcp/:sessionId - Authenticated, showing session page");
        const config = await getConfig();
        const html = renderUi(`/mcp/${sessionId}`, { sessionId, baseUrl: config.baseUrl });
        return c.html("<!DOCTYPE html>" + html);
      }
    } catch (error) {
      logger.info("GET /mcp/:sessionId - Auth check error:", error);
      // If auth check fails, redirect to login
    }

    // User is not authenticated - redirect to /mcp login
    logger.info("GET /mcp/:sessionId - Not authenticated, redirecting to /mcp");
    return c.redirect("/mcp", 302);
  });

  // OAuth result page
  app.get("/oauth/result", (c) => {
    const url = new URL(c.req.url);
    const success = url.searchParams.get("success") === "true";
    const error = url.searchParams.get("error") || undefined;
    const provider = url.searchParams.get("provider") || undefined;

    const html = renderUi("/oauth/result", {
      oauthSuccess: success,
      oauthError: error,
      oauthProvider: provider,
    });
    return c.html("<!DOCTYPE html>" + html);
  });

  // PAT submission page
  app.get("/pat/:linkId", async (c) => {
    const { linkId } = c.req.param();
    const url = new URL(c.req.url);
    const success = url.searchParams.get("success") === "true";
    const errorParam = url.searchParams.get("error") || undefined;

    // If success=true, we need to get the link info without validating status
    // because the link is now marked as "used" after successful submission
    if (success) {
      const { getPatLinkWithIntegration } = await import("../models/pat-link.ts");
      const patLink = await getPatLinkWithIntegration(linkId);

      if (patLink) {
        const html = renderUi(`/pat/${linkId}`, {
          patLinkId: linkId,
          patLinkInfo: {
            id: patLink.id,
            integration: patLink.integration,
            expiresAt: patLink.expiresAt,
          },
          patSuccess: true,
        });
        return c.html("<!DOCTYPE html>" + html);
      }
      // If link doesn't exist at all, fall through to invalid
    }

    const { validatePatLink } = await import("../models/pat-link.ts");
    const validation = await validatePatLink(linkId);

    if (!validation.valid || !validation.patLink) {
      const html = renderUi(`/pat/${linkId}`, {
        patLinkId: linkId,
        patInvalid: true,
        patError: validation.error,
      });
      return c.html("<!DOCTYPE html>" + html);
    }

    const html = renderUi(`/pat/${linkId}`, {
      patLinkId: linkId,
      patLinkInfo: {
        id: validation.patLink.id,
        integration: validation.patLink.integration,
        expiresAt: validation.patLink.expiresAt,
      },
      patSuccess: false,
      patError: errorParam,
    });
    return c.html("<!DOCTYPE html>" + html);
  });

  // PAT submission form handler
  app.post("/pat/:linkId/submit", async (c) => {
    const { linkId } = c.req.param();

    try {
      const body = await c.req.parseBody();
      const pat = body.pat as string;

      if (!pat || pat.length < 8) {
        return c.redirect(
          `/pat/${linkId}?error=${encodeURIComponent("Token must be at least 8 characters")}`
        );
      }

      const { submitPatLink } = await import("../models/pat-link.ts");
      const result = await submitPatLink(linkId, pat);

      if (result.success) {
        return c.redirect(`/pat/${linkId}?success=true`);
      } else {
        return c.redirect(
          `/pat/${linkId}?error=${encodeURIComponent(result.error || "Failed to save token")}`
        );
      }
    } catch (error) {
      logger.error("PAT submission error:", error);
      return c.redirect(
        `/pat/${linkId}?error=${encodeURIComponent("An unexpected error occurred")}`
      );
    }
  });
};
