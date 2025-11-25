import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import type { McpAuthConfig } from "./integration.ts";
import { getIntegration } from "./integration.ts";
import { getSubroutine } from "./subroutine.ts";
import type { ConnectedAccountCredentials } from "./connected-account.ts";
import { getConnectedAccountByAccountIdentifier } from "./connected-account.ts";
import { getProviderDefinition, type IntegrationProvider } from "../integrations/providers.ts";
import { IntegrationAuthRequiredError } from "./errors.ts";
import { generateAuthorizationUrl } from "../services/oauth.ts";
import type { SandboxMcpConfig } from "../integrations/providers/types.ts";

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
};

/**
 * Converts McpAuthConfig to SandboxMcpConfig for the sandbox worker.
 */
const buildMcpConfig = (authConfig: McpAuthConfig): SandboxMcpConfig => {
  return {
    serverUrl: authConfig.serverUrl,
    transport: authConfig.transport,
    authStrategy: authConfig.authStrategy,
    apiKey: authConfig.apiKey,
    // accessToken will be populated from connected account if bearer_passthrough
  };
};

const requiresViewerScopedAccount = (provider: IntegrationProvider): boolean => {
  const definition = getProviderDefinition(provider);
  return Boolean(definition.viewerScoped);
};

export const runSubroutine = async (params: RunSubroutineRequest): Promise<Run> => {
  const subroutine = await getSubroutine(params.subroutineId, params.organizationId);
  if (!subroutine) {
    throw new Error("Subroutine not found");
  }

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
    await executeInSandbox(runId, subroutine.source, sandboxIntegrations, params.inputs);
    const completedRun = await getRun(runId, params.organizationId);
    if (!completedRun) {
      throw new Error("Run not found after execution");
    }
    return completedRun;
  }

  executeInSandbox(runId, subroutine.source, sandboxIntegrations, params.inputs);
  return run;
};

const buildSandboxIntegrations = async (params: {
  integrationIds: string[];
  organizationId: string;
  viewerId: string;
}): Promise<SandboxIntegrationDefinition[]> => {
  if (params.integrationIds.length === 0) {
    return [];
  }

  const integrations: SandboxIntegrationDefinition[] = [];
  for (const integrationId of params.integrationIds) {
    const integration = await getIntegration(integrationId, params.organizationId);
    if (!integration || !integration.enabled) {
      throw new Error(`Integration ${integrationId} is not available`);
    }

    const provider = integration.provider as IntegrationProvider;
    const authConfig = integration.authConfig;

    // Handle MCP integrations
    if (authConfig.type === "mcp") {
      const mcpConfig = buildMcpConfig(authConfig);

      // For bearer_passthrough, we need the viewer's connected account
      if (authConfig.authStrategy.type === "bearer_passthrough") {
        const connectedAccount = await getConnectedAccountByAccountIdentifier(
          params.organizationId,
          integrationId,
          params.viewerId
        );

        if (!connectedAccount) {
          // MCP with bearer_passthrough requires OAuth config for user authentication
          if (!authConfig.oauthConfig) {
            throw new Error(
              `MCP integration ${integration.name} is configured for bearer_passthrough but missing OAuth configuration`
            );
          }

          // Generate authorization URL and throw proper error so client can redirect
          const auth = await generateAuthorizationUrl({
            integrationId,
            organizationId: params.organizationId,
            viewerId: params.viewerId,
          });

          throw new IntegrationAuthRequiredError({
            integrationId,
            provider,
            authorizationUrl: auth.url,
            state: auth.state,
            viewerId: params.viewerId,
            message: `MCP integration ${integration.name} requires authorization`,
          });
        }

        // Pass the access token to the MCP config
        mcpConfig.accessToken = connectedAccount.credentials.accessToken;

        integrations.push({
          id: integration.id,
          provider,
          name: integration.name,
          authConfig: authConfig as unknown as Record<string, unknown>,
          mcpConfig,
          account: {
            id: connectedAccount.id,
            viewerId: connectedAccount.viewerId,
            accountIdentifier: connectedAccount.accountIdentifier,
            credentials: connectedAccount.credentials,
          },
        });
      } else {
        // Non-viewer-scoped MCP (none, api_key, custom_headers)
        integrations.push({
          id: integration.id,
          provider,
          name: integration.name,
          authConfig: authConfig as unknown as Record<string, unknown>,
          mcpConfig,
        });
      }
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

    const connectedAccount = await getConnectedAccountByAccountIdentifier(
      params.organizationId,
      integrationId,
      params.viewerId
    );

    if (!connectedAccount) {
      const auth = await generateAuthorizationUrl({
        integrationId,
        organizationId: params.organizationId,
        viewerId: params.viewerId,
      });

      throw new IntegrationAuthRequiredError({
        integrationId,
        provider,
        authorizationUrl: auth.url,
        state: auth.state,
        viewerId: params.viewerId,
        message: `Integration ${integration.name} requires authorization`,
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
  inputs?: Record<string, unknown>
): Promise<void> => {
  try {
    const startedAt = new Date().toISOString();

    await db
      .updateTable("run")
      .set({ status: "running", started_at: startedAt })
      .where("id", "=", runId)
      .execute();

    const codeToExecute =
      sourceCode +
      "\n\n// Export a default function that executes main with the provided inputs\n" +
      "export default async function() {\n" +
      "  const ctx = {};\n" +
      "  const inputs = " +
      JSON.stringify(inputs ?? {}) +
      ";\n" +
      "  const result = await main(ctx, inputs);\n" +
      "  return result;\n" +
      "}\n";

    const sandboxUrl = "http://sandbox/test/executeTypescript";
    const response = await fetch(sandboxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: codeToExecute,
        integrations,
      }),
    });

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
