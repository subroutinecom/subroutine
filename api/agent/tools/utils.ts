import type { McpContext } from "../utils/types";
import type { AuthRequirement } from "../../models/errors";
import type { AuthBlock } from "../../integrations/providers";
import {
  type McpIntegrationConfig,
  type GraphQLIntegrationConfig,
  type IntegrationWithConfig,
} from "../../models/integration";
import { getConnectedAccountByViewer } from "../../models/connected-account";
import { listMcpTools as listMcpToolsUtil } from "../../utils/mcp-client";
import { introspectSchema } from "../../integrations/introspection";
import { generateAuthorizationUrl } from "../../services/oauth";
import { generatePatLinkUrl } from "../../models/pat-link";
import type { IntegrationProvider } from "../../integrations/providers";

// Type for configs that have an auth block (MCP and GraphQL)
type ConfigWithAuth = McpIntegrationConfig | GraphQLIntegrationConfig;

/**
 * Checks if an auth block requires viewer-scoped authentication.
 * Works for both MCP and GraphQL integrations.
 */
const requiresViewerAuth = (auth: AuthBlock): boolean => {
  if (auth.strategy.type === "bearer_oauth") {
    return true;
  }
  if (auth.strategy.type === "api_key" && auth.strategy.viewerScoped) {
    return true;
  }
  return false;
};

/**
 * Builds auth headers from an auth block and optional access token.
 */
const buildAuthHeaders = (auth: AuthBlock, accessToken?: string): Record<string, string> => {
  const headers: Record<string, string> = {};

  switch (auth.strategy.type) {
    case "bearer_oauth":
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }
      break;
    case "api_key":
      if (!auth.strategy.viewerScoped && auth.apiKey) {
        const headerName = auth.strategy.headerName ?? "Authorization";
        headers[headerName] = auth.apiKey;
      } else if (auth.strategy.viewerScoped && accessToken) {
        // For viewerScoped API keys, the "accessToken" is actually the user's API key
        const headerName = auth.strategy.headerName ?? "Authorization";
        headers[headerName] = accessToken;
      }
      break;
    case "custom_headers":
      if (auth.strategy.headers) {
        Object.assign(headers, auth.strategy.headers);
      }
      break;
    // "none" - no headers needed
  }

  return headers;
};

/**
 * Captures an auth requirement for an integration that needs viewer authentication.
 * Returns the auth requirement that was captured.
 */
const captureAuthRequirement = async (
  integration: IntegrationWithConfig,
  auth: AuthBlock,
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[]
): Promise<AuthRequirement | null> => {
  // Check if we already have this requirement captured
  if (capturedAuthRequirements.some((r) => r.integrationId === integration.id)) {
    return null;
  }

  if (auth.strategy.type === "bearer_oauth" && auth.oauthConfig) {
    const authUrl = await generateAuthorizationUrl({
      integrationId: integration.id,
      organizationId: mcpContext.organizationId,
      viewerId: mcpContext.viewerId,
    });

    const requirement: AuthRequirement = {
      integrationId: integration.id,
      integrationName: integration.name,
      provider: integration.provider as IntegrationProvider,
      authorizationUrl: authUrl.url,
      state: authUrl.state,
    };

    capturedAuthRequirements.push(requirement);
    return requirement;
  }

  if (auth.strategy.type === "api_key" && auth.strategy.viewerScoped) {
    const patLink = await generatePatLinkUrl({
      integrationId: integration.id,
      viewerId: mcpContext.viewerId,
      organizationId: mcpContext.organizationId,
    });

    // Get auth instructions from metadata if available
    const config = integration.authConfig as ConfigWithAuth;
    const metadata = config.metadata || {};

    const requirement: AuthRequirement = {
      integrationId: integration.id,
      integrationName: integration.name,
      provider: integration.provider as IntegrationProvider,
      authorizationUrl: patLink.url,
      state: "",
      patLinkUrl: patLink.url,
      authInstructions: metadata.authInstructions as string | undefined,
    };

    capturedAuthRequirements.push(requirement);
    return requirement;
  }

  return null;
};

