import { z } from "@hono/zod-openapi";
import type { LanguageModel, ModelMessage } from "ai";
import { streamText } from "ai";
import { IntegrationAuthRequiredError, type AuthRequirement } from "../models/errors.ts";
import { buildSandboxIntegrations, executeSandboxCode } from "../services/sandbox.ts";
import { getLogger } from "../utils/logger.ts";
import { formatInput } from "./agent-input-formatter.ts";
import {
  CODE_GENERATION_USER_PROMPT,
  IntegrationInfoSchema,
  SYSTEM_PROMPT,
} from "./prompts/index.ts";
import {
  checkAuthRequirements,
  createAgentTools,
  determineUsedIntegrations,
  logGenerationSteps,
} from "./utils/generation-helpers.ts";
import type { CodeGenerationResult, SubroutineCapture } from "./utils/types.ts";
const logger = getLogger("api/agent/agent-code-generator.ts", "info");

const MAX_ITERATIONS = 5;

const TextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ImagePartSchema = z.object({
  type: z.literal("image"),
  image: z.union([
    z.string(),
    z.instanceof(Uint8Array),
    z.instanceof(ArrayBuffer),
    z.instanceof(URL),
  ]),
  mediaType: z.string().optional(),
});

const FilePartSchema = z.object({
  type: z.literal("file"),
  data: z.union([
    z.string(),
    z.instanceof(Uint8Array),
    z.instanceof(ArrayBuffer),
    z.instanceof(URL),
  ]),
  mediaType: z.string(),
  filename: z.string().optional(),
});

const ReasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
});

const ToolCallPartSchema = z.object({
  type: z.literal("tool-call"),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  providerExecuted: z.boolean().optional(),
});

const ToolResultPartSchema = z.object({
  type: z.literal("tool-result"),
  toolCallId: z.string(),
  toolName: z.string(),
  output: z.union([
    z.object({ type: z.literal("text"), value: z.string() }),
    z.object({ type: z.literal("json"), value: z.string() }),
    z.object({ type: z.literal("error-text"), value: z.string() }),
    z.object({ type: z.literal("error-json"), value: z.string() }),
    z.object({
      type: z.literal("content"),
      value: z.array(
        z.union([
          z.object({ type: z.literal("text"), value: z.string() }),
          z.object({ type: z.literal("media"), data: z.string(), mediaType: z.string() }),
        ])
      ),
    }),
  ]),
});

const UserContentSchema = z.union([
  z.string(),
  z.array(z.union([TextPartSchema, ImagePartSchema, FilePartSchema])),
]);

const AssistantContentSchema = z.union([
  z.string(),
  z.array(
    z.union([
      TextPartSchema,
      FilePartSchema,
      ReasoningPartSchema,
      ToolCallPartSchema,
      ToolResultPartSchema,
    ])
  ),
]);

const SystemModelMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});

const UserModelMessageSchema = z.object({
  role: z.literal("user"),
  content: UserContentSchema,
});

const AssistantModelMessageSchema = z.object({
  role: z.literal("assistant"),
  content: AssistantContentSchema,
});

const ToolModelMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.array(ToolResultPartSchema),
});

export const ModelMessageSchema = z.union([
  SystemModelMessageSchema,
  UserModelMessageSchema,
  AssistantModelMessageSchema,
  ToolModelMessageSchema,
]);

export const GenerateCodeOptionsSchema = z.object({
  disableExecution: z.boolean().optional(),
  /** First-party integrations with dedicated libraries (Gmail, Calendar, etc.) */
  firstPartyIntegrations: z.array(z.string()).optional(),
  /** Configurable integrations (MCP servers, GraphQL endpoints, or OpenAPI services) */
  integrations: z.array(IntegrationInfoSchema).optional(),
  /** Context for MCP tool discovery - required if integrations is non-empty */
  mcpContext: z
    .object({
      organizationId: z.string(),
      viewerId: z.string(),
      integrationNameToId: z
        .record(z.string(), z.string())
        .transform((obj) => new Map(Object.entries(obj))),
    })
    .optional(),
  initialMessages: z.array(ModelMessageSchema).optional(),
  runId: z.string().optional(),
});

