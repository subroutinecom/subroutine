/**
 * Shared sandbox execution utilities.
 *
 * This module provides a unified interface for building sandbox integration
 * configurations and executing code in the sandbox. It is used by both:
 * - Production run execution (runSubroutine)
 * - Integration test execution (runIntegrationTests)
 */

import { getConfig } from "../config/loader";
import type { IntegrationProvider } from "../integrations/providers";
import {
  buildAuthHeadersFromBlock,
  getViewerCredentialRequirement,
} from "../integrations/auth-utils";
import type {
  AuthStrategy,
  SandboxGraphQLConfig,
  SandboxMcpConfig,
  SandboxOpenAPIConfig,
} from "../integrations/providers/types";
import { generateAuthorizationUrl } from "./oauth";
import type {
  ConnectedAccountWithCredentials,
  ConnectedAccountCredentials,
} from "../models/connected-account";
import { getConnectedAccountsByViewer, getConnectedAccountByViewer } from "../models/connected-account";
import { IntegrationAuthRequiredError } from "../models/errors";
import type {
  GraphQLIntegrationConfig,
  McpIntegrationConfig,
  OpenAPIIntegrationConfig,
  OAuthConfig,
} from "../models/integration";
import { getIntegration, getIntegrationOrGlobal, type IntegrationWithConfig } from "../models/integration";
import { generatePatLinkUrl } from "../models/pat-link";
import { getLogger } from "../utils/logger";

const logger = getLogger("api/services/sandbox.ts");

// ============================================================================
// Types
// ============================================================================

export type SandboxIntegrationAccount = {
  id: string;
  viewerId: string;
  accountIdentifier?: string | null;
  credentials: ConnectedAccountCredentials;
};

export type SandboxIntegrationDefinition = {
  id: string;
  provider: IntegrationProvider;
  name: string;
  authConfig: Record<string, unknown>;
  account?: SandboxIntegrationAccount;
  /** MCP-specific configuration. Present when authConfig.type is "mcp". */
  mcpConfig?: SandboxMcpConfig;
  /** GraphQL-specific configuration. Present when authConfig.type is "graphql". */
  graphqlConfig?: SandboxGraphQLConfig;
  /** OpenAPI-specific configuration. Present when authConfig.type is "openapi". */
  openapiConfig?: SandboxOpenAPIConfig;
};

export type SandboxExecutionResult = {
  success: boolean;
  result?: unknown;
  error?: string;
};

// ============================================================================
// Config Builders
// ============================================================================

/**
 * Converts McpIntegrationConfig to SandboxMcpConfig for the sandbox worker.
 */
const buildMcpConfig = (config: McpIntegrationConfig): SandboxMcpConfig => {
  return {
    serverUrl: config.serverUrl,
    transport: config.transport,
    authStrategy: config.auth.strategy,
    apiKey: config.auth.apiKey,
  };
};

/**
 * Converts GraphQLIntegrationConfig to SandboxGraphQLConfig for the sandbox worker.
 */
const buildGraphQLConfig = (
  config: GraphQLIntegrationConfig,
  opts: { accessToken?: string }
): SandboxGraphQLConfig => {
  const authHeaders = buildAuthHeadersFromBlock(config.auth, opts.accessToken);
  return {
    endpoint: config.endpoint,
    authHeaders,
    schema: config.schema,
    schemaFetchedAt: config.schemaFetchedAt,
  };
};

/**
 * Converts OpenAPIIntegrationConfig to SandboxOpenAPIConfig for the sandbox worker.
 */
const buildOpenAPIConfig = (
  config: OpenAPIIntegrationConfig,
  opts: { accessToken?: string }
): SandboxOpenAPIConfig => {
  const authHeaders = buildAuthHeadersFromBlock(config.auth, opts.accessToken);
  return {
    baseUrl: config.baseUrl,
    authHeaders,
    spec: config.spec,
    specVersion: config.specVersion,
    specFetchedAt: config.specFetchedAt,
  };
};

// ============================================================================
// Credential Resolution
// ============================================================================

/**
 * Resolves viewer credentials for an integration.
 * Throws IntegrationAuthRequiredError if credentials are needed but not available.
 */
