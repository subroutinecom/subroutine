import type { IntegrationDefinition } from "../types.ts";

interface GitHubUserInfo {
  login: string;
  id: number;
  email: string | null;
}

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
    handlers: {
      customizeTokenHeaders: (headers: Record<string, string>) => {
        headers["Accept"] = "application/json";
      },
      fetchAccountIdentifier: async (accessToken: string): Promise<string> => {
        const response = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch GitHub user info: ${response.status} - ${errorText}`);
        }

        const userInfo = (await response.json()) as GitHubUserInfo;
        return userInfo.email || userInfo.login;
      },
    },
  },
};
