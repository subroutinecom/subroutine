import { z } from "zod";
import type { McpContext } from "../utils/types";
import { getIntegrationByName } from "../../models/integration";
import { runMcpIntegrator } from "../agent-mcp-integrator";
import { getLogger } from "../../utils/logger.ts";
const logger = getLogger("agent.tools.manage-integration");


export const createManageMcpIntegration = (
  mcpContext: McpContext,
  usedIntegrationIds: Set<string>
) => {
  return {
    description: `STEP 3 (LAST RESORT): Discover and set up a NEW MCP integration when no suitable one exists.

CRITICAL: Only use this tool AFTER calling BOTH:
1. getOrganizationIntegrations - checked org-specific integrations FIRST
2. getGlobalIntegrations - checked global registry SECOND
...and confirmed NEITHER has what you need.

This tool "spelunks" the web to find and configure MCP servers. It's expensive and slow.
Always prefer existing integrations over creating new ones.

Only call this tool when:
1. getOrganizationIntegrations shows NO matching org-specific integration
2. getGlobalIntegrations shows NO matching global integration
3. You need a capability not covered by any existing integration

This spawns a specialist agent that will:
1. Search the web for remote MCP servers that provide the needed capability
2. Select the best option with simplest authentication
3. Test the connection works
4. Create a new dynamic integration for this organization

The result tells you what authentication the user needs to provide:
- authRequired: "none" → integration ready to use immediately
- authRequired: "api_key" → tell user what credentials they need (see authInstructions)`,
    inputSchema: z.object({
      need: z
        .string()
        .describe(
          "The service or capability needed, e.g. 'github' for repository access, 'slack' for messaging, 'postgres' for database"
        ),
    }),
    execute: async (params: { need: string }) => {
      logger.info(`[tool:manageMcpIntegration] Called with need: "${params.need}"`);
      // Check if an integration with this name already exists
      const existing = await getIntegrationByName(params.need, mcpContext.organizationId);

      if (existing && existing.status === "dynamic") {
        logger.info(`[tool:manageMcpIntegration] Found existing dynamic integration, fixing`);
        // Fix existing dynamic integration
        const result = await runMcpIntegrator({
          organizationId: mcpContext.organizationId,
          viewerId: mcpContext.viewerId,
          need: params.need,
          existingIntegrationId: existing.id,
        });
        logger.info(`[tool:manageMcpIntegration] Fix result:`, JSON.stringify(result));
        // Track the integration ID if successful
        if (result.success && result.integrationId) {
          usedIntegrationIds.add(result.integrationId);
          mcpContext.integrationNameToId.set(
            result.integrationName || params.need,
            result.integrationId
          );
          logger.info(
            `[tool:manageMcpIntegration] Tracked fixed integration ID: ${result.integrationId}`
          );
        }
        return result;
      }

      logger.info(`[tool:manageMcpIntegration] Creating new integration`);
      // Create new integration
      const result = await runMcpIntegrator({
        organizationId: mcpContext.organizationId,
        viewerId: mcpContext.viewerId,
        need: params.need,
      });
      logger.info(`[tool:manageMcpIntegration] Create result:`, JSON.stringify(result));
      // Track the integration ID if successful
      if (result.success && result.integrationId) {
        usedIntegrationIds.add(result.integrationId);
        mcpContext.integrationNameToId.set(
          result.integrationName || params.need,
          result.integrationId
        );
        logger.info(
          `[tool:manageMcpIntegration] Tracked new integration ID: ${result.integrationId}`
        );
      }
      return result;
    },
  };
};
