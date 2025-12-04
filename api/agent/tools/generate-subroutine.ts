import { z } from "zod";
import { validateCode } from "../validation";
import type { McpContext, SubroutineCapture } from "../utils/types";
import type { McpIntegrationInfo } from "../prompts/index";
import { getAvailableIntegrations } from "../../models/integration";

type GenerateSubroutineOptions = {
  needsImmediateInputs?: boolean;
  mcpContext?: McpContext;
  // specific integrations to use - this is for provided mode, not discovery mode
  mcpIntegrations?: McpIntegrationInfo[];
};

const buildValidationContext = async (options?: GenerateSubroutineOptions) => {
  if (options?.mcpIntegrations?.length) {
    return { mcpIntegrationNames: options.mcpIntegrations.map((i) => i.name) };
  }

  if (options?.mcpContext) {
    const integrations = await getAvailableIntegrations(options.mcpContext.organizationId, "all");
    const mcpIntegrations = integrations.filter((i) => i.enabled && i.authConfig.type === "mcp");
    if (mcpIntegrations.length > 0) {
      return { mcpIntegrationNames: mcpIntegrations.map((i) => i.name) };
    }
  }

  return undefined;
};

export const createGenerateSubroutineTool = (
  onCapture: (result: SubroutineCapture) => void,
  options?: GenerateSubroutineOptions
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

      const validationContext = await buildValidationContext(options);
      const validation = await validateCode(code, validationContext);

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
