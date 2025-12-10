import type { IntegrationDefinition } from "../types";

/**
 * Generic OpenAPI/REST API integration.
 *
 * This provider allows connecting to any REST API with an OpenAPI 3.x specification.
 * Configuration is flexible - the user provides base URL, spec URL/content, and authentication details.
 *
 * For generic providers, all auth options are available since the user
 * specifies everything during integration creation.
 */
export const openapiDefinition: IntegrationDefinition = {
  id: "openapi",
  name: "OpenAPI/REST API",
  description: "Connect to any REST API with an OpenAPI specification",
  category: "generic",
  viewerScoped: false,
  auth: {
    type: "openapi",
    baseUrl: "",
    // Generic providers support all auth options - user chooses during creation
    authOptions: [
      {
        id: "none",
        strategy: { type: "none" },
        label: "No Authentication",
        description: "API doesn't require authentication",
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
