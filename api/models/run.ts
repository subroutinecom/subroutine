import { nanoid } from "nanoid";
import { getConfig } from "../config/loader.ts";
import { db } from "../db/index.ts";
import {
  buildSandboxIntegrations,
  type SandboxIntegrationDefinition,
} from "../services/sandbox.ts";
import { getLogger } from "../utils/logger.ts";
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
