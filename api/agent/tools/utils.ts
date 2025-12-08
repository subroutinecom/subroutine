import type { McpContext } from "../utils/types";
import type { AuthRequirement } from "../../models/errors";
import type { AuthBlock } from "../../integrations/providers";
import {
  type McpIntegrationConfig,
  type GraphQLIntegrationConfig,
  type OpenAPIIntegrationConfig,
  type IntegrationWithConfig,
  storeMcpToolsOnIntegration,
  storeGraphQLSchemaOnIntegration,
  storeOpenAPISpecOnIntegration,
} from "../../models/integration";
import { getConnectedAccountByViewer } from "../../models/connected-account";
import { listMcpTools as listMcpToolsUtil } from "../../utils/mcp-client";
import { introspectSchema } from "../../integrations/introspection";
import { fetchOpenAPISpec, parseOpenAPISpec } from "../../integrations/openapi-introspection";
import { generateAuthorizationUrl } from "../../services/oauth";
import { generatePatLinkUrl } from "../../models/pat-link";
import type { IntegrationProvider } from "../../integrations/providers";
import { buildAuthHeadersFromBlock } from "../../integrations/auth-utils";
import { getLogger } from "../../utils/logger";

const logger = getLogger("api/agent/tools/utils.ts");

// Type for configs that have an auth block (MCP, GraphQL, OpenAPI)
type ConfigWithAuth = McpIntegrationConfig | GraphQLIntegrationConfig | OpenAPIIntegrationConfig;

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

/** Options for inspect handlers */
export interface InspectOptions {
  forceRefresh?: boolean;
}

/**
 * Handles MCP tool inspection.
 * Checks cache first, then auth, and returns tools if authorized.
 * Stores tools after successful fetch for future cache hits.
 */
