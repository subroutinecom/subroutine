import type { LanguageModel } from "ai";
import { streamText } from "ai";
import { IntegrationAuthRequiredError, type AuthRequirement } from "../models/errors.ts";
import { getLogger } from "../utils/logger.ts";
import {
  CODE_GENERATION_USER_PROMPT,
  SYSTEM_PROMPT,
  type IntegrationInfo,
} from "./prompts/index.ts";
import {
  checkAuthRequirements,
  createAgentTools,
  determineUsedIntegrations,
  logGenerationSteps,
} from "./utils/generation-helpers.ts";
import type { CodeGenerationResult, McpContext, SubroutineCapture } from "./utils/types.ts";
const logger = getLogger("api/agent/agent-code-generator.ts");

const MAX_ITERATIONS = 5;

type GenerateCodeOptions = {
  needsImmediateInputs?: boolean;
  /** First-party integrations with dedicated libraries (Gmail, Calendar, etc.) */
  firstPartyIntegrations?: string[];
  /** Configurable integrations (MCP servers or GraphQL endpoints) */
  integrations?: IntegrationInfo[];
  /** Context for integration discovery - required if integrations is non-empty */
  mcpContext?: McpContext;
};

export const generateCode = async (
  model: LanguageModel,
  request: string,
  options?: GenerateCodeOptions
): Promise<CodeGenerationResult> => {
  logger.info(
    `[generateCode] Starting with model: ${(model as { modelId?: string }).modelId ?? "unknown"}`
  );
  logger.debug(`Request: "${request}"`);
  logger.debug(
    `Options: integrations=${options?.integrations?.length ?? 0}, hasContext=${!!options?.mcpContext}`
  );

  try {
    let capturedResult: SubroutineCapture | null = null;
    const capturedAuthRequirements: AuthRequirement[] = [];
    const usedIntegrationIds: Set<string> = new Set();

    const onCapture = (result: SubroutineCapture) => {
      capturedResult = result;
    };

    // 1. Setup Tools
    const tools = createAgentTools(onCapture, capturedAuthRequirements, usedIntegrationIds, {
      mcpContext: options?.mcpContext,
      integrations: options?.integrations,
      needsImmediateInputs: options?.needsImmediateInputs,
    });

    logger.debug(`Available tools: ${Object.keys(tools).join(", ")}`);

    // 2. Run Agent
    let iters = 0;
    const result = streamText({
      model,
      system: SYSTEM_PROMPT({
        integrations: options?.firstPartyIntegrations ?? [],
        providedIntegrations: options?.integrations ?? [],
      }),
      prompt: CODE_GENERATION_USER_PROMPT(request, {
        needsImmediateInputs: options?.needsImmediateInputs ?? false,
      }),
      tools: tools as Parameters<typeof streamText>[0]["tools"],
      stopWhen: () => {
        iters++;
        return capturedResult !== null || iters >= MAX_ITERATIONS;
      },
    });

    await result.consumeStream();
    const steps = await result.steps;

    // 3. Log Execution
    logGenerationSteps(steps);

    // 4. Check Auth Requirements
    checkAuthRequirements(
      capturedResult,
      capturedAuthRequirements,
      options?.mcpContext?.viewerId ?? ""
    );

    // 5. Handle Failure
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

    // 6. Return Success
    const { code, inputsSchema, outputsSchema, immediateInputs } = capturedResult;
    const finalUsedIds = determineUsedIntegrations(code, usedIntegrationIds, options?.mcpContext);

    return {
      success: true,
      source: code,
      inputsSchema,
      outputsSchema,
      immediateInputs,
      iterations: steps.length,
      usedIntegrationIds: finalUsedIds,
    };
  } catch (error) {
    if (error instanceof IntegrationAuthRequiredError) {
      throw error;
    }
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
