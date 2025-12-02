import { z } from "zod";
import type { McpContext } from "../types";
import { getConnectedIntegrationIds } from "../../models/connected-account";
import { getAvailableIntegrations } from "../../models/integration";

const fetchIntegrationsWithStatus = async (
  mcpContext: McpContext,
  visibilityFilter: "private" | "global" | "all"
) => {
  const connectedIntegrationIds = await getConnectedIntegrationIds(
    mcpContext.viewerId,
    mcpContext.organizationId
  );
  const integrations = await getAvailableIntegrations(
    mcpContext.organizationId,
    visibilityFilter
  );
  const mcpIntegrations = integrations.filter(
    (i) => i.enabled && i.authConfig.type === "mcp"
  );

  return mcpIntegrations.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    visibility: i.visibility,
    status: i.status,
    hasConnection: connectedIntegrationIds.has(i.id),
  }));
};

export const createGetOrganizationIntegrations = (mcpContext: McpContext) => {
  return {
    description: `STEP 1 (CALL THIS FIRST): List organization-specific MCP integrations.

These are custom integrations configured by the organization - ALWAYS check these first.
If a matching integration exists here, USE IT. Do not check global integrations unless needed.

Only proceed to getGlobalIntegrations if no suitable org-specific integration is found.`,
    inputSchema: z.object({}),
    execute: async () => {
      console.log(`[tool:getOrganizationIntegrations] Called`);
      const integrations = await fetchIntegrationsWithStatus(mcpContext, "private");
      console.log(
        `[tool:getOrganizationIntegrations] Found ${integrations.length} org-specific MCP integrations`
      );

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
        message: `Found ${integrations.length} organization-specific integration(s). Use one of these if it matches your need. Only call getGlobalIntegrations if none of these work.`,
      };
    },
  };
};

export const createGetGlobalIntegrations = (mcpContext: McpContext) => {
  return {
    description: `STEP 2: List global (first-party registry) MCP integrations.

Only call this AFTER checking getOrganizationIntegrations first!

These are pre-configured integrations from the first-party registry with OAuth already set up.
Use one of these if no organization-specific integration exists for your need.

Only use manageMcpIntegration if neither org nor global integrations have what you need.`,
    inputSchema: z.object({}),
    execute: async () => {
      console.log(`[tool:getGlobalIntegrations] Called`);
      const integrations = await fetchIntegrationsWithStatus(mcpContext, "global");
      console.log(
        `[tool:getGlobalIntegrations] Found ${integrations.length} global MCP integrations`
      );

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
        message: `Found ${integrations.length} global integration(s) from the first-party registry. Use one of these if it matches your need. Only use manageMcpIntegration if none of these work.`,
      };
    },
  };
};