export type GenerateCodeOptions = z.infer<typeof GenerateCodeOptionsSchema>;

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
    `Options: integrations=${options?.integrations?.length ?? 0}, hasContext=${!!options?.mcpContext}, initialMessages=${options?.initialMessages?.length ?? 0}`
  );

  let streamTextParams: Parameters<typeof streamText>[0] | null = null;

  try {
    let capturedResult: SubroutineCapture | null = null;
    const capturedAuthRequirements: AuthRequirement[] = [];
    const usedIntegrationIds: Set<string> = new Set();
    const capturedSchemas = new Map<string, Record<string, object>>();

    const runId = options?.runId ?? crypto.randomUUID();

    const onCapture = async (result: SubroutineCapture) => {
      // If execution is NOT explicitly disabled, try to execute the code
      if (options?.disableExecution !== true) {
        logger.info(`[generateCode] Executing captured code (runId: ${runId})`);

        logger.warn(`Inputs schema: ${JSON.stringify(result.inputsSchema)} for ${result.code}`);
        // 1. Format inputs
        const inputResult = await formatInput({
          input: request,
          schema: JSON.stringify(result.inputsSchema), // TODO: Fix type
          model, // Reuse the same model
        });
        logger.warn(`Input result: ${JSON.stringify(inputResult)}`);

        if (!inputResult.success) {
          throw new Error(`Failed to format inputs for execution: ${inputResult.error}`);
        }

        // 2. Execute in sandbox
        // 2. Execute in sandbox
        let sandboxIntegrations: Awaited<ReturnType<typeof buildSandboxIntegrations>> = [];

        if (options?.mcpContext) {
          const finalUsedIds = determineUsedIntegrations(
            result.code,
            usedIntegrationIds,
            options.mcpContext
          );

          sandboxIntegrations = await buildSandboxIntegrations({
            integrationIds: finalUsedIds,
            organizationId: options.mcpContext.organizationId,
            viewerId: options.mcpContext.viewerId,
          });

          // Inject captured schemas
          for (const integration of sandboxIntegrations) {
            if (integration.mcpConfig && capturedSchemas.has(integration.name)) {
              integration.mcpConfig.toolSchemas = capturedSchemas.get(integration.name);
            }
          }
        }

        const executionResult = await executeSandboxCode({
          code: result.code,
          integrations: sandboxIntegrations,
          inputs: inputResult.value as Record<string, unknown>,
          runId,
        });

        // Actually, we should probably fetch the integrations if we are in discovery mode or provided mode.
        // `createAgentTools` has some logic for this.

        result.executionResult = executionResult;

        if (!executionResult.success) {
          throw new Error(`Execution failed: ${executionResult.error}`);
        }
      }

      capturedResult = result;
    };

    // 1. Setup Tools
    const tools = createAgentTools(onCapture, capturedAuthRequirements, usedIntegrationIds, {
      mcpContext: options?.mcpContext,
      integrations: options?.integrations,
      disableExecution: options?.disableExecution,
    });

    // Wrap inspectIntegration to capture schemas
    // We do this here instead of inside createAgentTools to avoid cluttering specific tool logic with general agent state
    if (
      tools.inspectIntegration &&
      typeof tools.inspectIntegration === "object" &&
      "execute" in tools.inspectIntegration
    ) {
      const originalExecute = tools.inspectIntegration.execute as (params: {
        integrationName: string;
      }) => Promise<any>;

      // biome-ignore lint/suspicious/noExplicitAny: Dynamic tool wrapping
      (tools.inspectIntegration as any).execute = async (params: { integrationName: string }) => {
        const result = await originalExecute(params);

        if (result.success && result.type === "mcp" && result.tools) {
          const schemaMap: Record<string, object> = {};
          for (const tool of result.tools) {
            if (tool.inputSchema) {
              schemaMap[tool.name] = tool.inputSchema as object;
            }
          }
          capturedSchemas.set(result.integrationName, schemaMap);
          logger.debug(`Captured schemas for integration ${result.integrationName}`);
        }

        return result;
      };
    }

    logger.debug(`Available tools: ${Object.keys(tools).join(", ")}`);

    // 2. Run Agent
    let iters = 0;
    streamTextParams = {
      model,
      system: SYSTEM_PROMPT({
        integrations: options?.firstPartyIntegrations ?? [],
        providedIntegrations: options?.integrations ?? [],
      }),
      messages: [
        ...((options?.initialMessages ?? []) as ModelMessage[]),
        {
          role: "assistant",
          content: CODE_GENERATION_USER_PROMPT(request),
        },
      ],
      toolChoice: "required",
      tools: tools as Parameters<typeof streamText>[0]["tools"],
      stopWhen: () => {
        iters++;
        logger.warn(
          JSON.stringify({
            iters,
            shouldStop: capturedResult !== null || iters >= MAX_ITERATIONS,
          })
        );
        return capturedResult !== null || iters >= MAX_ITERATIONS;
      },
    };

    const result = streamText(streamTextParams);

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
    const { code, inputsSchema, outputsSchema, executionResult } = capturedResult;
    const finalUsedIds = determineUsedIntegrations(code, usedIntegrationIds, options?.mcpContext);

    return {
      success: true,
      source: code,
      inputsSchema,
      outputsSchema,
      iterations: steps.length,
      usedIntegrationIds: finalUsedIds,
      executionResult,
    };
  } catch (error) {
    if (streamTextParams) {
      try {
        logger.info(
          "streamText failed with params:",
          JSON.stringify(
            streamTextParams,
            (key, value) => {
              if (key === "model") return undefined; // Model object might be huge/circular
              return value;
            },
            2
          )
        );
      } catch (logError) {
        logger.error("Failed to log streamText params:", logError);
      }
    }

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
