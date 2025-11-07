import type { LanguageModel } from "ai";
import { streamText } from "ai";
import { z } from "zod";
import type { CodeGenerationResult } from "./types";
import { CODE_GENERATION_USER_PROMPT, SYSTEM_PROMPT } from "./prompts";

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
): Promise<CodeGenerationResult> => {
  try {
    type CapturedResult = {
      inputsSchema: Record<string, unknown>;
      outputsSchema: Record<string, unknown>;
      code: string;
    };

    let capturedResult: CapturedResult | null = null;

    const result = await streamText({
      model,
      system: SYSTEM_PROMPT,
      prompt: CODE_GENERATION_USER_PROMPT(request),
      tools: {
        generateSubroutine: {
          description: "Submit a generated TypeScript subroutine with schemas",
          inputSchema: z.object({
            inputsSchema: z
              .record(z.unknown())
              .describe("JSON Schema for the input parameters"),
            outputsSchema: z
              .record(z.unknown())
              .describe("JSON Schema for the output"),
            code: z
              .string()
              .describe(
                "The TypeScript code that exports an async main function with proper types",
              ),
          }),
          execute: (params: {
            inputsSchema: Record<string, unknown>;
            outputsSchema: Record<string, unknown>;
            code: string;
          }) => {
            const { inputsSchema, outputsSchema, code } = params;
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

    const { code, inputsSchema, outputsSchema } =
      capturedResult as CapturedResult;

    return {
      success: true,
      source: code,
      inputsSchema,
      outputsSchema,
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
