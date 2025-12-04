import type { OpenAPIHono } from "@hono/zod-openapi";
import { randomUUID } from "node:crypto";
import { checkCustomRules } from "./agent/validation/ast-checker.ts";
import { typeCheckCode } from "./agent/validation/type-checker.ts";
import { validateCode } from "./agent/validation/validator.ts";
import type { AuthContext } from "./middlewares/auth.ts";
import { generatePatLinkUrl } from "./models/pat-link.ts";
import { completeMockAuthorization } from "./services/mock-oauth.ts";

/**
 * Register test-only endpoints. These are only available when ENABLE_MOCK_OAUTH is true.
 */
export const registerTestEndpoints = (app: OpenAPIHono<{ Variables: { auth: AuthContext } }>) => {
  // Mock OAuth authorize endpoint
  app.get("/tests/mock_oauth/authorize", (c) => {
    const state = c.req.query("state");
    if (!state) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "state parameter is required",
          },
        },
        400
      );
    }

    const redirectParam = c.req.query("redirect_uri");
    const origin = new URL(c.req.url);
    const callbackUrl = redirectParam
      ? new URL(redirectParam)
      : new URL("/tests/mock_oauth/callback", `${origin.protocol}//${origin.host}`);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("code", randomUUID());
    return c.redirect(callbackUrl.toString());
  });

  // Mock OAuth callback endpoint
  app.get("/tests/mock_oauth/callback", async (c) => {
    const state = c.req.query("state");
    if (!state) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "state parameter is required",
          },
        },
        400
      );
    }

    await completeMockAuthorization(state);
    return c.json({ success: true });
  });

  // Code validation endpoint - validates subroutine code without generating
  // Placed in non-authenticated endpoints for testing purposes
  app.post("/tests/validate-code", async (c) => {
    let body: { code?: string; mcpIntegrationNames?: string[] };
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid JSON body",
          },
        },
        400
      );
    }

    if (!body.code || typeof body.code !== "string") {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "code field is required",
          },
        },
        400
      );
    }

    // Build context for validation if mcpIntegrationNames is provided
    const context = body.mcpIntegrationNames
      ? { mcpIntegrationNames: body.mcpIntegrationNames }
      : undefined;

    const result = await validateCode(body.code, context);

    return c.json({
      valid: result.valid,
      errors: result.errors,
    });
  });

  // TypeScript type checking endpoint - runs full type checking on subroutine code
  app.post("/tests/typecheck-code", async (c) => {
    let body: { code?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid JSON body",
          },
        },
        400
      );
    }

    if (!body.code || typeof body.code !== "string") {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "code field is required",
          },
        },
        400
      );
    }

    const result = typeCheckCode(body.code);

    return c.json({
      valid: result.valid,
      errors: result.errors,
    });
  });

  // Custom rules validation endpoint - runs AST-based rules
  app.post("/tests/check-custom-rules", async (c) => {
    let body: { code?: string; mcpIntegrationNames?: string[] };
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid JSON body",
          },
        },
        400
      );
    }

    if (!body.code || typeof body.code !== "string") {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "code field is required",
          },
        },
        400
      );
    }

    // Build context for validation if mcpIntegrationNames is provided
    const context = body.mcpIntegrationNames
      ? { mcpIntegrationNames: body.mcpIntegrationNames }
      : undefined;

    const result = checkCustomRules(body.code, context);

    return c.json({
      valid: result.valid,
      errors: result.errors,
    });
  });
};

/**
 * Register authenticated test endpoints. These require auth middleware to be applied first.
 */
export const registerAuthenticatedTestEndpoints = (
  app: OpenAPIHono<{ Variables: { auth: AuthContext } }>
) => {
  // PAT link generation endpoint
  app.post("/tests/pat-link/generate", async (c) => {
    const auth = c.get("auth");
    if (!auth?.organizationId) {
      return c.json(
        {
          error: {
            code: "ORGANIZATION_REQUIRED",
            message: "Active organization is required",
          },
        },
        403
      );
    }

    let body: { integrationId?: string; viewerId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid JSON body",
          },
        },
        400
      );
    }

    if (!body.integrationId || typeof body.integrationId !== "string") {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "integrationId field is required",
          },
        },
        400
      );
    }

    if (!body.viewerId || typeof body.viewerId !== "string") {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "viewerId field is required",
          },
        },
        400
      );
    }

    const result = await generatePatLinkUrl({
      integrationId: body.integrationId,
      viewerId: body.viewerId,
      organizationId: auth.organizationId,
    });

    return c.json(result);
  });
};
