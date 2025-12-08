import { z } from "zod";
import type { McpContext } from "../utils/types";
import type { IntegrationInfo } from "../prompts/index";
import {
  getIntegrationByName,
  getAvailableIntegrations,
} from "../../models/integration";

type FindResult =
  | {
      found: true;
      integration: {
        id: string;
        name: string;
        type: "mcp" | "graphql" | "openapi";
      };
    }
  | {
      found: false;
      message: string;
    };

/**
 * Creates the findIntegration tool for PROVIDED mode.
 * Searches within the provided integrations list.
 */
export const createFindIntegrationProvided = (
  mcpContext: McpContext,
  integrations: IntegrationInfo[]
) => {
  return {
    description: `Find a specific integration by name.

Use this to check if a particular integration is available before inspecting it.
Returns the integration's ID and type if found.`,
    inputSchema: z.object({
      integrationName: z.string().describe("The name of the integration to find"),
    }),
    execute: async (params: { integrationName: string }): Promise<FindResult> => {
      const integration = integrations.find(
        (i) => i.name.toLowerCase() === params.integrationName.toLowerCase()
      );

      if (!integration) {
        const availableNames = integrations.map((i) => i.name).join(", ");
        return {
          found: false,
          message: `Integration "${params.integrationName}" not found. Available integrations: ${availableNames || "none"}`,
        };
      }

      // Ensure it's registered in the map for inspectIntegration
      mcpContext.integrationNameToId.set(integration.name, integration.id);

      return {
        found: true,
        integration: {
          id: integration.id,
          name: integration.name,
          type: integration.type,
        },
      };
    },
  };
};

/**
 * Creates the findIntegration tool for DISCOVERY mode.
 * Searches org integrations first, then global integrations.
 */
export const createFindIntegrationDiscovery = (mcpContext: McpContext) => {
  return {
    description: `Find a specific integration by name.

Searches organization integrations first, then the global registry.
Returns the integration's ID and type if found.

If the integration doesn't exist, use manageMcpIntegration to set one up.`,
    inputSchema: z.object({
      integrationName: z.string().describe("The name of the integration to find"),
    }),
    execute: async (params: { integrationName: string }): Promise<FindResult> => {
      // Check if already in the map
      const existingId = mcpContext.integrationNameToId.get(params.integrationName);
      if (existingId) {
        // Already found before, look up type
        const allIntegrations = await getAvailableIntegrations(mcpContext.organizationId, "all");
        const integration = allIntegrations.find((i) => i.id === existingId);
        if (integration && (integration.authConfig.type === "mcp" || integration.authConfig.type === "graphql" || integration.authConfig.type === "openapi")) {
          return {
            found: true,
            integration: {
              id: integration.id,
              name: integration.name,
              type: integration.authConfig.type,
            },
          };
        }
      }

      // Search org integrations first
      let integration = await getIntegrationByName(params.integrationName, mcpContext.organizationId);

      // If not found in org, search global
      if (!integration) {
        const allAvailable = await getAvailableIntegrations(mcpContext.organizationId, "all");
        integration = allAvailable.find(
          (i) =>
            i.name.toLowerCase() === params.integrationName.toLowerCase() &&
            i.enabled &&
            (i.authConfig.type === "mcp" || i.authConfig.type === "graphql" || i.authConfig.type === "openapi")
        ) ?? null;
      }

      if (!integration) {
        return {
          found: false,
          message: `Integration "${params.integrationName}" not found. Use manageMcpIntegration to set one up, or call getOrganizationIntegrations/getGlobalIntegrations to see what's available.`,
        };
      }

      // Verify it's a supported type
      if (integration.authConfig.type !== "mcp" && integration.authConfig.type !== "graphql" && integration.authConfig.type !== "openapi") {
        return {
          found: false,
          message: `Integration "${params.integrationName}" has unsupported type: ${integration.authConfig.type}`,
        };
      }

      // Register in the map for inspectIntegration
      mcpContext.integrationNameToId.set(integration.name, integration.id);

      return {
        found: true,
        integration: {
          id: integration.id,
          name: integration.name,
          type: integration.authConfig.type,
        },
      };
    },
  };
};