const resolveViewerCredentials = async (params: {
  integrationId: string;
  integrationName: string;
  provider: IntegrationProvider;
  authStrategy: AuthStrategy;
  oauthConfig?: OAuthConfig;
  metadata?: Record<string, unknown>;
  connectedAccount?: ConnectedAccountWithCredentials;
  viewerId: string;
  organizationId: string;
}): Promise<{ accessToken?: string; account?: ConnectedAccountWithCredentials }> => {
  const requirement = getViewerCredentialRequirement(params.authStrategy);

  if (requirement.type === "none") {
    return {};
  }

  const { connectedAccount } = params;

  if (requirement.type === "oauth") {
    if (!connectedAccount) {
      if (!params.oauthConfig) {
        throw new Error(
          `Integration ${params.integrationName} is configured for ${params.authStrategy.type} but missing OAuth configuration`
        );
      }

      const auth = await generateAuthorizationUrl({
        integrationId: params.integrationId,
        organizationId: params.organizationId,
        viewerId: params.viewerId,
      });

      throw new IntegrationAuthRequiredError({
        viewerId: params.viewerId,
        requirements: [
          {
            integrationId: params.integrationId,
            integrationName: params.integrationName,
            provider: params.provider,
            authorizationUrl: auth.url,
            state: auth.state,
          },
        ],
      });
    }

    return {
      accessToken: connectedAccount.credentials.accessToken,
      account: connectedAccount,
    };
  }

  if (requirement.type === "pat") {
    if (!connectedAccount) {
      const patLink = await generatePatLinkUrl({
        integrationId: params.integrationId,
        viewerId: params.viewerId,
        organizationId: params.organizationId,
      });

      throw new IntegrationAuthRequiredError({
        viewerId: params.viewerId,
        requirements: [
          {
            integrationId: params.integrationId,
            integrationName: params.integrationName,
            provider: params.provider,
            authorizationUrl: patLink.url,
            state: "",
            patLinkUrl: patLink.url,
            authInstructions: params.metadata?.authInstructions as string | undefined,
          },
        ],
      });
    }

    return {
      accessToken: connectedAccount.credentials.accessToken,
      account: connectedAccount,
    };
  }

  return {};
};

// ============================================================================
// Integration Building
// ============================================================================

export type BuildSandboxIntegrationsParams = {
  integrationIds: string[];
  organizationId: string;
  viewerId: string;
};

/**
 * Builds sandbox integration definitions for a list of integration IDs.
 * Resolves credentials for the viewer and builds protocol-specific configs.
 *
 * @throws IntegrationAuthRequiredError if viewer credentials are needed but not available
 */
export const buildSandboxIntegrations = async (
  params: BuildSandboxIntegrationsParams
): Promise<SandboxIntegrationDefinition[]> => {
  const { integrationIds, organizationId, viewerId } = params;

  logger.info(`[buildSandboxIntegrations] Starting with ${integrationIds.length} integrations`);
  logger.info(`[buildSandboxIntegrations] viewerId: ${viewerId}, orgId: ${organizationId}`);

  if (integrationIds.length === 0) {
    return [];
  }

  const connectedAccountsMap = await getConnectedAccountsByViewer(viewerId, organizationId);

  const integrations: SandboxIntegrationDefinition[] = [];

  for (const integrationId of integrationIds) {
    const integration = await getIntegration(integrationId, organizationId);
    if (!integration || !integration.enabled) {
      throw new Error(`Integration ${integrationId} is not available`);
    }

    const sandboxIntegration = await buildSingleSandboxIntegration({
      integration,
      organizationId,
      viewerId,
      connectedAccount: connectedAccountsMap.get(integrationId),
    });

    integrations.push(sandboxIntegration);
  }

  return integrations;
};

export type BuildSingleSandboxIntegrationParams = {
  integration: IntegrationWithConfig;
  organizationId: string;
  viewerId: string;
  /** Pre-fetched connected account, if available */
  connectedAccount?: ConnectedAccountWithCredentials;
  /** Override the integration name in sandbox (used by tests) */
  nameOverride?: string;
};

/**
 * Builds a single sandbox integration definition.
 * This is the core function that both buildSandboxIntegrations and test executor use.
 *
 * @throws IntegrationAuthRequiredError if viewer credentials are needed but not available
 */
