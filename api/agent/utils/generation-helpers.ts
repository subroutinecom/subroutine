import type { McpContext, SubroutineCapture } from "./types";
import type { McpIntegrationInfo } from "../prompts/index.ts";
import { IntegrationAuthRequiredError, type AuthRequirement } from "../../models/errors";
import {
  createGenerateSubroutineTool,
  createListMcpToolsProvided,
  createListMcpToolsDiscovery,
  createGetOrganizationIntegrations,
  createGetGlobalIntegrations,
  createManageMcpIntegration,
} from "../tools/index.ts";

export type ToolCreationOptions = {
  mcpContext?: McpContext;
  mcpIntegrations?: McpIntegrationInfo[];
  needsImmediateInputs?: boolean;
};

export const createAgentTools = (
  onCapture: (result: SubroutineCapture) => void,
  capturedAuthRequirements: AuthRequirement[],
  usedIntegrationIds: Set<string>,
  options: ToolCreationOptions
) => {
  const tools: Record<string, unknown> = {
    generateSubroutine: createGenerateSubroutineTool(onCapture, {
      needsImmediateInputs: options.needsImmediateInputs,
    }),
  };

  if (options.mcpContext) {
    const mcpContext = options.mcpContext;
    const hasProvidedIntegrations = options.mcpIntegrations && options.mcpIntegrations.length > 0;

    if (hasProvidedIntegrations) {
      tools.listMcpTools = createListMcpToolsProvided(
        mcpContext,
        capturedAuthRequirements,
        usedIntegrationIds
      );
    } else {
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

  return tools;
};

export const logGenerationSteps = (steps: any[]) => {
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
};

export const checkAuthRequirements = (
  capturedResult: SubroutineCapture | null,
  capturedAuthRequirements: AuthRequirement[],
  viewerId: string
) => {
  // If no code generated, strictly enforce any captured requirements
  if (capturedResult === null) {
    if (capturedAuthRequirements.length > 0) {
      console.log(
        `[generateCode] No code generated and auth required. Throwing auth error for: ${capturedAuthRequirements.map((r) => r.integrationName).join(", ")}`
      );
      throw new IntegrationAuthRequiredError({
        viewerId,
        requirements: capturedAuthRequirements,
      });
    }
    return;
  }

  // If code generated, only enforce requirements for integrations actually used in the code
  const { code } = capturedResult;
  if (capturedAuthRequirements.length > 0) {
    const relevantAuthRequirements = capturedAuthRequirements.filter((req) => {
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
        viewerId,
        requirements: relevantAuthRequirements,
      });
    } else {
      console.log(
        `[generateCode] Auth requirements captured but not used in code, ignoring: ${capturedAuthRequirements.map((r) => r.integrationName).join(", ")}`
      );
    }
  }
};

export const determineUsedIntegrations = (
  code: string,
  usedIntegrationIds: Set<string>,
  mcpContext?: McpContext
) => {
  console.log(
    `[generateCode] Used integration IDs (from tools): ${Array.from(usedIntegrationIds).join(", ") || "none"}`
  );

  // Filter usedIntegrationIds to only include integrations actually referenced in the code
  const actuallyUsedIds = new Set<string>();
  for (const [name, id] of mcpContext?.integrationNameToId ?? new Map()) {
    if (code.includes(`getMcpClient("${name}")`) || code.includes(`getMcpClient('${name}')`)) {
      actuallyUsedIds.add(id);
      console.log(`[generateCode] Integration "${name}" (${id}) is used in generated code`);
    }
  }

  // Only use the filtered set if we found any matches (fallback to original if parsing fails)
  const finalUsedIds =
    actuallyUsedIds.size > 0 ? Array.from(actuallyUsedIds) : Array.from(usedIntegrationIds);
  console.log(`[generateCode] Final used integration IDs: ${finalUsedIds.join(", ") || "none"}`);

  return finalUsedIds;
};
