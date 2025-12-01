import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { auth } from "../auth.ts";
import { getConfig } from "../config/loader.ts";
import { renderUi } from "./router.tsx";

export const registerUiRoutes = (app: Hono<any>) => {
  app.get("/login", (c) => {
    const html = renderUi("/login");
    return c.html("<!DOCTYPE html>" + html);
  });

  // Custom handler for email sign-in to support form redirects
  app.post("/api/auth/sign-in/email", async (c) => {
    try {
      const body = await c.req.parseBody();
      const email = body.email as string;
      const password = body.password as string;
      const callbackURL = c.req.query("callbackURL") || "/mcp2";

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

  // Custom handler for sign-out to support form redirects
  app.post("/api/auth/sign-out", async (c) => {
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

  app.get("/mcp2", async (c) => {
    // Check if user is authenticated
    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      console.log("GET /mcp2 - Session check:", {
        hasSession: !!sessionData?.session,
        hasUser: !!sessionData?.user,
        userId: sessionData?.user?.id,
        organizationId: sessionData?.session?.activeOrganizationId,
      });

      if (sessionData?.session && sessionData?.user) {
        let activeOrganizationId = sessionData.session.activeOrganizationId;

        // If no active organization, try to find one or create one
        if (!activeOrganizationId) {
          console.log("GET /mcp2 - No active organization, checking existing orgs...");
          const organizations = await auth.api.listOrganizations({
            headers: c.req.raw.headers,
          });

          if (organizations && organizations.length > 0) {
            // Use the first available organization
            activeOrganizationId = organizations[0].id;
            console.log("GET /mcp2 - Found existing org, setting active:", activeOrganizationId);
          } else {
            // Create a new "Personal" organization
            console.log("GET /mcp2 - No orgs found, creating Personal org...");
            const newOrg = await auth.api.createOrganization({
              headers: c.req.raw.headers,
              body: {
                name: "Personal",
                slug: `personal-${randomUUID().slice(0, 8)}`,
              },
            });

            if (newOrg) {
              activeOrganizationId = newOrg.id;
              console.log("GET /mcp2 - Created Personal org:", activeOrganizationId);
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
              "GET /mcp2 - Found existing session, redirecting to:",
              `/mcp2/${mcpSession.id}`
            );
            return c.redirect(`/mcp2/${mcpSession.id}`, 302);
          } else {
            // Create new session
            mcpSession = await createSession(activeOrganizationId);
            console.log(
              "GET /mcp2 - Created new session, redirecting to:",
              `/mcp2/${mcpSession.id}`
            );
            return c.redirect(`/mcp2/${mcpSession.id}`, 302);
          }
        } else {
          console.log("GET /mcp2 - Failed to determine active organization");
        }
      }
    } catch (error) {
      console.log("GET /mcp2 - Auth check error:", error);
      // If auth check fails, fall through to show login
    }

    // Check if user wants to sign up
    const url = new URL(c.req.url);
    const isSignUp = url.searchParams.get("mode") === "signup";

    console.log("GET /mcp2 - Not authenticated, showing login. isSignUp:", isSignUp);

    // User is not authenticated - show login page
    const config = await getConfig();
    const authProviders = {
      github: config.auth.providers.github,
      google: config.auth.providers.google,
      emailPassword: config.auth.providers.emailPassword,
    };
    const html = renderUi("/mcp2", { authProviders, authBaseUrl: config.baseUrl, isSignUp });
    return c.html("<!DOCTYPE html>" + html);
  });

  app.get("/mcp2/:sessionId", async (c) => {
    const { sessionId } = c.req.param();
    console.log("GET /mcp2/:sessionId - Checking auth for session:", sessionId);

    // Check if user is authenticated
    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      console.log("GET /mcp2/:sessionId - Session check:", {
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
          console.log("GET /mcp2/:sessionId - Session not found, creating it");
          mcpSession = await createSession(sessionData.session.activeOrganizationId, sessionId);
        }

        // Show session page
        console.log("GET /mcp2/:sessionId - Authenticated, showing session page");
        const config = await getConfig();
        const html = renderUi(`/mcp2/${sessionId}`, { sessionId, baseUrl: config.baseUrl });
        return c.html("<!DOCTYPE html>" + html);
      }
    } catch (error) {
      console.log("GET /mcp2/:sessionId - Auth check error:", error);
      // If auth check fails, redirect to login
    }

    // User is not authenticated - redirect to /mcp2 login
    console.log("GET /mcp2/:sessionId - Not authenticated, redirecting to /mcp2");
    return c.redirect("/mcp2", 302);
  });
};
