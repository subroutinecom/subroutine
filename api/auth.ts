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
        const session = ctx.context.session?.session;
        const userId = session?.user?.id;

        const activeOrgId = session?.activeOrganizationId;

        if (!activeOrgId) {
          throw new Error(
            "Cannot create API key: No active organization. Please select an organization first.",
          );
        }

        if (!userId) {
          throw new Error("Cannot create API key: User not authenticated.");
        }

        // Verify user is actually a member of the organization
        const adapter = ctx.context.adapter;
        const member = await adapter.findOne({
          model: "member",
          where: [
            { field: "userId", value: userId },
            { field: "organizationId", value: activeOrgId },
          ],
        });

        if (!member) {
          throw new Error(
            `Cannot create API key: User is not a member of organization ${activeOrgId}.`,
          );
        }

        return {
          context: {
            ...ctx,
            body: {
              ...ctx.body,
              organizationId: activeOrgId,
            },
          },
        };
      }
    }),
  },
});
