import { z } from "zod";
import type { AuthRequirement } from "../../models/errors.ts";
import { getIntegrationOrGlobal } from "../../models/integration.ts";
import type { McpContext } from "../utils/types.ts";
import { handleInspectGraphQL, handleInspectMcp } from "./utils.ts";

/**
 * Result type for inspectIntegration tool.
 * Discriminated union based on integration type.
 */
type InspectResult =
  | {
      success: true;
      type: "mcp";
      integrationName: string;
      tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
      usage: string;
    }
  | {
      success: true;
      type: "graphql";
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
 * Creates the unified inspectIntegration tool.
 * Works in both provided and discovery modes.
 *
 * The integration must be "known" - either:
 * - Listed via listIntegrations (provided mode)
 * - Found via findIntegration (both modes)
 * - Registered in mcpContext.integrationNameToId
 */
export const createInspectIntegration = (
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[],
  usedIntegrationIds: Set<string>,
  providedIntegrations: {
    name: string;
    id: string;
    connectionUrl?: string;
    type: "mcp" | "graphql";
  }[] = []
) => {
  return {
    description: `Inspect an integration to discover what it provides.

For MCP integrations: Returns the list of available tools and their input schemas.
For GraphQL integrations: Returns the GraphQL schema (SDL) for generating queries.

The integration must be found first (via listIntegrations or findIntegration).
Call this BEFORE writing code to understand what the integration can do.`,
    inputSchema: z.object({
      integrationName: z.string().describe("The name of the integration to inspect"),
    }),
    execute: async (params: { integrationName: string }): Promise<InspectResult> => {
      // Look up the integration ID from the map
      const integrationId = mcpContext.integrationNameToId.get(params.integrationName);
      if (!integrationId) {
        return {
          success: false,
          error: `Integration "${params.integrationName}" not found. Call findIntegration("${params.integrationName}") first to locate it.`,
        };
      }

      // Check if this is a provided integration with a connection URL (Mock/Test mode)
      const provided = providedIntegrations.find((i) => i.id === integrationId && i.connectionUrl);
      if (provided && provided.connectionUrl) {
        // Construct a temporary integration object for the mock server
        // This bypasses the DB lookup
        const mockIntegration: any = {
          id: provided.id,
          name: provided.name,
          authConfig: {
            type: provided.type as "mcp" | "graphql", // Type assertion for safety
            serverUrl: provided.connectionUrl,
            endpoint: provided.connectionUrl, // GraphQL uses endpoint
            auth: {
              strategy: { type: "none" }, // Mocks usually don't need auth
            },
            transport: "streamable-http", // Default for mocks
          },
        };

        // Handle based on integration type
        if (provided.type === "mcp") {
          const result = await handleInspectMcp(
            mockIntegration,
            mcpContext,
            capturedAuthRequirements
          );
          if (result.success && result.tools) {
            usedIntegrationIds.add(mockIntegration.id);
            return {
              success: true,
              type: "mcp",
              integrationName: mockIntegration.name,
              tools: result.tools,
              usage: `This is an MCP integration. Use integrations.getMcpClient() to get a client:

const client = await integrations.getMcpClient("${mockIntegration.name}");
const result = await client.callTool({ name: "toolName", arguments: { param: "value" } });
const data = JSON.parse(result.content[0]?.text || "{}");`,
            };
          }
          return { success: false, error: result.error ?? "Unknown error" };
        } else if (provided.type === "graphql") {
          const result = await handleInspectGraphQL(
            mockIntegration,
            mcpContext,
            capturedAuthRequirements
          );
          if (result.success && result.schema) {
            usedIntegrationIds.add(mockIntegration.id);
            return {
              success: true,
              type: "graphql",
              integrationName: mockIntegration.name,
              schema: result.schema,
              schemaFetchedAt: result.schemaFetchedAt!,
              usage: `This is a GraphQL integration. Use integrations.getGraphQLClient() to get a client:

const client = await integrations.getGraphQLClient("${mockIntegration.name}");
const result = await client.request(\`query { ... }\`, { variables });

IMPORTANT: Generated GraphQL queries MUST be valid against the schema above.`,
            };
          }
          return { success: false, error: result.error ?? "Unknown error" };
        }
      }

      // Fetch the full integration from DB
      const integration = await getIntegrationOrGlobal(integrationId, mcpContext.organizationId);
      if (!integration) {
        return {
          success: false,
          error: `Integration "${params.integrationName}" (id: ${integrationId}) not found in database.`,
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
            integrationName: integration.name,
            tools: result.tools,
            usage: `This is an MCP integration. Use integrations.getMcpClient() to get a client:

const client = await integrations.getMcpClient("${integration.name}");
const result = await client.callTool({ name: "toolName", arguments: { param: "value" } });
const data = JSON.parse(result.content[0]?.text || "{}");`,
          };
        }
        return { success: false, error: result.error ?? "Unknown error" };
      }

      if (integration.authConfig.type === "graphql") {
        const result = await handleInspectGraphQL(
          integration,
          mcpContext,
          capturedAuthRequirements
        );
        if (result.success && result.schema) {
          usedIntegrationIds.add(integration.id);
          return {
            success: true,
            type: "graphql",
            integrationName: integration.name,
            schema: result.schema,
            schemaFetchedAt: result.schemaFetchedAt!,
            usage: `This is a GraphQL integration. Use integrations.getGraphQLClient() to get a client:

const client = await integrations.getGraphQLClient("${integration.name}");
const result = await client.request(\`query { ... }\`, { variables });

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
