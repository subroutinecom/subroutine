import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import type { IntegrationAuthConfig } from "./integration.ts";
import { getIntegration } from "./integration.ts";
import { getSubroutine } from "./subroutine.ts";
import type { ConnectedAccountCredentials } from "./connected-account.ts";
import { getConnectedAccountByAccountIdentifier } from "./connected-account.ts";
import type { IntegrationProvider } from "../integrations/providers.ts";
import { IntegrationAuthRequiredError } from "./errors.ts";
import { generateAuthorizationUrl } from "../services/oauth.ts";

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
  userId: string;
  viewerId: string;
  inputs?: Record<string, unknown>;
  timeoutMs?: number;
};

type SandboxIntegrationAccount = {
  id: string;
  userId: string;
  /**
   * Provider-facing identifier (e.g., Gmail email address) captured during OAuth.
   * We store this so we can re-select the correct credentials when a viewer runs
   * the subroutine again, even if the caller uses an opaque viewerId.
   */
  accountIdentifier?: string | null;
  credentials: ConnectedAccountCredentials;
};

type SandboxIntegrationDefinition = {
  id: string;
  provider: IntegrationProvider;
  name: string;
  authConfig: IntegrationAuthConfig;
  account?: SandboxIntegrationAccount;
};

const VIEWER_SCOPED_PROVIDERS = new Set<IntegrationProvider>(["gmail"]);
const requiresViewerScopedAccount = (provider: IntegrationProvider): boolean =>
  VIEWER_SCOPED_PROVIDERS.has(provider);

export const runSubroutine = async (
  params: RunSubroutineRequest,
): Promise<Run> => {
  const subroutine = await getSubroutine(
    params.subroutineId,
    params.organizationId,
  );
  if (!subroutine) {
    throw new Error("Subroutine not found");
  }

  const runId = nanoid();
  const sandboxIntegrations = await buildSandboxIntegrations({
    integrationIds: subroutine.integrationIds,
    organizationId: params.organizationId,
    userId: params.userId,
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

  // runs it async, dont await
  executeInSandbox(runId, subroutine.source, sandboxIntegrations, params.inputs);

  return run;
};

const buildSandboxIntegrations = async (params: {
  integrationIds: string[];
  organizationId: string;
  userId: string;
  viewerId?: string;
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
    const needsViewer = requiresViewerScopedAccount(provider);

    if (!needsViewer) {
      integrations.push({
        id: integration.id,
        provider,
        name: integration.name,
        authConfig: integration.authConfig,
      });
      continue;
    }

    if (!params.viewerId) {
      throw new Error(`viewerId is required to access ${integration.name}`);
    }

    const connectedAccount = await getConnectedAccountByAccountIdentifier(
      params.organizationId,
      integrationId,
      params.viewerId,
    );

    if (!connectedAccount) {
      const auth = await generateAuthorizationUrl({
        integrationId,
        organizationId: params.organizationId,
        userId: params.userId,
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
      authConfig: integration.authConfig,
      account: {
        id: connectedAccount.id,
        userId: connectedAccount.userId,
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
): Promise<void> => {
  try {
    const startedAt = new Date().toISOString();

    await db
      .updateTable("run")
      .set({ status: "running", started_at: startedAt })
      .where("id", "=", runId)
      .execute();

    const codeToExecute = sourceCode +
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
        `Sandbox returned ${response.status}: ${sandboxResult.error || response.statusText}`,
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

export const getRun = async (
  id: string,
  organizationId: string,
): Promise<Run | undefined> => {
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
