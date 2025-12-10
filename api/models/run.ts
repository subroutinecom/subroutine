import { nanoid } from "nanoid";
import { getConfig } from "../config/loader.ts";
import { db } from "../db/index.ts";
import { getProviderDefinition, type IntegrationProvider } from "../integrations/providers.ts";
import type {
  AuthStrategy,
  SandboxGraphQLConfig,
  SandboxMcpConfig,
  SandboxOpenAPIConfig,
} from "../integrations/providers/types.ts";
import {
  buildAuthHeadersFromBlock,
  getViewerCredentialRequirement,
} from "../integrations/auth-utils.ts";
import { generateAuthorizationUrl } from "../services/oauth.ts";
import { getLogger } from "../utils/logger.ts";
import type {
  ConnectedAccountWithCredentials,
  ConnectedAccountCredentials,
} from "./connected-account.ts";
import { getConnectedAccountsByViewer } from "./connected-account.ts";
import { IntegrationAuthRequiredError } from "./errors.ts";
import type {
  GraphQLIntegrationConfig,
  McpIntegrationConfig,
  OpenAPIIntegrationConfig,
  OAuthConfig,
} from "./integration.ts";
import { getIntegration } from "./integration.ts";
import { generatePatLinkUrl } from "./pat-link.ts";
import { getSubroutine } from "./subroutine.ts";
const logger = getLogger("api/models/run.ts");

export type Run = {
  id: string;
  organizationId: string;
  subroutineId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt?: string | null;
  endedAt?: string | null;
  outputs?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
};

export type RunSubroutineRequest = {
  subroutineId: string;
  organizationId: string;
  viewerId: string;
  inputs?: Record<string, unknown>;
  timeoutMs?: number;
  wait?: boolean;
};

type SandboxIntegrationAccount = {
  id: string;
  viewerId: string;
  accountIdentifier?: string | null;
  credentials: ConnectedAccountCredentials;
};

