/// <reference lib="deno.ns" />
import { nanoid } from "nanoid";
import { generateCode, createModel } from "./agent/index";

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
  useMock?: boolean;
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
  // Generate different examples based on the request
  const lowerRequest = request.toLowerCase();

  if (lowerRequest.includes("add") || lowerRequest.includes("sum")) {
    return `// Generated from: ${request}
export async function main(ctx: any, inputs: any) {
  const a = inputs?.a ?? 5;
  const b = inputs?.b ?? 10;
  return { result: a + b, message: \`Added \${a} + \${b} = \${a + b}\` };
}`;
  }

  if (lowerRequest.includes("multiply") || lowerRequest.includes("product")) {
    return `// Generated from: ${request}
export async function main(ctx: any, inputs: any) {
  const a = inputs?.a ?? 6;
  const b = inputs?.b ?? 7;
  return { result: a * b, message: \`Multiplied \${a} * \${b} = \${a * b}\` };
}`;
  }

  if (lowerRequest.includes("fibonacci")) {
    return `// Generated from: ${request}
export async function main(ctx: any, inputs: any) {
  const n = inputs?.n ?? 10;
  const fib = [0, 1];
  for (let i = 2; i < n; i++) {
    fib[i] = fib[i - 1] + fib[i - 2];
  }
  return { sequence: fib, message: \`First \${n} Fibonacci numbers\` };
}`;
  }

  if (lowerRequest.includes("reverse") || lowerRequest.includes("string")) {
    return `// Generated from: ${request}
export async function main(ctx: any, inputs: any) {
  const text = inputs?.text ?? "Hello World";
  const reversed = text.split('').reverse().join('');
  return { original: text, reversed, message: \`Reversed: \${reversed}\` };
}`;
  }

  // Default hello world example with timestamp
  return `// Generated from: ${request}
export async function main(ctx: any, inputs: any) {
  const name = inputs?.name ?? "World";
  const timestamp = new Date().toISOString();
  return {
    message: \`Hello, \${name}!\`,
    timestamp,
    input: inputs
  };
}`;
}

export const generateSubroutine = async (
  params: GenerateSubroutineRequest,
): Promise<Subroutine> => {
  const subroutineId = nanoid();

  let source: string;
  let inputsSchema: Record<string, unknown> = { type: "object", properties: {} };
  let outputsSchema: Record<string, unknown> = { type: "object", properties: {} };

  if (params.useMock) {
    console.log("Using mock code generation (requested via useMock flag)");
    source = generateMockCode(params.request);
  } else {
    const model = createModel();

    if (!model) {
      throw new Error("No model provider configured. Set MODEL_PROVIDER and MODEL_NAME environment variables.");
    }

    const result = await generateCode(model, params.request);

    if (!result.success) {
      throw new Error(`Code generation failed: ${result.error}`);
    }

    source = result.source;
    inputsSchema = result.inputsSchema;
    outputsSchema = result.outputsSchema;
  }

  const subroutine: Subroutine = {
    id: subroutineId,
    source,
    inputsSchema,
    outputsSchema,
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

  // Execute in sandbox asynchronously
  executeInSandbox(runId, subroutine.source, params.inputs);

  return run;
};

async function executeInSandbox(
  runId: string,
  sourceCode: string,
  inputs?: Record<string, any>,
): Promise<void> {
  const run = runs.get(runId);
  if (!run) {
    return;
  }

  try {
    // Update status to running
    run.status = "running";
    run.startedAt = new Date().toISOString();

    // Wrap the user's code in a module that exports a default function
    // The dynamic import will handle TypeScript transpilation automatically
    // Use string concatenation to avoid template literal conflicts with user code
    const codeToExecute =
      sourceCode +
      "\n\n// Export a default function that executes main with the provided inputs\n" +
      "export default async function() {\n" +
      "  const ctx = {};\n" +
      "  const inputs = " + JSON.stringify(inputs ?? {}) + ";\n" +
      "  const result = await main(ctx, inputs);\n" +
      "  return result;\n" +
      "}\n";

    // Call the sandbox API
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

    if (!response.ok) {
      throw new Error(
        `Sandbox returned ${response.status}: ${sandboxResult.error || response.statusText}`,
      );
    }

    if (sandboxResult.success) {
      run.status = "succeeded";
      run.outputs = sandboxResult.result;
    } else {
      run.status = "failed";
      run.error = {
        message: sandboxResult.error || "Unknown error",
        details: sandboxResult,
      };
    }
  } catch (error) {
    run.status = "failed";
    run.error = {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    };
  } finally {
    run.endedAt = new Date().toISOString();
  }
}

export const getRun = (id: string): Run | undefined => {
  return runs.get(id);
};

export const listRuns = (): Run[] => {
  return Array.from(runs.values());
};
