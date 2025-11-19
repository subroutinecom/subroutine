import type { IntegrationDefinition } from "../types.ts";

export const mockOAuthDefinition: IntegrationDefinition = {
  id: "mock_oauth",
  name: "Mock OAuth",
  description: "Test-only OAuth provider for end-to-end flows",
  viewerScoped: true,
  auth: {
    type: "oauth2",
    authUrl: "http://api/tests/mock_oauth/authorize",
    tokenUrl: "http://api/tests/mock_oauth/token",
    defaultScopes: [],
    defaultRedirectPath: "/tests/mock_oauth/callback",
  },
};