type SandboxIntegrationDefinition = {
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

/**
 * Converts McpIntegrationConfig to SandboxMcpConfig for the sandbox worker.
 */
const buildMcpConfig = (config: McpIntegrationConfig): SandboxMcpConfig => {
  return {
    serverUrl: config.serverUrl,
    transport: config.transport,
    authStrategy: config.auth.strategy,
    apiKey: config.auth.apiKey,
    // accessToken will be populated from connected account if bearer_oauth
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
// Viewer Credential Resolution (Protocol-Agnostic)
// ============================================================================

/**
 * Resolves viewer credentials for an integration.
 * Throws IntegrationAuthRequiredError if credentials are needed but not available.
 *
 * @returns The access token if credentials were resolved, undefined if not needed.
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

const requiresViewerScopedAccount = (provider: IntegrationProvider): boolean => {
  const definition = getProviderDefinition(provider);
  return Boolean(definition.viewerScoped);
};

export const runSubroutine = async (params: RunSubroutineRequest): Promise<Run> => {
  logger.info(`Starting for subroutine: ${params.subroutineId}`);
  logger.info(`viewerId: ${params.viewerId}, orgId: ${params.organizationId}`);

  const subroutine = await getSubroutine(params.subroutineId, params.organizationId);
  if (!subroutine) {
    throw new Error("Subroutine not found");
  }

  logger.info(
    `[runSubroutine] Subroutine found, integrationIds: ${subroutine.integrationIds.join(", ") || "none"}`
  );

  const runId = nanoid();
  const sandboxIntegrations = await buildSandboxIntegrations({
    integrationIds: subroutine.integrationIds,
    organizationId: params.organizationId,
    viewerId: params.viewerId,
  });

  const run: Run = {
    id: runId,
    organizationId: params.organizationId,
    subroutineId: params.subroutineId,
    status: "queued",
    startedAt: null,
    endedAt: null,
  };

  await db
    .insertInto("run")
    .values({
      id: runId,
      subroutine_id: params.subroutineId,
      organization_id: params.organizationId,
      status: "queued",
      started_at: null,
      ended_at: null,
      outputs: null,
      error: null,
    })
    .execute();

  if (params.wait) {
    await executeInSandbox(
      runId,
      subroutine.source,
      sandboxIntegrations,
      params.inputs,
      params.timeoutMs
    );
    const completedRun = await getRun(runId, params.organizationId);
    if (!completedRun) {
      throw new Error("Run not found after execution");
    }
    return completedRun;
  }

  executeInSandbox(runId, subroutine.source, sandboxIntegrations, params.inputs, params.timeoutMs);
  return run;
};

const buildSandboxIntegrations = async (params: {
  integrationIds: string[];
  organizationId: string;
  viewerId: string;
}): Promise<SandboxIntegrationDefinition[]> => {
  logger.info(
    `[buildSandboxIntegrations] Starting with ${params.integrationIds.length} integrations`
  );
  logger.info(
    `[buildSandboxIntegrations] viewerId: ${params.viewerId}, orgId: ${params.organizationId}`
  );
  logger.info(`integrationIds: ${params.integrationIds.join(", ")}`);

  if (params.integrationIds.length === 0) {
    logger.info(`No integrations to process`);
    return [];
  }

  const connectedAccountsMap = await getConnectedAccountsByViewer(
    params.viewerId,
    params.organizationId
  );

  const integrations: SandboxIntegrationDefinition[] = [];
  for (const integrationId of params.integrationIds) {
    logger.info(`Processing integration: ${integrationId}`);
    const integration = await getIntegration(integrationId, params.organizationId);
    if (!integration || !integration.enabled) {
      logger.info(`Integration ${integrationId} not found or disabled`);
      throw new Error(`Integration ${integrationId} is not available`);
    }

    logger.info(
      `[buildSandboxIntegrations] Found integration: ${integration.name}, provider: ${integration.provider}`
    );
    const provider = integration.provider as IntegrationProvider;
    const authConfig = integration.authConfig;

    // Handle MCP integrations
    if (authConfig.type === "mcp") {
      logger.info(
        `[buildSandboxIntegrations] MCP integration, authStrategy: ${authConfig.auth.strategy.type}`
      );

      // Resolve viewer credentials (throws if auth required but not available)
      const connectedAccount = connectedAccountsMap.get(integrationId);
      const { accessToken, account } = await resolveViewerCredentials({
        integrationId,
        integrationName: integration.name,
        provider,
        authStrategy: authConfig.auth.strategy,
        oauthConfig: authConfig.auth.oauthConfig,
        metadata: authConfig.metadata,
        connectedAccount,
        viewerId: params.viewerId,
        organizationId: params.organizationId,
      });

      // Build MCP config with resolved credentials
      const mcpConfig = buildMcpConfig(authConfig);
      if (authConfig.auth.strategy.type === "bearer_oauth") {
        mcpConfig.accessToken = accessToken;
      } else if (authConfig.auth.strategy.type === "api_key" && authConfig.auth.strategy.viewerScoped) {
        mcpConfig.apiKey = accessToken;
      }

      integrations.push({
        id: integration.id,
        provider,
        name: integration.name,
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
      });
      continue;
    }

    // Handle GraphQL integrations
    if (authConfig.type === "graphql") {
      logger.info(
        `[buildSandboxIntegrations] GraphQL integration, authStrategy: ${authConfig.auth.strategy.type}`
      );

      // Resolve viewer credentials (throws if auth required but not available)
      const connectedAccount = connectedAccountsMap.get(integrationId);
      const { accessToken, account } = await resolveViewerCredentials({
        integrationId,
        integrationName: integration.name,
        provider,
        authStrategy: authConfig.auth.strategy,
        oauthConfig: authConfig.auth.oauthConfig,
        metadata: authConfig.metadata,
        connectedAccount,
        viewerId: params.viewerId,
        organizationId: params.organizationId,
      });

      // Build GraphQL config with resolved credentials
      const graphqlConfig = buildGraphQLConfig(authConfig, { accessToken });

      integrations.push({
        id: integration.id,
        provider,
        name: integration.name,
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
      });
      continue;
    }

    // Handle OpenAPI integrations
    if (authConfig.type === "openapi") {
      logger.info(
        `[buildSandboxIntegrations] OpenAPI integration, authStrategy: ${authConfig.auth.strategy.type}`
      );

      // Resolve viewer credentials (throws if auth required but not available)
      const connectedAccount = connectedAccountsMap.get(integrationId);
      const { accessToken, account } = await resolveViewerCredentials({
        integrationId,
        integrationName: integration.name,
        provider,
        authStrategy: authConfig.auth.strategy,
        oauthConfig: authConfig.auth.oauthConfig,
        metadata: authConfig.metadata,
        connectedAccount,
        viewerId: params.viewerId,
        organizationId: params.organizationId,
      });

      // Build OpenAPI config with resolved credentials
      const openapiConfig = buildOpenAPIConfig(authConfig, { accessToken });

      integrations.push({
        id: integration.id,
        provider,
        name: integration.name,
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
      });
      continue;
    }

    // Handle OAuth2 integrations (existing logic)
    const needsViewer = requiresViewerScopedAccount(provider);

    if (!needsViewer) {
      integrations.push({
        id: integration.id,
        provider,
        name: integration.name,
        authConfig: authConfig as unknown as Record<string, unknown>,
      });
      continue;
    }

    const connectedAccount = connectedAccountsMap.get(integrationId);
    if (!connectedAccount) {
      const auth = await generateAuthorizationUrl({
        integrationId,
        organizationId: params.organizationId,
        viewerId: params.viewerId,
      });

      throw new IntegrationAuthRequiredError({
        viewerId: params.viewerId,
        requirements: [
          {
            integrationId,
            integrationName: integration.name,
            provider,
            authorizationUrl: auth.url,
            state: auth.state,
          },
        ],
      });
    }

    integrations.push({
      id: integration.id,
      provider,
      name: integration.name,
      authConfig: authConfig as unknown as Record<string, unknown>,
      account: {
        id: connectedAccount.id,
        viewerId: connectedAccount.viewerId,
        accountIdentifier: connectedAccount.accountIdentifier,
        credentials: connectedAccount.credentials,
      },
    });
  }

  return integrations;
};

const executeInSandbox = async (
  runId: string,
  sourceCode: string,
  integrations: SandboxIntegrationDefinition[],
  inputs?: Record<string, unknown>,
  timeoutMs?: number
): Promise<void> => {
  const executionStart = Date.now();
  logger.info(
    `[executeInSandbox] Starting execution for run ${runId}, timeoutMs: ${timeoutMs ?? "default"}`
  );

  try {
    const startedAt = new Date().toISOString();

    await db
      .updateTable("run")
      .set({ status: "running", started_at: startedAt })
      .where("id", "=", runId)
      .execute();

    const config = await getConfig();
    const sandboxUrl = `${config.internalSandboxUrl}/test/executeTypescript`;
    logger.info(
      `[executeInSandbox] Sending request to sandbox after ${Date.now() - executionStart}ms`
    );
    const response = await fetch(sandboxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: sourceCode,
        integrations,
        timeoutMs,
        inputs: inputs ?? {},
      }),
    });
    logger.info(
      `[executeInSandbox] Sandbox responded after ${Date.now() - executionStart}ms, status: ${response.status}`
    );

    const sandboxResult = (await response.json()) as {
      success?: boolean;
      result?: Record<string, unknown>;
      error?: string;
    };

    const endedAt = new Date().toISOString();

    if (!response.ok) {
      throw new Error(
        `Sandbox returned ${response.status}: ${sandboxResult.error || response.statusText}`
      );
    }

    if (sandboxResult.success) {
      await db
        .updateTable("run")
        .set({
          status: "succeeded",
          outputs: JSON.stringify(sandboxResult.result),
          ended_at: endedAt,
        })
        .where("id", "=", runId)
        .execute();
    } else {
      await db
        .updateTable("run")
        .set({
          status: "failed",
          error: JSON.stringify({
            message: sandboxResult.error || "Unknown error",
            details: sandboxResult,
          }),
          ended_at: endedAt,
        })
        .where("id", "=", runId)
        .execute();
    }
  } catch (error) {
    const endedAt = new Date().toISOString();
    await db
      .updateTable("run")
      .set({
        status: "failed",
        error: JSON.stringify({
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        }),
        ended_at: endedAt,
      })
      .where("id", "=", runId)
      .execute();
  }
};

export const getRun = async (id: string, organizationId: string): Promise<Run | undefined> => {
  const row = await db
    .selectFrom("run")
    .selectAll()
    .where("id", "=", id)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();

  if (!row) {
    return undefined;
  }

  return mapRowToRun(row);
};

export const listRuns = async (organizationId: string): Promise<Run[]> => {
  const results = await db
    .selectFrom("run")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .orderBy("id", "desc")
    .execute();

  return results.map(mapRowToRun);
};

const mapRowToRun = (row: {
  id: string;
  subroutine_id: string;
  organization_id: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  outputs: string | null;
  error: string | null;
}): Run => ({
  id: row.id,
  organizationId: row.organization_id ?? "",
  subroutineId: row.subroutine_id,
  status: row.status as Run["status"],
  startedAt: row.started_at ?? null,
  endedAt: row.ended_at ?? null,
  outputs: row.outputs ? JSON.parse(row.outputs) : null,
  error: row.error ? JSON.parse(row.error) : null,
});