/**
 * Handles MCP tool inspection.
 * Checks auth and returns tools if authorized, or captures auth requirement.
 */
export const handleInspectMcp = async (
  integration: IntegrationWithConfig,
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[]
): Promise<{
  success: boolean;
  type: "mcp";
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  error?: string;
}> => {
  const mcpConfig = integration.authConfig as McpIntegrationConfig;

  // Check if viewer auth is required
  if (requiresViewerAuth(mcpConfig.auth)) {
    const connectedAccount = await getConnectedAccountByViewer(
      mcpContext.viewerId,
      integration.id,
      mcpContext.organizationId
    );

    if (!connectedAccount) {
      // No connected account - capture auth requirement
      await captureAuthRequirement(integration, mcpConfig.auth, mcpContext, capturedAuthRequirements);

      return {
        success: false,
        type: "mcp",
        error: `Integration "${integration.name}" requires user authorization. The user will be prompted to authenticate.`,
      };
    }

    // Have connected account - list tools with user's token
    try {
      const tools = await listMcpToolsUtil(mcpConfig, connectedAccount.credentials.accessToken);
      return { success: true, type: "mcp", tools };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        type: "mcp",
        error: `Failed to list tools from "${integration.name}": ${message}`,
      };
    }
  } else {
    // No viewer auth needed (none, org-level api_key, custom_headers)
    try {
      const tools = await listMcpToolsUtil(mcpConfig);
      return { success: true, type: "mcp", tools };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        type: "mcp",
        error: `Failed to list tools from "${integration.name}": ${message}`,
      };
    }
  }
};

/**
 * Handles GraphQL schema inspection.
 * Checks auth and returns schema if authorized, or captures auth requirement.
 */
export const handleInspectGraphQL = async (
  integration: IntegrationWithConfig,
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[]
): Promise<{
  success: boolean;
  type: "graphql";
  schema?: string;
  schemaFetchedAt?: number;
  error?: string;
}> => {
  const graphqlConfig = integration.authConfig as GraphQLIntegrationConfig;

  // Check if viewer auth is required
  if (requiresViewerAuth(graphqlConfig.auth)) {
    const connectedAccount = await getConnectedAccountByViewer(
      mcpContext.viewerId,
      integration.id,
      mcpContext.organizationId
    );

    if (!connectedAccount) {
      // No connected account - capture auth requirement
      await captureAuthRequirement(integration, graphqlConfig.auth, mcpContext, capturedAuthRequirements);

      return {
        success: false,
        type: "graphql",
        error: `Integration "${integration.name}" requires user authorization. The user will be prompted to authenticate.`,
      };
    }

    // Have connected account - introspect with user's token
    const headers = buildAuthHeaders(graphqlConfig.auth, connectedAccount.credentials.accessToken);

    try {
      const result = await introspectSchema(graphqlConfig.endpoint, headers);
      if (result.ok) {
        return {
          success: true,
          type: "graphql",
          schema: result.result.schema,
          schemaFetchedAt: result.result.fetchedAt,
        };
      } else {
        return {
          success: false,
          type: "graphql",
          error: `Failed to introspect schema: ${result.error.message} (${result.error.code})`,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        type: "graphql",
        error: `Failed to introspect schema from "${integration.name}": ${message}`,
      };
    }
  } else {
    // No viewer auth needed (none, org-level api_key, custom_headers)
    const headers = buildAuthHeaders(graphqlConfig.auth);

    try {
      const result = await introspectSchema(graphqlConfig.endpoint, headers);
      if (result.ok) {
        return {
          success: true,
          type: "graphql",
          schema: result.result.schema,
          schemaFetchedAt: result.result.fetchedAt,
        };
      } else {
        return {
          success: false,
          type: "graphql",
          error: `Failed to introspect schema: ${result.error.message} (${result.error.code})`,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        type: "graphql",
        error: `Failed to introspect schema from "${integration.name}": ${message}`,
      };
    }
  }
};