export const buildSingleSandboxIntegration = async (
  params: BuildSingleSandboxIntegrationParams
): Promise<SandboxIntegrationDefinition> => {
  const { integration, organizationId, viewerId, nameOverride } = params;
  let { connectedAccount } = params;

  const provider = integration.provider as IntegrationProvider;
  const authConfig = integration.authConfig;
  const integrationName = nameOverride ?? integration.name;

  // If no connected account was provided, fetch it
  if (connectedAccount === undefined) {
    connectedAccount = await getConnectedAccountByViewer(viewerId, integration.id, organizationId) ?? undefined;
  }

  // Handle MCP integrations
  if (authConfig.type === "mcp") {
    const { accessToken, account } = await resolveViewerCredentials({
      integrationId: integration.id,
      integrationName: integration.name,
      provider,
      authStrategy: authConfig.auth.strategy,
      oauthConfig: authConfig.auth.oauthConfig,
      metadata: authConfig.metadata,
      connectedAccount,
      viewerId,
      organizationId,
    });

    const mcpConfig = buildMcpConfig(authConfig);
    if (authConfig.auth.strategy.type === "bearer_oauth") {
      mcpConfig.accessToken = accessToken;
    } else if (authConfig.auth.strategy.type === "api_key" && authConfig.auth.strategy.viewerScoped) {
      mcpConfig.apiKey = accessToken;
    }

    return {
      id: integration.id,
      provider,
      name: integrationName,
      authConfig: authConfig as unknown as Record<string, unknown>,
      mcpConfig,
      ...(account && {
        account: {
          id: account.id,
          viewerId: account.viewerId,
          accountIdentifier: account.accountIdentifier,
          credentials: account.credentials,
        },
      }),
    };
  }

  // Handle GraphQL integrations
  if (authConfig.type === "graphql") {
    const { accessToken, account } = await resolveViewerCredentials({
      integrationId: integration.id,
      integrationName: integration.name,
      provider,
      authStrategy: authConfig.auth.strategy,
      oauthConfig: authConfig.auth.oauthConfig,
      metadata: authConfig.metadata,
      connectedAccount,
      viewerId,
      organizationId,
    });

    const graphqlConfig = buildGraphQLConfig(authConfig, { accessToken });

    return {
      id: integration.id,
      provider,
      name: integrationName,
      authConfig: authConfig as unknown as Record<string, unknown>,
      graphqlConfig,
      ...(account && {
        account: {
          id: account.id,
          viewerId: account.viewerId,
          accountIdentifier: account.accountIdentifier,
          credentials: account.credentials,
        },
      }),
    };
  }

  // Handle OpenAPI integrations
  if (authConfig.type === "openapi") {
    const { accessToken, account } = await resolveViewerCredentials({
      integrationId: integration.id,
      integrationName: integration.name,
      provider,
      authStrategy: authConfig.auth.strategy,
      oauthConfig: authConfig.auth.oauthConfig,
      metadata: authConfig.metadata,
      connectedAccount,
      viewerId,
      organizationId,
    });

    const openapiConfig = buildOpenAPIConfig(authConfig, { accessToken });

    return {
      id: integration.id,
      provider,
      name: integrationName,
      authConfig: authConfig as unknown as Record<string, unknown>,
      openapiConfig,
      ...(account && {
        account: {
          id: account.id,
          viewerId: account.viewerId,
          accountIdentifier: account.accountIdentifier,
          credentials: account.credentials,
        },
      }),
    };
  }

  // Handle OAuth2 integrations (legacy)
  if (authConfig.type === "oauth2") {
    // OAuth2 integrations always require viewer-scoped credentials
    if (!connectedAccount) {
      const auth = await generateAuthorizationUrl({
        integrationId: integration.id,
        organizationId,
        viewerId,
      });

      throw new IntegrationAuthRequiredError({
        viewerId,
        requirements: [
          {
            integrationId: integration.id,
            integrationName: integration.name,
            provider,
            authorizationUrl: auth.url,
            state: auth.state,
          },
        ],
      });
    }

    return {
      id: integration.id,
      provider,
      name: integrationName,
      authConfig: authConfig as unknown as Record<string, unknown>,
      account: {
        id: connectedAccount.id,
        viewerId: connectedAccount.viewerId,
        accountIdentifier: connectedAccount.accountIdentifier,
        credentials: connectedAccount.credentials,
      },
    };
  }

  // Fallback - no viewer-scoped credentials needed
  return {
    id: integration.id,
    provider,
    name: integrationName,
    authConfig: authConfig as unknown as Record<string, unknown>,
  };
};

// ============================================================================
// Sandbox Execution
// ============================================================================

export type ExecuteSandboxCodeParams = {
  code: string;
  integrations: SandboxIntegrationDefinition[];
  inputs?: Record<string, unknown>;
  timeoutMs?: number;
  runId?: string;
};

/**
 * Execute TypeScript code in the sandbox.
 */
export const executeSandboxCode = async (
  params: ExecuteSandboxCodeParams
): Promise<SandboxExecutionResult> => {
  const { code, integrations, inputs = {}, timeoutMs, runId } = params;

  const config = await getConfig();
  const sandboxUrl = config.internalSandboxUrl || "http://sandbox.subroutine.internal";

  try {
    const response = await fetch(`${sandboxUrl}/test/executeTypescript`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        inputs,
        integrations,
        timeoutMs,
        runId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Sandbox execution failed: ${response.status} - ${errorText}`,
      };
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Build sandbox integration for a single integration by ID.
 * Convenience function that loads the integration and builds the sandbox config.
 *
 * @throws IntegrationAuthRequiredError if viewer credentials are needed but not available
 */
export const buildSandboxIntegrationById = async (params: {
  integrationId: string;
  organizationId: string;
  viewerId: string;
  nameOverride?: string;
}): Promise<SandboxIntegrationDefinition> => {
  const { integrationId, organizationId, viewerId, nameOverride } = params;

  const integration = await getIntegrationOrGlobal(integrationId, organizationId);
  if (!integration) {
    throw new Error(`Integration not found: ${integrationId}`);
  }

  return buildSingleSandboxIntegration({
    integration,
    organizationId,
    viewerId,
    nameOverride,
  });
};
