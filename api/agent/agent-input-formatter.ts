import type { JSONSchema7, LanguageModel, Schema } from "ai";
import { jsonSchema, streamObject, zodSchema } from "ai";
import type { z } from "zod";
import { getLogger } from "../utils/logger.ts";
import { createModel } from "./utils/providers.ts";
import { Capability } from "./utils/types.ts";
const logger = getLogger("api/agent/agent-input-formatter.ts");

type SchemaType<S extends z.ZodTypeAny | string> = S extends z.ZodType<infer Out> ? Out : unknown;

export type InputFormatterParams<S extends z.ZodTypeAny | string> = {
  input: unknown;
  schema: S;
  model?: LanguageModel | null;
};

export type InputFormatterResult<S extends z.ZodTypeAny | string> =
  | { success: true; value: SchemaType<S>; rawText: string }
  | { success: false; error: string };

const INPUT_FORMATTER_SYSTEM_PROMPT = `
You are an intelligent input formatter agent.
Your goal is to map the provided input (which may be natural language or unstructured data) into the arguments for a specific function call, defined by the provided JSON schema.
If formatting is impossible, explain briefly why. Do not invent additional fields.

Example:
Input: "add 10 + 5"
Schema: { x: string, y: string }
Output: { x: "10", y: "5" }`;

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

const buildPrompt = (input: unknown): string => {
  const serializedInput = JSON.stringify(input, null, 2);
  const guidance = "Return only the formatted object; avoid extra commentary.";

  return `${guidance}

Input data (User Request / Context):
${serializedInput ?? "null"}`;
};

export const formatInput = async <S extends z.ZodTypeAny | string>(
  params: InputFormatterParams<S>
): Promise<InputFormatterResult<S>> => {
  const model = params.model ?? (await createModel(Capability.CODING_FORMAT_INPUTS));

  if (!model) {
    return { success: false, error: "No language model configured or available" };
  }

  let schemaForModel: Schema<SchemaType<S>>;
  try {
    // logger.debug(`Materializing schema: ${JSON.stringify(params.schema)}`); // Need logger import if I want to log here, or just console.log for debug.
    // The user error "Cannot read properties of undefined (reading 'typeName')" likely comes from zodSchema or jsonSchema internally if something is malformed.
    // Or it comes from `onCapture` passing something weird.
    // Let's add console.log temporarily to debug or use logger if available.
    // The previous file view didn't show logger in `agent-input-formatter.ts`.
    // I'll assume console.log is fine for now as it will show in logs.
    logger.info("Materializing schema:", JSON.stringify(params.schema, null, 2));
    schemaForModel = materializeSchema(params.schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid schema provided";
    return { success: false, error: message };
  }

  const prompt = buildPrompt(params.input);

  try {
    const stream = await streamObject<Schema<SchemaType<S>>, "object", SchemaType<S>>({
      model,
      schema: schemaForModel,
      output: "object",
      system: INPUT_FORMATTER_SYSTEM_PROMPT.trim(),
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
    const message = error instanceof Error ? error.message : "Failed to format input to schema";
    return { success: false, error: message };
  }
};
