import type { IntegrationDefinition } from "../types";

/**
 * Generic OpenAPI/REST API integration.
 *
 * This provider allows connecting to any REST API with an OpenAPI 3.x specification.
 * Configuration is flexible - the user provides base URL, spec URL/content, and authentication details.
 *
 * The auth configuration supports the same strategies as MCP and GraphQL:
 * - none: No authentication required
 * - api_key: Static API key sent in a header
 * - bearer_oauth: OAuth access token passed through
 * - custom_headers: Custom headers for authentication
 */
export const openapiDefinition: IntegrationDefinition = {
  id: "openapi",
  name: "OpenAPI/REST API",
  description: "Connect to any REST API with an OpenAPI specification",
  category: "api",
  // OpenAPI integrations are NOT viewer-scoped by default.
  // They use org-level API keys. For viewer-scoped OpenAPI with OAuth passthrough,
  // the auth config can specify viewerScoped: true or bearer_oauth.
  viewerScoped: false,
  auth: {
    type: "openapi",
    // These are defaults/placeholders - actual values come from authConfig at creation time
    baseUrl: "",
    authStrategy: { type: "none" },
  },
};
