import type { LanguageModel } from "ai";
import { streamText } from "ai";
import { z } from "zod";
import type { CodeGenerationResult } from "./types";
import { CODE_GENERATION_USER_PROMPT, SYSTEM_PROMPT } from "./prompts";

type GenerateCodeOptions = {
  needsImmediateInputs?: boolean;
  integrations?: string[];
};

const validateCode = (code: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!code.includes("export")) {
    errors.push("Code must export the main function");
  }

  if (!code.includes("async function main")) {
    errors.push("Code must define an async function named 'main'");
  }

  if (!code.includes("type Context") && !code.includes("interface Context")) {
    errors.push("Code must define a Context type");
  }

  if (!code.includes("type Inputs") && !code.includes("interface Inputs")) {
    errors.push("Code must define an Inputs type");
  }

  if (!code.includes("type Outputs") && !code.includes("interface Outputs")) {
    errors.push("Code must define an Outputs type");
  }

  if (!code.includes("return")) {
    errors.push("Function must have a return statement");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const generateCode = async (
  model: LanguageModel,
  request: string,
  options?: GenerateCodeOptions
): Promise<CodeGenerationResult> => {
  try {
    type CapturedResult = {
      inputsSchema: Record<string, unknown>;
      outputsSchema: Record<string, unknown>;
      code: string;
      immediateInputs?: Record<string, unknown>;
    };

    let capturedResult: CapturedResult | null = null;

    const baseToolSchema = z.object({
      inputsSchema: z.record(z.unknown()).describe("JSON Schema for the input parameters"),
      outputsSchema: z.record(z.unknown()).describe("JSON Schema for the output"),
      code: z
        .string()
        .describe("The TypeScript code that exports an async main function with proper types"),
    });

    const toolSchema = options?.needsImmediateInputs
      ? baseToolSchema.extend({
          immediateInputs: z
            .record(z.unknown())
            .describe("Concrete values conforming to inputsSchema for immediate execution"),
        })
      : baseToolSchema;

    const result = await streamText({
      model,
      system: SYSTEM_PROMPT(options?.integrations ?? []),
      prompt: CODE_GENERATION_USER_PROMPT(request, {
        needsImmediateInputs: options?.needsImmediateInputs ?? false,
      }),
      tools: {
        generateSubroutine: {
          description: "Submit a generated TypeScript subroutine with schemas",
          inputSchema: toolSchema,
          execute: (params: z.infer<typeof toolSchema>) => {
            const { inputsSchema, outputsSchema, code } = params;
            const immediateInputs =
              "immediateInputs" in params
                ? (params.immediateInputs as Record<string, unknown>)
                : undefined;
            const validation = validateCode(code);

            if (!validation.valid) {
              return {
                success: false,
                errors: validation.errors,
              };
            }

            const result: CapturedResult = {
              inputsSchema,
              outputsSchema,
              code,
              immediateInputs,
            };
            capturedResult = result;
            return {
              success: true,
              message: "Subroutine generated successfully",
            };
          },
        },
      },
      stopWhen: () => {
        return capturedResult !== null;
      },
    });

    await result.consumeStream();
    const steps = await result.steps;

    if (capturedResult === null) {
      return {
        success: false,
        source: "",
        inputsSchema: { type: "object", properties: {} },
        outputsSchema: { type: "object", properties: {} },
        iterations: steps.length,
        error: "AI did not generate a valid subroutine",
      };
    }

    const { code, inputsSchema, outputsSchema, immediateInputs } = capturedResult as CapturedResult;

    return {
      success: true,
      source: code,
      inputsSchema,
      outputsSchema,
      immediateInputs,
      iterations: steps.length,
    };
  } catch (error) {
    return {
      success: false,
      source: "",
      inputsSchema: { type: "object", properties: {} },
      outputsSchema: { type: "object", properties: {} },
      iterations: 1,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};
