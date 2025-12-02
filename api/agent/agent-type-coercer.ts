import type { JSONSchema7, LanguageModel, Schema } from "ai";
import { jsonSchema, streamObject, zodSchema } from "ai";
import type { z } from "zod";
import { createModel } from "./providers.ts";
import { Capability } from "./types.ts";

type SchemaType<S extends z.ZodTypeAny | string> = S extends z.ZodType<infer Out> ? Out : unknown;

export type TypeCoercerParams<S extends z.ZodTypeAny | string> = {
  input: unknown;
  schema: S;
  model?: LanguageModel | null;
  instructions?: string;
  mode?: "auto" | "json" | "tool";
};

export type TypeCoercerResult<S extends z.ZodTypeAny | string> =
  | { success: true; value: SchemaType<S>; rawText: string }
  | { success: false; error: string };

const TYPE_COERCER_SYSTEM_PROMPT = `
You are a strict type coercion agent.
Given arbitrary input, produce an object that conforms to the provided JSON schema.
If coercion is impossible, explain briefly why. Do not invent additional fields.`;

const parseJsonSchema = (schemaText: string): JSONSchema7 => {
  const parsed = JSON.parse(schemaText) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provided JSON schema text is not an object");
  }
  return parsed as JSONSchema7;
};

const materializeSchema = <S extends z.ZodTypeAny | string>(schema: S): Schema<SchemaType<S>> => {
  if (typeof schema === "string") {
    const parsed = parseJsonSchema(schema);
    return jsonSchema<SchemaType<S>>(parsed);
  }

  return zodSchema(schema);
};

const collectTextStream = async (stream: AsyncIterable<string>): Promise<string> => {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
};

const buildPrompt = (input: unknown, instructions?: string): string => {
  const serializedInput = JSON.stringify(input, null, 2);
  const guidance = instructions ?? "Return only the coerced object; avoid extra commentary.";

  return `${guidance}

Input data (JSON):
${serializedInput ?? "null"}`;
};

export const coerceToSchema = async <S extends z.ZodTypeAny | string>(
  params: TypeCoercerParams<S>
): Promise<TypeCoercerResult<S>> => {
  const model = params.model ?? (await createModel(Capability.GENERAL));

  if (!model) {
    return { success: false, error: "No language model configured or available" };
  }

  let schemaForModel: Schema<SchemaType<S>>;
  try {
    schemaForModel = materializeSchema(params.schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid schema provided";
    return { success: false, error: message };
  }

  const prompt = buildPrompt(params.input, params.instructions);

  try {
    const stream = await streamObject<Schema<SchemaType<S>>, "object", SchemaType<S>>({
      model,
      schema: schemaForModel,
      mode: params.mode,
      output: "object",
      system: TYPE_COERCER_SYSTEM_PROMPT.trim(),
      prompt,
    });

    const [value, rawText] = await Promise.all([
      stream.object,
      collectTextStream(stream.textStream),
    ]);

    return {
      success: true,
      value,
      rawText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to coerce input to schema";
    return { success: false, error: message };
  }
};
