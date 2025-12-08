import { z } from "@hono/zod-openapi";
import type { LanguageModel, ModelMessage } from "ai";
import { streamText } from "ai";
import util from "node:util";
import { IntegrationAuthRequiredError, type AuthRequirement } from "../models/errors.ts";
import { getLogger } from "../utils/logger.ts";
import {
  CODE_GENERATION_USER_PROMPT,
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
  needsImmediateInputs: z.boolean().optional(),
  /** First-party integrations with dedicated libraries (Gmail, Calendar, etc.) */
  firstPartyIntegrations: z.array(z.string()).optional(),
  /** Configurable integrations (MCP servers, GraphQL endpoints, or OpenAPI services) */
  integrations: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(["mcp", "graphql", "openapi"]),
      })
    )
    .optional(),
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
          content: CODE_GENERATION_USER_PROMPT(request, {
            needsImmediateInputs: options?.needsImmediateInputs ?? false,
          }),
        },
      ],
      tools: tools as Parameters<typeof streamText>[0]["tools"],
      stopWhen: () => {
        iters++;
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
    logger.warn("========= CAUSE =========");
    if (error instanceof Error && "cause" in error) logger.warn(util.inspect(error.cause));
    logger.warn("========= END CAUSE =========");
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
