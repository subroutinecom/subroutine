import type { IntegrationDefinition } from "../types";

/**
 * Generic GraphQL API integration.
 *
 * This provider allows connecting to any GraphQL endpoint.
 * Configuration is flexible - the user provides endpoint URL and authentication details.
 *
 * The auth configuration supports the same strategies as MCP:
 * - none: No authentication required
 * - api_key: Static API key sent in a header
 * - bearer_oauth: OAuth access token passed through
 * - custom_headers: Custom headers for authentication
 */
export const graphqlDefinition: IntegrationDefinition = {
  id: "graphql",
  name: "GraphQL API",
  description: "Connect to any GraphQL endpoint",
  category: "api",
  // GraphQL integrations are NOT viewer-scoped by default.
  // They use org-level API keys. For viewer-scoped GraphQL with OAuth passthrough,
  // the auth config can specify viewerScoped: true or bearer_oauth.
  viewerScoped: false,
  auth: {
    type: "graphql",
    // These are defaults/placeholders - actual values come from authConfig at creation time
    endpoint: "",
    authStrategy: { type: "none" },
  },
};
