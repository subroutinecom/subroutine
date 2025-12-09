import type { IntegrationDefinition } from "../types";

interface SlackAuthTest {
  ok: boolean;
  user_id: string;
  user: string;
  team_id: string;
  team: string;
}

/**
 * Slack integration via REST API (OpenAPI).
 *
 * Slack provides a comprehensive REST API for workspace management,
 * messaging, channels, users, and app interactions.
 * This provider uses OAuth 2.0 with bearer token passthrough.
 *
 * When user selects "Slack" from the dropdown, the UI pre-fills:
 * - API base URL
 * - OAuth URLs and default scopes
 * - The resulting integration is a standard OpenAPI integration
 */
export const slackDefinition: IntegrationDefinition = {
  id: "slack",
  name: "Slack",
  description: "Team communication and workspace management",
  category: "communication",
  viewerScoped: true,
  auth: {
    type: "openapi",
    baseUrl: "https://slack.com/api",
    authStrategy: { type: "bearer_oauth" },
    oauthConfig: {
      authUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      defaultScopes: [
        "channels:read",
        "channels:history",
        "chat:write",
        "users:read",
        "team:read",
      ],
      requiredScopes: ["channels:read"],
      defaultRedirectPath: "/api/oauth/callback",
      handlers: {
        customizeAuthorizationUrl: (url: URL) => {
          // Slack requires user_scope for user-level tokens
          const scopes = url.searchParams.get("scope") || "";
          url.searchParams.delete("scope");
          url.searchParams.set("user_scope", scopes);
        },
        fetchAccountIdentifier: async (accessToken: string): Promise<string> => {
          const response = await fetch("https://slack.com/api/auth.test", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch Slack user info: ${response.status} - ${errorText}`);
          }

          const data = (await response.json()) as SlackAuthTest;
          if (!data.ok) {
            throw new Error(`Slack API error: ${JSON.stringify(data)}`);
          }
          return `${data.user}@${data.team}`;
        },
      },
    },
  },
};