export const handleInspectMcp = async (
  integration: IntegrationWithConfig,
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[],
  options?: InspectOptions
): Promise<{
  success: boolean;
  type: "mcp";
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  error?: string;
}> => {
  const mcpConfig = integration.authConfig as McpIntegrationConfig;

  // Check cache first (unless forceRefresh is requested)
  if (!options?.forceRefresh && mcpConfig.tools && mcpConfig.toolsFetchedAt) {
    return { success: true, type: "mcp", tools: mcpConfig.tools };
  }

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

      // Store tools for future cache hits (fire-and-forget)
      storeMcpToolsOnIntegration(integration.id, mcpContext.organizationId, tools).catch((err) =>
        logger.warn("Failed to cache MCP tools", { integrationId: integration.id, error: err })
      );

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

      // Store tools for future cache hits (fire-and-forget)
      storeMcpToolsOnIntegration(integration.id, mcpContext.organizationId, tools).catch((err) =>
        logger.warn("Failed to cache MCP tools", { integrationId: integration.id, error: err })
      );

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
 * Checks cache first, then auth, and returns schema if authorized.
 * Stores schema after successful introspection for future cache hits.
 */
export const handleInspectGraphQL = async (
  integration: IntegrationWithConfig,
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[],
  options?: InspectOptions
): Promise<{
  success: boolean;
  type: "graphql";
  schema?: string;
  schemaFetchedAt?: number;
  error?: string;
}> => {
  const graphqlConfig = integration.authConfig as GraphQLIntegrationConfig;

  // Check cache first (unless forceRefresh is requested)
  if (!options?.forceRefresh && graphqlConfig.schema && graphqlConfig.schemaFetchedAt) {
    return {
      success: true,
      type: "graphql",
      schema: graphqlConfig.schema,
      schemaFetchedAt: graphqlConfig.schemaFetchedAt,
    };
  }

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
    const headers = buildAuthHeadersFromBlock(graphqlConfig.auth, connectedAccount.credentials.accessToken);

    try {
      const result = await introspectSchema(graphqlConfig.endpoint, headers);
      if (result.ok) {
        // Store schema for future cache hits (fire-and-forget)
        storeGraphQLSchemaOnIntegration(
          integration.id,
          mcpContext.organizationId,
          result.result.schema,
          result.result.fetchedAt
        ).catch((err) =>
          logger.warn("Failed to cache GraphQL schema", { integrationId: integration.id, error: err })
        );

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
    const headers = buildAuthHeadersFromBlock(graphqlConfig.auth);

    try {
      const result = await introspectSchema(graphqlConfig.endpoint, headers);
      if (result.ok) {
        // Store schema for future cache hits (fire-and-forget)
        storeGraphQLSchemaOnIntegration(
          integration.id,
          mcpContext.organizationId,
          result.result.schema,
          result.result.fetchedAt
        ).catch((err) =>
          logger.warn("Failed to cache GraphQL schema", { integrationId: integration.id, error: err })
        );

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

/**
 * Handles OpenAPI spec inspection.
 * Checks cache first, then auth, and returns spec if authorized.
 * Stores spec after successful fetch for future cache hits.
 */
export const handleInspectOpenAPI = async (
  integration: IntegrationWithConfig,
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[],
  options?: InspectOptions
): Promise<{
  success: boolean;
  type: "openapi";
  spec?: string;
  specVersion?: "3.0" | "3.1";
  specFetchedAt?: number;
  operations?: Array<{ method: string; path: string; summary?: string }>;
  error?: string;
}> => {
  const openapiConfig = integration.authConfig as OpenAPIIntegrationConfig;

  // Check cache first (unless forceRefresh is requested)
  if (
    !options?.forceRefresh &&
    openapiConfig.spec &&
    openapiConfig.specVersion &&
    openapiConfig.specFetchedAt
  ) {
    const result = await parseOpenAPISpec(openapiConfig.spec);
    if (result.ok) {
      return {
        success: true,
        type: "openapi",
        spec: result.result.spec,
        specVersion: result.result.version,
        specFetchedAt: openapiConfig.specFetchedAt,
        operations: result.result.operations.map((op) => ({
          method: op.method,
          path: op.path,
          summary: op.summary,
        })),
      };
    }
  }

  if (!openapiConfig.specUrl) {
    return {
      success: false,
      type: "openapi",
      error: `Integration "${integration.name}" has no OpenAPI spec URL configured and no cached spec.`,
    };
  }

  if (requiresViewerAuth(openapiConfig.auth)) {
    const connectedAccount = await getConnectedAccountByViewer(
      mcpContext.viewerId,
      integration.id,
      mcpContext.organizationId
    );

    if (!connectedAccount) {
      await captureAuthRequirement(integration, openapiConfig.auth, mcpContext, capturedAuthRequirements);

      return {
        success: false,
        type: "openapi",
        error: `Integration "${integration.name}" requires user authorization. The user will be prompted to authenticate.`,
      };
    }

    const headers = buildAuthHeadersFromBlock(openapiConfig.auth, connectedAccount.credentials.accessToken);

    try {
      const result = await fetchOpenAPISpec(openapiConfig.specUrl, headers);
      if (result.ok) {
        // Store spec for future cache hits (fire-and-forget)
        storeOpenAPISpecOnIntegration(
          integration.id,
          mcpContext.organizationId,
          result.result.spec,
          result.result.version,
          result.result.fetchedAt
        ).catch((err) =>
          logger.warn("Failed to cache OpenAPI spec", { integrationId: integration.id, error: err })
        );

        return {
          success: true,
          type: "openapi",
          spec: result.result.spec,
          specVersion: result.result.version,
          specFetchedAt: result.result.fetchedAt,
          operations: result.result.operations.map((op) => ({
            method: op.method,
            path: op.path,
            summary: op.summary,
          })),
        };
      } else {
        return {
          success: false,
          type: "openapi",
          error: `Failed to fetch OpenAPI spec: ${result.error.message} (${result.error.code})`,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        type: "openapi",
        error: `Failed to fetch OpenAPI spec from "${integration.name}": ${message}`,
      };
    }
  } else {
    const headers = buildAuthHeadersFromBlock(openapiConfig.auth);

    try {
      const result = await fetchOpenAPISpec(openapiConfig.specUrl, headers);
      if (result.ok) {
        // Store spec for future cache hits (fire-and-forget)
        storeOpenAPISpecOnIntegration(
          integration.id,
          mcpContext.organizationId,
          result.result.spec,
          result.result.version,
          result.result.fetchedAt
        ).catch((err) =>
          logger.warn("Failed to cache OpenAPI spec", { integrationId: integration.id, error: err })
        );

        return {
          success: true,
          type: "openapi",
          spec: result.result.spec,
          specVersion: result.result.version,
          specFetchedAt: result.result.fetchedAt,
          operations: result.result.operations.map((op) => ({
            method: op.method,
            path: op.path,
            summary: op.summary,
          })),
        };
      } else {
        return {
          success: false,
          type: "openapi",
          error: `Failed to fetch OpenAPI spec: ${result.error.message} (${result.error.code})`,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        type: "openapi",
        error: `Failed to fetch OpenAPI spec from "${integration.name}": ${message}`,
      };
    }
  }
};
