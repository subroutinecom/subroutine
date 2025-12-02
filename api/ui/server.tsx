import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { auth } from "../auth.ts";
import { getConfig } from "../config/loader.ts";
import { renderUi } from "./router.tsx";

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
      console.error("Sign in error:", error);
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
      console.error("Sign up error:", error);
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
      console.error("Sign out error:", error);
      return c.redirect("/");
    }
  });

  app.get("/mcp", async (c) => {
    // Check if user is authenticated
    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      console.log("GET /mcp - Session check:", {
        hasSession: !!sessionData?.session,
        hasUser: !!sessionData?.user,
        userId: sessionData?.user?.id,
        organizationId: sessionData?.session?.activeOrganizationId,
      });

      if (sessionData?.session && sessionData?.user) {
        let activeOrganizationId = sessionData.session.activeOrganizationId;

        // If no active organization, try to find one or create one
        if (!activeOrganizationId) {
          console.log("GET /mcp - No active organization, checking existing orgs...");
          const organizations = await auth.api.listOrganizations({
            headers: c.req.raw.headers,
          });

          if (organizations && organizations.length > 0) {
            // Use the first available organization
            activeOrganizationId = organizations[0].id;
            console.log("GET /mcp - Found existing org, setting active:", activeOrganizationId);
          } else {
            // Create a new "Personal" organization
            console.log("GET /mcp - No orgs found, creating Personal org...");
            const newOrg = await auth.api.createOrganization({
              headers: c.req.raw.headers,
              body: {
                name: "Personal",
                slug: `personal-${randomUUID().slice(0, 8)}`,
              },
            });

            if (newOrg) {
              activeOrganizationId = newOrg.id;
              console.log("GET /mcp - Created Personal org:", activeOrganizationId);
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
            console.log(
              "GET /mcp - Found existing session, redirecting to:",
              `/mcp/${mcpSession.id}`
            );
            return c.redirect(`/mcp/${mcpSession.id}`, 302);
          } else {
            // Create new session
            mcpSession = await createSession(activeOrganizationId);
            console.log("GET /mcp - Created new session, redirecting to:", `/mcp/${mcpSession.id}`);
            return c.redirect(`/mcp/${mcpSession.id}`, 302);
          }
        } else {
          console.log("GET /mcp - Failed to determine active organization");
        }
      }
    } catch (error) {
      console.log("GET /mcp - Auth check error:", error);
      // If auth check fails, fall through to show login
    }

    // Check if user wants to sign up
    const url = new URL(c.req.url);
    const isSignUp = url.searchParams.get("mode") === "signup";

    console.log("GET /mcp - Not authenticated, showing login. isSignUp:", isSignUp);

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
    console.log("GET /mcp/:sessionId - Checking auth for session:", sessionId);

    // Check if user is authenticated
    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      console.log("GET /mcp/:sessionId - Session check:", {
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
          console.log("GET /mcp/:sessionId - Session not found, creating it");
          mcpSession = await createSession(sessionData.session.activeOrganizationId, sessionId);
        }

        // Show session page
        console.log("GET /mcp/:sessionId - Authenticated, showing session page");
        const config = await getConfig();
        const html = renderUi(`/mcp/${sessionId}`, { sessionId, baseUrl: config.baseUrl });
        return c.html("<!DOCTYPE html>" + html);
      }
    } catch (error) {
      console.log("GET /mcp/:sessionId - Auth check error:", error);
      // If auth check fails, redirect to login
    }

    // User is not authenticated - redirect to /mcp login
    console.log("GET /mcp/:sessionId - Not authenticated, redirecting to /mcp");
    return c.redirect("/mcp", 302);
  });
};
