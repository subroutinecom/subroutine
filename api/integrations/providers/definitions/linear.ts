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
 * This provider uses OAuth 2.0 with bearer token passthrough.
 *
 * When user selects "Linear" from the dropdown, the UI pre-fills:
 * - GraphQL endpoint
 * - OAuth URLs and default scopes
 * - The resulting integration is a standard GraphQL integration
 */
export const linearDefinition: IntegrationDefinition = {
  id: "linear",
  name: "Linear",
  description: "Issue tracking and project management for software teams",
  category: "project-management",
  viewerScoped: true,
  auth: {
    type: "graphql",
    endpoint: "https://api.linear.app/graphql",
    authStrategy: { type: "bearer_oauth" },
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
};
