import { z } from "zod";
import type { McpContext } from "../utils/types";
import type { AuthRequirement } from "../../models/errors";
import { handleListMcpTools } from "./utils";
import {
  getIntegrationOrGlobal,
  getIntegrationByName,
  getAvailableIntegrations,
} from "../../models/integration";

export const createListMcpToolsProvided = (
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[],
  usedIntegrationIds: Set<string>
) => {
  return {
    description:
      "Discover the available tools from an MCP integration. Call this before writing code that uses MCP tools to understand what tools are available and their input schemas.",
    inputSchema: z.object({
      integrationName: z.string().describe("The name of the MCP integration to list tools from"),
    }),
    execute: async (params: { integrationName: string }) => {
      const result = await handleListMcpTools(
        params.integrationName,
        mcpContext,
        capturedAuthRequirements
      );

      if (result.success) {
        const integrationId = mcpContext.integrationNameToId.get(params.integrationName);
        if (integrationId) {
          usedIntegrationIds.add(integrationId);
        }
      }
      return result;
    },
  };
};

export const createListMcpToolsDiscovery = (
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[],
  usedIntegrationIds: Set<string>
) => {
  return {
    description:
      "Discover the available tools from an MCP integration. Call this after getOrganizationIntegrations or getGlobalIntegrations to see what tools an integration provides. Works with both org-specific and global integrations.",
    inputSchema: z.object({
      integrationName: z
        .string()
        .describe(
          "The name of the MCP integration to list tools from (from listAvailableIntegrations)"
        ),
      integrationId: z
        .string()
        .optional()
        .describe(
          "The ID of the integration (recommended for global integrations to avoid name collisions)"
        ),
    }),
    execute: async (params: { integrationName: string; integrationId?: string }) => {
      // If integrationId provided, use it directly; otherwise look up by name
      let integration;
      if (params.integrationId) {
        integration = await getIntegrationOrGlobal(params.integrationId, mcpContext.organizationId);
      } else {
        // Try org-specific first, then fall back to searching all available
        integration = await getIntegrationByName(params.integrationName, mcpContext.organizationId);
        if (!integration) {
          // Check global integrations by name
          const allAvailable = await getAvailableIntegrations(mcpContext.organizationId);
          integration = allAvailable.find(
            (i) => i.name.toLowerCase() === params.integrationName.toLowerCase()
          );
        }
      }

      if (integration) {
        mcpContext.integrationNameToId.set(integration.name, integration.id);
      } else {
        return {
          success: false,
          error: `Integration "${params.integrationName}" not found. Call getOrganizationIntegrations or getGlobalIntegrations first to see available integrations.`,
        };
      }

      const result = await handleListMcpTools(
        integration.name,
        mcpContext,
        capturedAuthRequirements
      );
      // Track successful integration usage
      if (result.success) {
        usedIntegrationIds.add(integration.id);
      }
      return result;
    },
  };
};
