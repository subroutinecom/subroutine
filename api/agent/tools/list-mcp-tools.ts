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
      console.log(`[tool:listMcpTools] Called for integration: "${params.integrationName}"`);
      const result = await handleListMcpTools(
        params.integrationName,
        mcpContext,
        capturedAuthRequirements
      );
      console.log(
        `[tool:listMcpTools] Result: success=${result.success}, tools=${result.tools?.length ?? 0}`
      );

      if (result.success) {
        const integrationId = mcpContext.integrationNameToId.get(params.integrationName);
        if (integrationId) {
          usedIntegrationIds.add(integrationId);
          console.log(`[tool:listMcpTools] Tracked integration ID: ${integrationId}`);
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
      console.log(
        `[tool:listMcpTools:discovery] Called for integration: "${params.integrationName}" (id: ${params.integrationId ?? "not provided"}), orgId: ${mcpContext.organizationId}`
      );

      // If integrationId provided, use it directly; otherwise look up by name
      let integration;
      if (params.integrationId) {
        console.log(`[tool:listMcpTools:discovery] Looking up by ID: ${params.integrationId}`);
        integration = await getIntegrationOrGlobal(params.integrationId, mcpContext.organizationId);
        console.log(
          `[tool:listMcpTools:discovery] getIntegrationOrGlobal result: ${integration ? `found "${integration.name}" (id: ${integration.id})` : "not found"}`
        );
      } else {
        // Try org-specific first, then fall back to searching all available
        console.log(
          `[tool:listMcpTools:discovery] Looking up by name in org: "${params.integrationName}"`
        );
        integration = await getIntegrationByName(params.integrationName, mcpContext.organizationId);
        console.log(
          `[tool:listMcpTools:discovery] getIntegrationByName result: ${integration ? `found "${integration.name}" (id: ${integration.id})` : "not found"}`
        );
        if (!integration) {
          // Check global integrations by name
          console.log(
            `[tool:listMcpTools:discovery] Checking all available integrations for org: ${mcpContext.organizationId}`
          );
          const allAvailable = await getAvailableIntegrations(mcpContext.organizationId);
          console.log(
            `[tool:listMcpTools:discovery] Available integrations: ${JSON.stringify(allAvailable.map((i) => ({ id: i.id, name: i.name, organizationId: i.organizationId })))}`
          );
          integration = allAvailable.find(
            (i) => i.name.toLowerCase() === params.integrationName.toLowerCase()
          );
          console.log(
            `[tool:listMcpTools:discovery] Name match result: ${integration ? `found "${integration.name}" (id: ${integration.id})` : "not found"}`
          );
        }
      }

      if (integration) {
        mcpContext.integrationNameToId.set(integration.name, integration.id);
      } else {
        console.log(
          `[tool:listMcpTools:discovery] ERROR: Integration "${params.integrationName}" not found after all lookups`
        );
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
      console.log(
        `[tool:listMcpTools:discovery] Result: success=${result.success}, tools=${result.tools?.length ?? 0}`
      );
      // Track successful integration usage
      if (result.success) {
        usedIntegrationIds.add(integration.id);
        console.log(`[tool:listMcpTools:discovery] Tracked integration ID: ${integration.id}`);
      }
      return result;
    },
  };
};
