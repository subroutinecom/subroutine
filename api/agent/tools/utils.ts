import type { McpContext } from "../utils/types";
import type { AuthRequirement } from "../../models/errors";
import { getIntegrationOrGlobal, type McpIntegrationConfig } from "../../models/integration";
import { getConnectedAccountByViewer } from "../../models/connected-account";
import { listMcpTools as listMcpToolsUtil } from "../../utils/mcp-client";
import { generateAuthorizationUrl } from "../../services/oauth";
import { generatePatLinkUrl } from "../../models/pat-link";
import type { IntegrationProvider } from "../../integrations/providers";

/**
 * Checks if an MCP auth strategy requires viewer-scoped authentication.
 */
export const requiresViewerAuth = (config: McpIntegrationConfig): boolean => {
  if (config.auth.strategy.type === "bearer_oauth") {
    return true;
  }
  if (config.auth.strategy.type === "api_key" && config.auth.strategy.viewerScoped) {
    return true;
  }
  return false;
};

/**
 * Handles the listMcpTools tool call from the agent.
 * Checks auth and returns tools if authorized, or captures auth requirement.
 */
export const handleListMcpTools = async (
  integrationName: string,
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[]
): Promise<{
  success: boolean;
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  error?: string;
}> => {
  const integrationId = mcpContext.integrationNameToId.get(integrationName);
  if (!integrationId) {
    return {
      success: false,
      error: `Unknown integration: "${integrationName}". Valid integrations are: ${Array.from(mcpContext.integrationNameToId.keys()).join(", ")}`,
    };
  }

  const integration = await getIntegrationOrGlobal(integrationId, mcpContext.organizationId);
  if (!integration) {
    return {
      success: false,
      error: `Integration "${integrationName}" not found`,
    };
  }

  if (integration.authConfig.type !== "mcp") {
    return {
      success: false,
      error: `Integration "${integrationName}" is not an MCP integration`,
    };
  }

  const mcpConfig = integration.authConfig as McpIntegrationConfig;

  // Check if viewer auth is required
  if (requiresViewerAuth(mcpConfig)) {
    const connectedAccount = await getConnectedAccountByViewer(
      mcpContext.viewerId,
      integrationId,
      mcpContext.organizationId
    );

    if (!connectedAccount) {
      // No connected account - capture auth requirement
      if (mcpConfig.auth.strategy.type === "bearer_oauth" && mcpConfig.auth.oauthConfig) {
        const auth = await generateAuthorizationUrl({
          integrationId,
          organizationId: mcpContext.organizationId,
          viewerId: mcpContext.viewerId,
        });

        // Check if we already have this requirement captured
        if (!capturedAuthRequirements.some((r) => r.integrationId === integrationId)) {
          capturedAuthRequirements.push({
            integrationId,
            integrationName: integration.name,
            provider: integration.provider as IntegrationProvider,
            authorizationUrl: auth.url,
            state: auth.state,
          });
        }
      } else if (mcpConfig.auth.strategy.type === "api_key" && mcpConfig.auth.strategy.viewerScoped) {
        // viewerScoped api_key - generate PAT link
        if (!capturedAuthRequirements.some((r) => r.integrationId === integrationId)) {
          const patLink = await generatePatLinkUrl({
            integrationId,
            viewerId: mcpContext.viewerId,
            organizationId: mcpContext.organizationId,
          });

          const metadata = mcpConfig.metadata || {};

          capturedAuthRequirements.push({
            integrationId,
            integrationName: integration.name,
            provider: integration.provider as IntegrationProvider,
            authorizationUrl: patLink.url,
            state: "",
            patLinkUrl: patLink.url,
            authInstructions: metadata.authInstructions as string | undefined,
          });
        }
      }

      return {
        success: false,
        error: `Integration "${integrationName}" requires user authorization. The user will be prompted to authenticate.`,
      };
    }

    // Have connected account - list tools with user's token
    try {
      const tools = await listMcpToolsUtil(mcpConfig, connectedAccount.credentials.accessToken);
      return { success: true, tools };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to list tools from "${integrationName}": ${message}`,
      };
    }
  } else {
    // No viewer auth needed (none, org-level api_key, custom_headers)
    try {
      const tools = await listMcpToolsUtil(mcpConfig);
      return { success: true, tools };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to list tools from "${integrationName}": ${message}`,
      };
    }
  }
};
