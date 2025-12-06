import { z } from "zod";
import type { IntegrationInfo } from "../prompts/index";

/**
 * Creates the listIntegrations tool for PROVIDED mode only.
 * Returns the list of integrations that were explicitly passed to the agent.
 */
export const createListIntegrations = (integrations: IntegrationInfo[]) => {
  return {
    description: `List all integrations available for this subroutine.

Returns the integrations that were explicitly configured for use.
Each integration has a "type" field:
- "mcp": MCP server - call inspectIntegration to see available tools
- "graphql": GraphQL API - call inspectIntegration to see the schema

Call inspectIntegration(name) to learn what a specific integration can do.`,
    inputSchema: z.object({}),
    execute: async () => {
      if (integrations.length === 0) {
        return {
          integrations: [],
          count: 0,
          message: "No integrations are configured for this subroutine.",
        };
      }

      return {
        integrations: integrations.map((i) => ({
          name: i.name,
          type: i.type,
        })),
        count: integrations.length,
        message: `${integrations.length} integration(s) available. Call inspectIntegration(name) to see what each can do.`,
      };
    },
  };
};
