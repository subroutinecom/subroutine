import { z } from "zod";
import type { McpContext } from "../utils/types";
import { getConnectedIntegrationIds } from "../../models/connected-account";
import { getAvailableIntegrations } from "../../models/integration";

/**
 * Fetches integrations with connection status.
 * Returns all integration types (MCP, GraphQL, etc.) - not just MCP.
 */
const fetchIntegrationsWithStatus = async (
  mcpContext: McpContext,
  visibilityFilter: "private" | "global" | "all"
) => {
  const connectedIntegrationIds = await getConnectedIntegrationIds(
    mcpContext.viewerId,
    mcpContext.organizationId
  );
  const integrations = await getAvailableIntegrations(mcpContext.organizationId, visibilityFilter);

  // Filter to enabled integrations with supported types (MCP and GraphQL)
  const supportedIntegrations = integrations.filter(
    (i) => i.enabled && (i.authConfig.type === "mcp" || i.authConfig.type === "graphql")
  );

  return supportedIntegrations.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    visibility: i.visibility,
    status: i.status,
    type: i.authConfig.type as "mcp" | "graphql" | "openapi",
    hasConnection: connectedIntegrationIds.has(i.id),
  }));
};

export const createGetOrganizationIntegrations = (mcpContext: McpContext) => {
  return {
    description: `STEP 1 (CALL THIS FIRST): List organization-specific integrations.

These are custom integrations configured by the organization - ALWAYS check these first.
If a matching integration exists here, USE IT. Do not check global integrations unless needed.

Each integration has a "type" field indicating the protocol:
- "mcp": MCP server integration - use inspectIntegration to discover available tools
- "graphql": GraphQL API integration - use inspectIntegration to get the schema

Only proceed to getGlobalIntegrations if no suitable org-specific integration is found.`,
    inputSchema: z.object({}),
    execute: async () => {
      const integrations = await fetchIntegrationsWithStatus(mcpContext, "private");

      if (integrations.length === 0) {
        return {
          integrations: [],
          count: 0,
          message:
            "No organization-specific integrations found. Call getGlobalIntegrations to check the first-party registry.",
        };
      }

      return {
        integrations,
        count: integrations.length,
        message: `Found ${integrations.length} organization-specific integration(s). Use inspectIntegration to see what each integration provides. Only call getGlobalIntegrations if none of these work.`,
      };
    },
  };
};

export const createGetGlobalIntegrations = (mcpContext: McpContext) => {
  return {
    description: `STEP 2: List global (first-party registry) integrations.

Only call this AFTER checking getOrganizationIntegrations first!

These are pre-configured integrations from the first-party registry with OAuth already set up.
Use one of these if no organization-specific integration exists for your need.

Each integration has a "type" field indicating the protocol:
- "mcp": MCP server integration - use inspectIntegration to discover available tools
- "graphql": GraphQL API integration - use inspectIntegration to get the schema

Only use manageMcpIntegration if neither org nor global integrations have what you need.`,
    inputSchema: z.object({}),
    execute: async () => {
      const integrations = await fetchIntegrationsWithStatus(mcpContext, "global");

      if (integrations.length === 0) {
        return {
          integrations: [],
          count: 0,
          message:
            "No global integrations available. Use manageMcpIntegration as a LAST RESORT to discover and set one up.",
        };
      }

      return {
        integrations,
        count: integrations.length,
        message: `Found ${integrations.length} global integration(s) from the first-party registry. Use inspectIntegration to see what each provides. Only use manageMcpIntegration if none of these work.`,
      };
    },
  };
};
