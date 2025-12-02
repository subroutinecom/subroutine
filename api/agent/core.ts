import type { LanguageModel } from "ai";
import { streamText } from "ai";
import type { CodeGenerationResult, McpContext, SubroutineCapture } from "./types";
import { CODE_GENERATION_USER_PROMPT, SYSTEM_PROMPT, type McpIntegrationInfo } from "./prompts";
import { IntegrationAuthRequiredError, type AuthRequirement } from "../models/errors";
import {
  createGenerateSubroutineTool,
  createListMcpToolsProvided,
  createListMcpToolsDiscovery,
  createGetOrganizationIntegrations,
  createGetGlobalIntegrations,
  createManageMcpIntegration,
} from "./tools";

type GenerateCodeOptions = {
  needsImmediateInputs?: boolean;
  integrations?: string[];
  mcpIntegrations?: McpIntegrationInfo[];
  /** Context for MCP tool discovery - required if mcpIntegrations is non-empty */
  mcpContext?: McpContext;
};

export const generateCode = async (
  model: LanguageModel,
  request: string,
  options?: GenerateCodeOptions
): Promise<CodeGenerationResult> => {
  console.log(
    `[generateCode] Starting with model: ${(model as { modelId?: string }).modelId ?? "unknown"}`
  );
  console.log(`[generateCode] Request: "${request}"`);
  console.log(
    `[generateCode] Options: mcpIntegrations=${options?.mcpIntegrations?.length ?? 0}, hasContext=${!!options?.mcpContext}`
  );

  try {
    let capturedResult: SubroutineCapture | null = null;

    // Track auth requirements captured during listMcpTools calls
    const capturedAuthRequirements: AuthRequirement[] = [];

    // the agent may end up generating/experimenting with a bunch of integrations to fulfill the request.
    // Utlimately, it may not use all of them, and we should track that in case we need some auth for them.
    const usedIntegrationIds: Set<string> = new Set();

    const onCapture = (result: SubroutineCapture) => {
      capturedResult = result;
    };

    // Build the tools object
    const tools: Record<string, unknown> = {
      generateSubroutine: createGenerateSubroutineTool(onCapture, {
        needsImmediateInputs: options?.needsImmediateInputs,
      }),
    };

    if (options?.mcpContext) {
      const mcpContext = options.mcpContext;
      // this basically means we either have predefined set of integrations that the agent is allowed to use,
      // or we are in "discovery mode" where an agent can use whichever integrations the organization has to offer,
      // or just use a subagent to even generate some integrations dynamically as the request comes through.
      const hasProvidedIntegrations = options.mcpIntegrations && options.mcpIntegrations.length > 0;

      // listMcpTools - available when integrations are provided
      if (hasProvidedIntegrations) {
        tools.listMcpTools = createListMcpToolsProvided(
          mcpContext,
          capturedAuthRequirements,
          usedIntegrationIds
        );
      }

      // Discovery mode: no integrations provided, agent must discover what's available
      if (!hasProvidedIntegrations) {
        console.log(`[generateCode] Discovery mode enabled - adding discovery tools`);

        tools.getOrganizationIntegrations = createGetOrganizationIntegrations(mcpContext);
        tools.getGlobalIntegrations = createGetGlobalIntegrations(mcpContext);
        tools.listMcpTools = createListMcpToolsDiscovery(
          mcpContext,
          capturedAuthRequirements,
          usedIntegrationIds
        );
        tools.manageMcpIntegration = createManageMcpIntegration(mcpContext, usedIntegrationIds);
      }
    }

    console.log(`[generateCode] Available tools: ${Object.keys(tools).join(", ")}`);

    const result = streamText({
      model,
      system: SYSTEM_PROMPT({
        integrations: options?.integrations ?? [],
        mcpIntegrations: options?.mcpIntegrations ?? [],
      }),
      prompt: CODE_GENERATION_USER_PROMPT(request, {
        needsImmediateInputs: options?.needsImmediateInputs ?? false,
      }),
      tools: tools as Parameters<typeof streamText>[0]["tools"],
      stopWhen: () => {
        return capturedResult !== null;
      },
    });

    await result.consumeStream();
    const steps = await result.steps;

    console.log(`[generateCode] Completed in ${steps.length} step(s)`);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`[generateCode] Step ${i + 1}:`);
      if (step.toolCalls && step.toolCalls.length > 0) {
        for (const tc of step.toolCalls) {
          const args = "args" in tc ? tc.args : {};
          console.log(`  - Tool call: ${tc.toolName}`);
          console.log(`    Args: ${JSON.stringify(args, null, 2)}`);
        }
      }
      if (step.toolResults && step.toolResults.length > 0) {
        for (const tr of step.toolResults) {
          console.log(`  - Tool result: ${tr.toolName}`);
          const resultData = "result" in tr ? tr.result : tr;
          console.log(`    Result: ${JSON.stringify(resultData, null, 2)}`);
        }
      }
      if (step.text) {
        console.log(`  - Text response: "${step.text}"`);
      }
    }

    if (capturedResult === null) {
      // No code generated - throw any auth errors that might have blocked generation
      if (capturedAuthRequirements.length > 0) {
        console.log(
          `[generateCode] No code generated and auth required. Throwing auth error for: ${capturedAuthRequirements.map((r) => r.integrationName).join(", ")}`
        );
        throw new IntegrationAuthRequiredError({
          viewerId: options?.mcpContext?.viewerId ?? "",
          requirements: capturedAuthRequirements,
        });
      }
      return {
        success: false,
        source: "",
        inputsSchema: { type: "object", properties: {} },
        outputsSchema: { type: "object", properties: {} },
        iterations: steps.length,
        error: "AI did not generate a valid subroutine",
      };
    }

    const { code, inputsSchema, outputsSchema, immediateInputs } =
      capturedResult as SubroutineCapture;

    // Only throw auth requirements for integrations that are ACTUALLY USED in the generated code
    // Check if the code contains getMcpClient("integrationName") for each requirement
    if (capturedAuthRequirements.length > 0) {
      const relevantAuthRequirements = capturedAuthRequirements.filter((req) => {
        // TODO(greg) this will not work for non-mcp stuff right now.
        const usesIntegration =
          code.includes(`getMcpClient("${req.integrationName}")`) ||
          code.includes(`getMcpClient('${req.integrationName}')`);
        console.log(
          `[generateCode] Auth requirement for "${req.integrationName}" - used in code: ${usesIntegration}`
        );
        return usesIntegration;
      });

      if (relevantAuthRequirements.length > 0) {
        console.log(
          `[generateCode] Throwing auth error for integrations used in code: ${relevantAuthRequirements.map((r) => r.integrationName).join(", ")}`
        );
        throw new IntegrationAuthRequiredError({
          viewerId: options?.mcpContext?.viewerId ?? "",
          requirements: relevantAuthRequirements,
        });
      } else {
        console.log(
          `[generateCode] Auth requirements captured but not used in code, ignoring: ${capturedAuthRequirements.map((r) => r.integrationName).join(", ")}`
        );
      }
    }

    console.log(
      `[generateCode] Used integration IDs: ${Array.from(usedIntegrationIds).join(", ") || "none"}`
    );

    // Also filter usedIntegrationIds to only include integrations actually referenced in the code
    const actuallyUsedIds = new Set<string>();
    for (const [name, id] of options?.mcpContext?.integrationNameToId ?? new Map()) {
      if (code.includes(`getMcpClient("${name}")`) || code.includes(`getMcpClient('${name}')`)) {
        actuallyUsedIds.add(id);
        console.log(`[generateCode] Integration "${name}" (${id}) is used in generated code`);
      }
    }
    // Only use the filtered set if we found any matches (fallback to original if parsing fails)
    const finalUsedIds =
      actuallyUsedIds.size > 0 ? Array.from(actuallyUsedIds) : Array.from(usedIntegrationIds);
    console.log(`[generateCode] Final used integration IDs: ${finalUsedIds.join(", ") || "none"}`);

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
    // Re-throw IntegrationAuthRequiredError - it should propagate up
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
