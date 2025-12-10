import { Hono } from "hono";
import { auth } from "../auth.ts";
import { getConfig } from "../config/loader.ts";
import { renderUi } from "./router.tsx";
import { getLogger } from "../utils/logger.ts";
const logger = getLogger("api/ui/server.tsx");

const config = await getConfig();

export const registerUiRoutes = (app: Hono<any>) => {
  const authProviders = {
    github: { enabled: config.auth.providers.github.enabled },
    google: { enabled: config.auth.providers.google.enabled },
    emailPassword: { enabled: config.auth.providers.emailPassword.enabled },
  };
  const shouldForwardJsonAuth = (request: Request): boolean => {
    const contentType = request.headers.get("content-type") ?? "";
    const accept = request.headers.get("accept") ?? "";
    return contentType.includes("application/json") || accept.includes("application/json");
  };

  const forwardAuthRequest = (request: Request): Promise<Response> => auth.handler(request);

  app.get("/login", (c) => {
    const url = new URL(c.req.url);
    const callbackURL = url.searchParams.get("callback") || undefined;
    const html = renderUi("/login", { authProviders, callbackURL });
    return c.html("<!DOCTYPE html>" + html);
  });

  app.post("/api/auth/sign-in/social", async (c) => {
    if (shouldForwardJsonAuth(c.req.raw)) {
      return forwardAuthRequest(c.req.raw);
    }

    try {
      const body = await c.req.parseBody();
      const provider = body.provider as string;
      const callbackURL = (body.callbackURL as string) || "/";

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

      return c.redirect(`/login?error=${encodeURIComponent("Failed to start OAuth flow")}`);
    } catch (error) {
      logger.error("Social sign-in error:", error);
      return c.redirect("/login?error=An+unexpected+error+occurred");
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
      const callbackURL = c.req.query("callbackURL") || "/";

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
      const callbackURL = c.req.query("callbackURL") || "/";

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
        return c.redirect(`/login?mode=signup&error=${encodeURIComponent(errorMsg)}`);
      }
    } catch (error) {
      logger.error("Sign up error:", error);
      return c.redirect("/login?mode=signup&error=An+unexpected+error+occurred");
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
