import type { IntegrationDefinition } from "../types";

interface LinearViewer {
  viewer: {
    email: string;
    name: string;
    id: string;
  };
}

/**
 * Linear integration via GraphQL API.
 *
 * Linear provides a full GraphQL API with strong typing and schema introspection.
 * This provider supports two authentication methods:
 * 1. OAuth 2.0 - Users authenticate with their Linear account (viewer-scoped)
 * 2. Personal API Key - Use a Linear Personal API Key (org-scoped)
 */
export const linearDefinition: IntegrationDefinition = {
  id: "linear",
  name: "Linear",
  description: "Issue tracking and project management for software teams",
  category: "project-management",
  viewerScoped: true, // Default, can be overridden by auth option
  auth: {
    type: "graphql",
    endpoint: "https://api.linear.app/graphql",
    authOptions: [
      {
        id: "oauth",
        strategy: { type: "bearer_oauth" },
        label: "OAuth 2.0",
        description: "Users authenticate with their Linear account. Best for user-level access.",
        recommended: true,
        viewerScoped: true,
        oauthConfig: {
          authUrl: "https://linear.app/oauth/authorize",
          tokenUrl: "https://api.linear.app/oauth/token",
          defaultScopes: ["read", "write", "issues:create", "comments:create"],
          requiredScopes: ["read"],
          defaultRedirectPath: "/api/oauth/callback",
          handlers: {
            fetchAccountIdentifier: async (accessToken: string): Promise<string> => {
              const response = await fetch("https://api.linear.app/graphql", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  query: `query { viewer { email name id } }`,
                }),
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch Linear user info: ${response.status} - ${errorText}`);
              }

              const data = (await response.json()) as { data: LinearViewer };
              return data.data.viewer.email || data.data.viewer.name || data.data.viewer.id;
            },
          },
        },
      },
      {
        id: "api_key",
        strategy: { type: "api_key", headerName: "Authorization" },
        label: "Personal API Key",
        description: "Each user provides their own Linear API key.",
        viewerScoped: true,
        apiKeyConfig: {
          headerName: "Authorization",
          instructionsUrl: "https://linear.app/settings/api",
        },
      },
    ],
  },
};
