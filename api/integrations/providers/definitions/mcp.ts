import type { IntegrationDefinition } from "../types";

/**
 * Generic MCP (Model Context Protocol) server integration.
 *
 * This provider allows connecting to any MCP-compliant server.
 * Configuration is flexible - the user provides server URL, transport type,
 * and authentication details.
 *
 * For generic providers, all auth options are available since the user
 * specifies everything during integration creation.
 */
export const mcpDefinition: IntegrationDefinition = {
  id: "mcp",
  name: "MCP Server",
  description: "Connect to any Model Context Protocol (MCP) server",
  category: "generic",
  viewerScoped: false,
  auth: {
    type: "mcp",
    serverUrl: "",
    transport: "streamable-http",
    // Generic providers support all auth options - user chooses during creation
    authOptions: [
      {
        id: "none",
        strategy: { type: "none" },
        label: "No Authentication",
        description: "Server doesn't require authentication",
      },
      {
        id: "api_key",
        strategy: { type: "api_key", headerName: "X-API-Key" },
        label: "API Key",
        description: "Authenticate with a static API key",
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
