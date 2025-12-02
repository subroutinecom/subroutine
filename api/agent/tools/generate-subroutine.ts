import { z } from "zod";
import { validateCode } from "../validation";
import type { SubroutineCapture } from "../utils/types";

export const createGenerateSubroutineTool = (
  onCapture: (result: SubroutineCapture) => void,
  options?: { needsImmediateInputs?: boolean }
) => {
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

  return {
    description: "Submit a generated TypeScript subroutine with schemas",
    inputSchema: toolSchema,
    execute: async (params: z.infer<typeof toolSchema>) => {
      console.log(`[tool:generateSubroutine] Called`);
      console.log(`[tool:generateSubroutine] Code length: ${params.code.length} chars`);
      const { inputsSchema, outputsSchema, code } = params;
      const immediateInputs =
        "immediateInputs" in params
          ? (params.immediateInputs as Record<string, unknown>)
          : undefined;
      const validation = await validateCode(code);

      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) =>
          e.line ? `Line ${e.line}: ${e.message}` : e.message
        );
        console.log(`[tool:generateSubroutine] Validation failed:`, errorMessages);
        return {
          success: false,
          errors: errorMessages,
        };
      }

      const result: SubroutineCapture = {
        inputsSchema,
        outputsSchema,
        code,
        immediateInputs,
      };
      onCapture(result);
      console.log(`[tool:generateSubroutine] Success - code captured`);
      return {
        success: true,
        message: "Subroutine generated successfully",
      };
    },
  };
};
