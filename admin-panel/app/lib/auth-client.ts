import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import type { AdminClientConfig } from "./admin-config";

const organizationPlugin = organizationClient();

type AuthClientOptions = {
  baseURL: string;
  plugins: [typeof organizationPlugin];
};

type AuthClient = ReturnType<typeof createAuthClient<AuthClientOptions>>;

const authClientCache = new Map<string, AuthClient>();

export const getAuthClient = (config: AdminClientConfig): AuthClient => {
  const normalizedBase = config.authBaseUrl.endsWith("/")
    ? config.authBaseUrl
    : `${config.authBaseUrl}/`;

  const existing = authClientCache.get(normalizedBase);
  if (existing) return existing;

  const client = createAuthClient<AuthClientOptions>({
    baseURL: normalizedBase,
    plugins: [organizationPlugin],
  });
  authClientCache.set(normalizedBase, client);
  return client;
};
