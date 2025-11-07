import { nanoid } from "nanoid";
import { db } from "../db/index";
import { getSubroutine } from "./subroutine";

export type Run = {
  id: string;
  subroutineId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt?: string | null;
  endedAt?: string | null;
  outputs?: Record<string, any> | null;
  error?: Record<string, any> | null;
};

export type RunSubroutineRequest = {
  subroutineId: string;
  inputs?: Record<string, any>;
  timeoutMs?: number;
};

export const runSubroutine = async (
  params: RunSubroutineRequest,
): Promise<Run> => {
  const subroutine = await getSubroutine(params.subroutineId);
  if (!subroutine) {
    throw new Error("Subroutine not found");
  }

  const runId = nanoid();
  const run: Run = {
    id: runId,
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
      status: "queued",
      started_at: null,
      ended_at: null,
      outputs: null,
      error: null,
    })
    .execute();

  // runs it async, dont await
  executeInSandbox(runId, subroutine.source, params.inputs);

  return run;
};

const executeInSandbox = async (
  runId: string,
  sourceCode: string,
  inputs?: Record<string, any>,
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

    const sandboxUrl = "http://sandbox:3000/test/executeTypescript";
    const response = await fetch(sandboxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: codeToExecute }),
    });

    const sandboxResult = (await response.json()) as {
      success?: boolean;
      result?: Record<string, any>;
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

export const getRun = async (id: string): Promise<Run | undefined> => {
  const row = await db
    .selectFrom("run")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    subroutineId: row.subroutine_id,
    status: row.status as "queued" | "running" | "succeeded" | "failed",
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    outputs: row.outputs ? JSON.parse(row.outputs) : null,
    error: row.error ? JSON.parse(row.error) : null,
  };
};

export const listRuns = async (): Promise<Run[]> => {
  const results = await db.selectFrom("run").selectAll().execute();

  return results.map((row) => ({
    id: row.id,
    subroutineId: row.subroutine_id,
    status: row.status as "queued" | "running" | "succeeded" | "failed",
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    outputs: row.outputs ? JSON.parse(row.outputs) : null,
    error: row.error ? JSON.parse(row.error) : null,
  }));
};
