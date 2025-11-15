import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { apiKey, organization } from "better-auth/plugins";
import pg from "pg";
import { getConfig } from "./config/loader.ts";
import { apikeyOrganization } from "./plugins/apikey-organization.ts";

const { Pool } = pg;

const config = await getConfig();

const DATABASE_URL =
  Deno.env.get("DATABASE_URL") ||
  "postgresql://subroutine:subroutine@localhost:5432/subroutine";

export const auth = betterAuth({
  database: new Pool({
    connectionString: DATABASE_URL,
  }),
  baseURL: Deno.env.get("BASE_URL") || "http://localhost:3002",
  secret: Deno.env.get("BETTER_AUTH_SECRET")!,
  trustedOrigins: config.auth.allowedOrigins,
  emailAndPassword: {
    enabled: config.auth.providers.emailPassword.enabled,
  },
  socialProviders: {
    ...(config.auth.providers.github.enabled && {
      github: {
        clientId: config.auth.providers.github.clientId!,
        clientSecret: Deno.env.get("GITHUB_CLIENT_SECRET")!,
      },
    }),
    ...(config.auth.providers.google.enabled && {
      google: {
        clientId: config.auth.providers.google.clientId!,
        clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      },
    }),
  },
  plugins: [
    organization({}),
    apiKey({
      enableMetadata: true,
    }),

    // custom plugin allows us to inject organizationId into API key creation request
    // apiKey plugin doesn't support additionalFields
    apikeyOrganization(),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/api-key/create") {
        const sessionData = await auth.api.getSession({
          headers: ctx.headers,
        });

        if (!sessionData?.session) {
          throw new Error("Cannot create API key: User not authenticated.");
        }

        const activeOrgId = sessionData.session.activeOrganizationId;

        if (!activeOrgId) {
          throw new Error(
            "Cannot create API key: No active organization. Please select an organization first.",
          );
        }

        ctx.context.organizationId = activeOrgId;
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/api-key/create" && ctx.context.organizationId) {
        const sessionData = await auth.api.getSession({
          headers: ctx.headers,
        });

        if (sessionData?.user) {
          const adapter = ctx.context.adapter;

          const recentKeys = await adapter.findMany({
            model: "apikey",
            where: [{ field: "userId", value: sessionData.user.id }],
            limit: 1,
            sortBy: { field: "createdAt", direction: "desc" },
          });

          if (recentKeys && recentKeys.length > 0) {
            await adapter.update({
              model: "apikey",
              where: [{ field: "id", value: recentKeys[0].id }],
              update: {
                organizationId: ctx.context.organizationId,
              },
            });

            const originalResponse = ctx.context.returned;
            if (originalResponse && typeof originalResponse === "object") {
              return ctx.json({
                ...originalResponse,
                organizationId: ctx.context.organizationId,
              });
            }
          }
        }
      }
    }),
  },
});
