import type { IntegrationDefinition } from "../types.ts";

interface CalendarSettings {
  id: string;
  kind: string;
}

export const calendarDefinition: IntegrationDefinition = {
  id: "google_calendar",
  name: "Google Calendar",
  description: "Google Calendar integration for event management",
  viewerScoped: true,
  auth: {
    type: "oauth2",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultScopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
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
        const response = await fetch(
          "https://www.googleapis.com/calendar/v3/users/me/settings/timezone",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch Calendar settings: ${response.status} - ${errorText}`);
        }

        const settings = (await response.json()) as CalendarSettings;
        return settings.id;
      },
    },
  },
};
