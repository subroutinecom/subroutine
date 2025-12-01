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

  app.get("/mcp2", async (c) => {
    // Check if user is authenticated
    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      if (sessionData?.session && sessionData?.user) {
        // User is authenticated - generate new session ID and redirect
        const sessionId = randomUUID();
        return c.redirect(`/mcp2/${sessionId}`, 302);
      }
    } catch (_error) {
      // If auth check fails, fall through to show login
    }

    // Check if user wants to sign up
    const url = new URL(c.req.url);
    const isSignUp = url.searchParams.get("mode") === "signup";

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
    // Check if user is authenticated
    try {
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      if (sessionData?.session && sessionData?.user) {
        // User is authenticated - show session page
        const { sessionId } = c.req.param();
        const html = renderUi(`/mcp2/${sessionId}`, { sessionId });
        return c.html("<!DOCTYPE html>" + html);
      }
    } catch (_error) {
      // If auth check fails, redirect to login
    }

    // User is not authenticated - redirect to /mcp2 login
    return c.redirect("/mcp2", 302);
  });
};
