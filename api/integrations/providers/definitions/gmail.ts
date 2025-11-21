import type { IntegrationDefinition } from "../types.ts";

interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export const gmailDefinition: IntegrationDefinition = {
  id: "gmail",
  name: "Gmail",
  description: "Google Workspace email integration",
  viewerScoped: true,
  auth: {
    type: "oauth2",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultScopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    defaultRedirectPath: "/api/oauth/callback",
    handlers: {
      customizeAuthorizationUrl: (url: URL) => {
        url.searchParams.set("response_type", "code");
        url.searchParams.set("access_type", "offline");
        url.searchParams.set("prompt", "consent");
      },
      customizeTokenExchange: (params: URLSearchParams) => {
        params.set("grant_type", "authorization_code");
      },
      fetchAccountIdentifier: async (accessToken: string): Promise<string> => {
        const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch Gmail profile: ${response.status} - ${errorText}`);
        }

        const profile = (await response.json()) as GmailProfile;
        return profile.emailAddress;
      },
    },
  },
};
