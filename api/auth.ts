import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { organization, mcp } from "better-auth/plugins";
import pg from "pg";
import { getConfig } from "./config/loader.ts";
import { validateSlugFormat } from "./validation/slug";

const { Pool } = pg;

const config = await getConfig();

const DATABASE_URL =
  Deno.env.get("DATABASE_URL") || "postgresql://subroutine:subroutine@localhost:5432/subroutine";

export const auth = betterAuth({
  database: new Pool({
    connectionString: DATABASE_URL,
  }),
  baseURL: config.baseUrl || "http://localhost:3002",
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
  ...(config.auth.crossSubDomainCookies?.enabled && {
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: config.auth.crossSubDomainCookies.domain,
      },
    },
  }),
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Validate slug when creating an organization
      if (ctx.path === "/organization/create") {
        const body = ctx.body as { slug?: string } | undefined;
        if (body?.slug) {
          const result = validateSlugFormat(body.slug);
          if (!result.valid) {
            throw new APIError("BAD_REQUEST", {
              message: result.error || "Invalid slug",
            });
          }
        }
      }
    }),
  },
  plugins: [
    organization({}),
    mcp({
      loginPage: "/login",
    }),
  ],
});
