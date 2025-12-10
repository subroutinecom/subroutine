import type { IntegrationDefinition } from "../types.ts";

interface GitHubUserInfo {
  login: string;
  id: number;
  email: string | null;
  name: string | null;
}

/**
 * GitHub integration via REST API (OpenAPI).
 *
 * GitHub provides a comprehensive REST API for repositories, issues,
 * pull requests, actions, and more.
 *
 * This provider supports two authentication methods:
 * 1. OAuth 2.0 - Users authenticate with their GitHub account (viewer-scoped)
 * 2. Personal Access Token - Each user provides their own GitHub PAT (viewer-scoped)
 */
export const githubDefinition: IntegrationDefinition = {
  id: "github",
  name: "GitHub",
  description: "Code hosting, issues, pull requests, and CI/CD",
  category: "development",
  viewerScoped: true,
  auth: {
    type: "openapi",
    baseUrl: "https://api.github.com",
    specUrl: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    authOptions: [
      {
        id: "oauth",
        strategy: { type: "bearer_oauth" },
        label: "OAuth 2.0",
        description: "Users authenticate with their GitHub account. Best for user-level actions.",
        recommended: true,
        viewerScoped: true,
        oauthConfig: {
          authUrl: "https://github.com/login/oauth/authorize",
          tokenUrl: "https://github.com/login/oauth/access_token",
          defaultScopes: ["repo", "read:user", "user:email"],
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
                  Accept: "application/vnd.github+json",
                  "X-GitHub-Api-Version": "2022-11-28",
                },
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch GitHub user info: ${response.status} - ${errorText}`);
              }

              const userInfo = (await response.json()) as GitHubUserInfo;
              return userInfo.email || userInfo.login || String(userInfo.id);
            },
          },
        },
      },
      {
        id: "pat",
        strategy: { type: "api_key", headerName: "Authorization" },
        label: "Personal Access Token",
        description: "Each user provides their own GitHub PAT.",
        viewerScoped: true,
        apiKeyConfig: {
          headerName: "Authorization",
          headerPrefix: "Bearer ",
          instructionsUrl: "https://github.com/settings/tokens",
        },
      },
    ],
  },
};
