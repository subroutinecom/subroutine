import type { IntegrationDefinition } from "../types";

/**
 * Generic GraphQL API integration.
 *
 * This provider allows connecting to any GraphQL endpoint.
 * Configuration is flexible - the user provides endpoint URL and authentication details.
 *
 * For generic providers, all auth options are available since the user
 * specifies everything during integration creation.
 */
export const graphqlDefinition: IntegrationDefinition = {
  id: "graphql",
  name: "GraphQL API",
  description: "Connect to any GraphQL endpoint",
  category: "generic",
  viewerScoped: false,
  auth: {
    type: "graphql",
    endpoint: "",
    // Generic providers support all auth options - user chooses during creation
    authOptions: [
      {
        id: "none",
        strategy: { type: "none" },
        label: "No Authentication",
        description: "Endpoint doesn't require authentication",
      },
      {
        id: "api_key",
        strategy: { type: "api_key", headerName: "Authorization" },
        label: "API Key / Bearer Token",
        description: "Authenticate with a static API key or token",
      },
      {
        id: "bearer_oauth",
        strategy: { type: "bearer_oauth" },
        label: "OAuth 2.0",
        description: "Users authenticate with their own credentials",
        viewerScoped: true,
      },
      {
        id: "custom_headers",
        strategy: { type: "custom_headers", headers: {} },
        label: "Custom Headers",
        description: "Custom authentication headers",
      },
    ],
  },
};
