import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { getConfig } from "@subroutine/config";
import pg from "pg";

const { Pool } = pg;

export const getAuth = async () => {
  const config = await getConfig();

  const DATABASE_URL =
    Deno.env.get("DATABASE_URL") ||
    "postgresql://subroutine:subroutine@localhost:5432/subroutine";

  console.log(config.auth.baseUrl);
  console.log(config);

  const auth = betterAuth({
    database: new Pool({
      connectionString: DATABASE_URL,
    }),
    //baseURL: config.auth.baseUrl ?? config.baseUrl,
    secret: Deno.env.get("BETTER_AUTH_SECRET")!,

    emailAndPassword: {
      enabled: true, //config.auth.providers.emailPassword.enabled,
    },

    //socialProviders: {
    //  ...(config.auth.providers.github.enabled && {
    //    github: {
    //      clientId: config.auth.providers.github.clientId!,
    //      clientSecret: Deno.env.get("GITHUB_CLIENT_SECRET")!,
    //    },
    //  }),
    //  ...(config.auth.providers.google.enabled && {
    //    google: {
    //      clientId: config.auth.providers.google.clientId!,
    //      clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    //    },
    //  }),
    //},

    plugins: [organization()],
  });

  return auth;
};
