import { z } from "zod";
import type { McpContext } from "../utils/types";
import type { AuthRequirement } from "../../models/errors";
import { handleInspectMcp, handleInspectGraphQL } from "./utils";
import {
  getIntegrationOrGlobal,
  getIntegrationByName,
  getAvailableIntegrations,
} from "../../models/integration";

/**
 * Result type for inspectIntegration tool.
 * Discriminated union based on integration type.
 */
type InspectResult =
  | {
      success: true;
      type: "mcp";
      integrationId: string;
      integrationName: string;
      tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
      usage: string;
    }
  | {
      success: true;
      type: "graphql";
      integrationId: string;
      integrationName: string;
      schema: string;
      schemaFetchedAt: number;
      usage: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Creates the inspectIntegration tool for the "provided" context (integration name already known).
 */
export const createInspectIntegrationProvided = (
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[],
  usedIntegrationIds: Set<string>
) => {
  return {
    description: `Inspect an integration to discover what it provides.

For MCP integrations: Returns the list of available tools and their input schemas.
For GraphQL integrations: Returns the GraphQL schema (SDL) for generating queries.

Call this BEFORE writing code that uses an integration to understand its capabilities.`,
    inputSchema: z.object({
      integrationName: z.string().describe("The name of the integration to inspect"),
    }),
    execute: async (params: { integrationName: string }): Promise<InspectResult> => {
      const integrationId = mcpContext.integrationNameToId.get(params.integrationName);
      if (!integrationId) {
        return {
          success: false,
          error: `Unknown integration: "${params.integrationName}". Valid integrations are: ${Array.from(mcpContext.integrationNameToId.keys()).join(", ")}`,
        };
      }

      const integration = await getIntegrationOrGlobal(integrationId, mcpContext.organizationId);
      if (!integration) {
        return {
          success: false,
          error: `Integration "${params.integrationName}" not found`,
        };
      }

      // Handle based on integration type
      if (integration.authConfig.type === "mcp") {
        const result = await handleInspectMcp(integration, mcpContext, capturedAuthRequirements);
        if (result.success && result.tools) {
          usedIntegrationIds.add(integration.id);
          return {
            success: true,
            type: "mcp",
            integrationId: integration.id,
            integrationName: integration.name,
            tools: result.tools,
            usage: `This is an MCP integration. Use the subroutine SDK's callTool() to invoke tools:
import { callTool } from "subroutine:integration/${integration.name}";
const result = await callTool("toolName", { param: "value" });`,
          };
        }
        return { success: false, error: result.error ?? "Unknown error" };
      }

      if (integration.authConfig.type === "graphql") {
        const result = await handleInspectGraphQL(integration, mcpContext, capturedAuthRequirements);
        if (result.success && result.schema) {
          usedIntegrationIds.add(integration.id);
          return {
            success: true,
            type: "graphql",
            integrationId: integration.id,
            integrationName: integration.name,
            schema: result.schema,
            schemaFetchedAt: result.schemaFetchedAt!,
            usage: `This is a GraphQL integration. Use the subroutine SDK's graphql client:
import { graphql } from "subroutine:integration/${integration.name}";
const result = await graphql(\`query { ... }\`, { variables });

IMPORTANT: Generated GraphQL queries MUST be valid against the schema above.`,
          };
        }
        return { success: false, error: result.error ?? "Unknown error" };
      }

      return {
        success: false,
        error: `Unsupported integration type: ${integration.authConfig.type}`,
      };
    },
  };
};

/**
 * Creates the inspectIntegration tool for the "discovery" context (needs to look up integration).
 */
export const createInspectIntegrationDiscovery = (
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[],
  usedIntegrationIds: Set<string>
) => {
  return {
    description: `Inspect an integration to discover what it provides.

For MCP integrations: Returns the list of available tools and their input schemas.
For GraphQL integrations: Returns the GraphQL schema (SDL) for generating queries.

Call this after getOrganizationIntegrations or getGlobalIntegrations to see what an integration provides.
Works with both org-specific and global integrations.`,
    inputSchema: z.object({
      integrationName: z
        .string()
        .describe("The name of the integration to inspect (from listAvailableIntegrations)"),
      integrationId: z
        .string()
        .optional()
        .describe("The ID of the integration (recommended for global integrations to avoid name collisions)"),
    }),
    execute: async (params: {
      integrationName: string;
      integrationId?: string;
    }): Promise<InspectResult> => {
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

      if (!integration) {
        return {
          success: false,
          error: `Integration "${params.integrationName}" not found. Call getOrganizationIntegrations or getGlobalIntegrations first to see available integrations.`,
        };
      }

      // Register the integration name -> id mapping for future calls
      mcpContext.integrationNameToId.set(integration.name, integration.id);

      // Handle based on integration type
      if (integration.authConfig.type === "mcp") {
        const result = await handleInspectMcp(integration, mcpContext, capturedAuthRequirements);
        if (result.success && result.tools) {
          usedIntegrationIds.add(integration.id);
          return {
            success: true,
            type: "mcp",
            integrationId: integration.id,
            integrationName: integration.name,
            tools: result.tools,
            usage: `This is an MCP integration. Use the subroutine SDK's callTool() to invoke tools:
import { callTool } from "subroutine:integration/${integration.name}";
const result = await callTool("toolName", { param: "value" });`,
          };
        }
        return { success: false, error: result.error ?? "Unknown error" };
      }

      if (integration.authConfig.type === "graphql") {
        const result = await handleInspectGraphQL(integration, mcpContext, capturedAuthRequirements);
        if (result.success && result.schema) {
          usedIntegrationIds.add(integration.id);
          return {
            success: true,
            type: "graphql",
            integrationId: integration.id,
            integrationName: integration.name,
            schema: result.schema,
            schemaFetchedAt: result.schemaFetchedAt!,
            usage: `This is a GraphQL integration. Use the subroutine SDK's graphql client:
import { graphql } from "subroutine:integration/${integration.name}";
const result = await graphql(\`query { ... }\`, { variables });

IMPORTANT: Generated GraphQL queries MUST be valid against the schema above.`,
          };
        }
        return { success: false, error: result.error ?? "Unknown error" };
      }

      return {
        success: false,
        error: `Unsupported integration type: ${integration.authConfig.type}`,
      };
    },
  };
};
