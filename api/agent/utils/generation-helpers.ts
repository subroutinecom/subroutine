import { IntegrationAuthRequiredError, type AuthRequirement } from "../../models/errors.ts";
import { getLogger } from "../../utils/logger.ts";
import type { McpIntegrationInfo } from "../prompts/index.ts";
import {
  createGetGlobalIntegrations,
  createGetOrganizationIntegrations,
} from "../tools/discovery.ts";
import {
  createListMcpToolsDiscovery,
  createListMcpToolsProvided,
} from "../tools/list-mcp-tools.ts";
import { createManageMcpIntegration } from "../tools/manage-integration.ts";
import { createWriteCodeTool } from "../tools/write-code.ts";
import type { McpContext, SubroutineCapture } from "./types.ts";
const logger = getLogger("agent.utils.generation-helpers", "warn");

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
    writeCode: createWriteCodeTool(onCapture, {
      needsImmediateInputs: options.needsImmediateInputs,
      mcpContext: options.mcpContext,
      mcpIntegrations: options.mcpIntegrations,
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
      logger.info(`[generateCode] Discovery mode enabled - adding discovery tools`);
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
  logger.info(`[generateCode] Completed in ${steps.length} step(s)`);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    logger.info(`[generateCode] Step ${i + 1}:`);
    if (step.toolCalls && step.toolCalls.length > 0) {
      for (const tc of step.toolCalls) {
        const args = "args" in tc ? tc.args : {};
        logger.info(`  - Tool call: ${tc.toolName}`);
        logger.info(`    Args: ${JSON.stringify(args, null, 2)}`);
      }
    }
    if (step.toolResults && step.toolResults.length > 0) {
      for (const tr of step.toolResults) {
        logger.info(`  - Tool result: ${tr.toolName}`);
        const resultData = "result" in tr ? tr.result : tr;
        logger.info(`    Result: ${JSON.stringify(resultData, null, 2)}`);
      }
    }
    if (step.text) {
      logger.info(`  - Text response: "${step.text}"`);
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
      logger.info(
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
      logger.info(
        `[generateCode] Auth requirement for "${req.integrationName}" - used in code: ${usesIntegration}`
      );
      return usesIntegration;
    });

    if (relevantAuthRequirements.length > 0) {
      logger.info(
        `[generateCode] Throwing auth error for integrations used in code: ${relevantAuthRequirements.map((r) => r.integrationName).join(", ")}`
      );
      throw new IntegrationAuthRequiredError({
        viewerId,
        requirements: relevantAuthRequirements,
      });
    } else {
      logger.info(
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
  logger.info(
    `[generateCode] Used integration IDs (from tools): ${Array.from(usedIntegrationIds).join(", ") || "none"}`
  );

  // Filter usedIntegrationIds to only include integrations actually referenced in the code
  const actuallyUsedIds = new Set<string>();
  for (const [name, id] of mcpContext?.integrationNameToId ?? new Map()) {
    if (code.includes(`getMcpClient("${name}")`) || code.includes(`getMcpClient('${name}')`)) {
      actuallyUsedIds.add(id);
      logger.info(`[generateCode] Integration "${name}" (${id}) is used in generated code`);
    }
  }

  // Only use the filtered set if we found any matches (fallback to original if parsing fails)
  const finalUsedIds =
    actuallyUsedIds.size > 0 ? Array.from(actuallyUsedIds) : Array.from(usedIntegrationIds);
  logger.info(`[generateCode] Final used integration IDs: ${finalUsedIds.join(", ") || "none"}`);

  return finalUsedIds;
};
