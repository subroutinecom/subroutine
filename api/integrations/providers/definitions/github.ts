import type { IntegrationDefinition } from "../types.ts";

export const githubDefinition: IntegrationDefinition = {
  id: "github",
  name: "GitHub",
  description: "GitHub repositories, issues, and pull requests",
  viewerScoped: false,
  auth: {
    type: "oauth2",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    defaultScopes: ["repo", "read:user"],
    requiredScopes: ["read:user"],
    defaultRedirectPath: "/api/oauth/callback",
  },
};
