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
 *
 * This provider supports two authentication methods:
 * 1. OAuth 2.0 - Users authenticate with their Slack account (viewer-scoped)
 * 2. Bot Token - Use a Slack Bot Token for workspace-wide access (org-scoped)
 *
 * When user selects "Slack" from the dropdown, the UI shows auth options
 * and pre-fills configuration based on their choice.
 */
export const slackDefinition: IntegrationDefinition = {
  id: "slack",
  name: "Slack",
  description: "Team communication and workspace management",
  category: "communication",
  viewerScoped: true, // Default, but can be overridden by auth option
  auth: {
    type: "openapi",
    baseUrl: "https://slack.com/api",
    specUrl: "https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json",
    authOptions: [
      {
        id: "oauth",
        strategy: { type: "bearer_oauth" },
        label: "OAuth 2.0",
        description: "Users authenticate with their Slack account. Best for user-level actions.",
        recommended: true,
        viewerScoped: true,
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
      {
        id: "bot_token",
        strategy: { type: "api_key", headerName: "Authorization" },
        label: "Bot Token",
        description: "Use a Slack Bot Token for workspace-wide access. No per-user auth needed.",
        viewerScoped: false,
        apiKeyConfig: {
          headerName: "Authorization",
          headerPrefix: "Bearer ",
          instructionsUrl: "https://api.slack.com/authentication/token-types#bot",
        },
      },
    ],
  },
};
