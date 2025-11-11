import { nanoid } from "nanoid";
import { createModel, generateCode } from "../agent/index.ts";
import { db } from "../db/index.ts";
import { generateMockCode } from "../mocks.ts";

export type Subroutine = {
  id: string;
  // TODO: We probably should consider moving this to a blob
  source: string;
  inputsSchema?: Record<string, any>;
  outputsSchema?: Record<string, any>;
  initialInputs?: Record<string, any>;
  createdFrom: {
    request: string;
  };
  createdAt: string;
};

export type GenerateSubroutineRequest = {
  request: string;
  useMock?: boolean;
  needsImmediateInputs?: boolean;
};

export const generateSubroutine = async (params: GenerateSubroutineRequest): Promise<Subroutine> => {
  const subroutineId = nanoid();

  let source: string;
  let inputsSchema: Record<string, unknown> = {
    type: "object",
    properties: {},
  };
  let outputsSchema: Record<string, unknown> = {
    type: "object",
    properties: {},
  };
  let initialInputs: Record<string, unknown> | undefined;

  if (params.useMock) {
    console.log("Using mock code generation (requested via useMock flag)");
    source = generateMockCode(params.request);
    if (params.needsImmediateInputs) {
      initialInputs = {};
    }
  } else {
    console.log("Using model for code generation");
    const model = await createModel();

    if (!model) {
      throw new Error("No model provider configured. Check config.yaml for AI model settings.");
    }

    const result = await generateCode(model, params.request, {
      needsImmediateInputs: params.needsImmediateInputs ?? false,
    });

    if (!result.success) {
      throw new Error(`Code generation failed: ${result.error}`);
    }

    source = result.source;
    inputsSchema = result.inputsSchema;
    outputsSchema = result.outputsSchema;
    initialInputs = result.immediateInputs;
    if (params.needsImmediateInputs && !initialInputs) {
      throw new Error("Generator did not provide immediate inputs for execution");
    }
  }

  const createdAt = new Date().toISOString();

  await db
    .insertInto("subroutine")
    .values({
      id: subroutineId,
      source,
      inputs_schema: JSON.stringify(inputsSchema),
      outputs_schema: JSON.stringify(outputsSchema),
      created_from_request: params.request,
      created_at: createdAt,
    })
    .execute();

  const subroutine: Subroutine = {
    id: subroutineId,
    source,
    inputsSchema,
    outputsSchema,
    initialInputs,
    createdFrom: {
      request: params.request,
    },
    createdAt,
  };

  return subroutine;
};

export const getSubroutine = async (id: string): Promise<Subroutine | undefined> => {
  const row = await db.selectFrom("subroutine").selectAll().where("id", "=", id).executeTakeFirst();

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    source: row.source,
    inputsSchema: row.inputs_schema ? JSON.parse(row.inputs_schema) : undefined,
    outputsSchema: row.outputs_schema ? JSON.parse(row.outputs_schema) : undefined,
    createdFrom: {
      request: row.created_from_request,
    },
    createdAt: row.created_at,
  };
};

export const listSubroutines = async (): Promise<Subroutine[]> => {
  const results = await db.selectFrom("subroutine").selectAll().execute();

  return results.map((row) => ({
    id: row.id,
    source: row.source,
    inputsSchema: row.inputs_schema ? JSON.parse(row.inputs_schema) : undefined,
    outputsSchema: row.outputs_schema ? JSON.parse(row.outputs_schema) : undefined,
    createdFrom: {
      request: row.created_from_request,
    },
    createdAt: row.created_at,
  }));
};
