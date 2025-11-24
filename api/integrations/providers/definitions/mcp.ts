import type { IntegrationDefinition } from "../types";

/**
 * Generic MCP (Model Context Protocol) server integration.
 *
 * This provider allows connecting to any MCP-compliant server.
 * Configuration is flexible - the user provides server URL, transport type,
 * and authentication details.
 *
 * Unlike OAuth integrations, MCP integrations don't have a predefined
 * auth flow - the auth configuration is passed directly to the MCP client.
 */
export const mcpDefinition: IntegrationDefinition = {
  id: "mcp",
  name: "MCP Server",
  description: "Connect to any Model Context Protocol (MCP) server",
  category: "mcp",
  // MCP integrations are NOT viewer-scoped by default.
  // They use org-level API keys. For viewer-scoped MCP with OAuth passthrough,
  // use a dedicated provider definition (e.g., "mcp_github").
  viewerScoped: false,
  auth: {
    type: "mcp",
    // These are defaults/placeholders - actual values come from authConfig at creation time
    serverUrl: "",
    transport: "streamable-http",
    authStrategy: { type: "none" },
  },
};
