import type { IntegrationDefinition } from "../types.ts";

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
  },
};
