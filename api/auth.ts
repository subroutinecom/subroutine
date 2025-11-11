import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { db } from "./db/index.ts";
import { getConfig } from "@subroutine/config";

const config = await getConfig();

export const auth = betterAuth({
  database: db,
  baseURL: config.auth.baseUrl ?? config.baseUrl,
  secret: Deno.env.get("BETTER_AUTH_SECRET")!,

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

  plugins: [organization()],
});
