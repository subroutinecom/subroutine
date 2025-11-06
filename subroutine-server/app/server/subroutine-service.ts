import { nanoid } from "nanoid";

export type Subroutine = {
  id: string;
  source: string;
  inputsSchema?: Record<string, any>;
  outputsSchema?: Record<string, any>;
  createdFrom: {
    request: string;
  };
  createdAt: string;
};

export type Run = {
  id: string;
  subroutineId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt?: string | null;
  endedAt?: string | null;
  outputs?: Record<string, any> | null;
  error?: Record<string, any> | null;
};

export type GenerateSubroutineRequest = {
  request: string;
};

export type RunSubroutineRequest = {
  subroutineId: string;
  inputs?: Record<string, any>;
  timeoutMs?: number;
};

// TODO: move these to redis
const subroutines: Map<string, Subroutine> = new Map();
const runs: Map<string, Run> = new Map();

function generateMockCode(request: string): string {
  return `// Generated from: ${request}
export async function main(ctx: any, inputs: any) {
  return { message: "Hello World!" };
}`;
}

export const generateSubroutine = (
  params: GenerateSubroutineRequest,
): Subroutine => {
  const subroutineId = nanoid();
  const source = generateMockCode(params.request);

  const subroutine: Subroutine = {
    id: subroutineId,
    source,
    inputsSchema: {},
    outputsSchema: {},
    createdFrom: {
      request: params.request,
    },
    createdAt: new Date().toISOString(),
  };

  subroutines.set(subroutineId, subroutine);
  return subroutine;
};

export const getSubroutine = (id: string): Subroutine | undefined => {
  return subroutines.get(id);
};

export const listSubroutines = (): Subroutine[] => {
  return Array.from(subroutines.values());
};

export const runSubroutine = (params: RunSubroutineRequest): Run => {
  const subroutine = getSubroutine(params.subroutineId);
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

  runs.set(runId, run);

  // Simulate async execution - mock always succeeds with hello world
  setTimeout(() => {
    const currentRun = runs.get(runId);
    if (currentRun) {
      currentRun.status = "running";
      currentRun.startedAt = new Date().toISOString();

      setTimeout(() => {
        currentRun.status = "succeeded";
        currentRun.endedAt = new Date().toISOString();
        currentRun.outputs = { message: "Hello World!" };
      }, 100);
    }
  }, 10);

  return run;
};

export const getRun = (id: string): Run | undefined => {
  return runs.get(id);
};

export const listRuns = (): Run[] => {
  return Array.from(runs.values());
};
