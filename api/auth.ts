import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import pg from "pg";
import { getConfig } from "./config/loader.ts";

const { Pool } = pg;

const config = await getConfig();

const DATABASE_URL =
  Deno.env.get("DATABASE_URL") || "postgresql://subroutine:subroutine@localhost:5432/subroutine";

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
  plugins: [organization({})],
});
