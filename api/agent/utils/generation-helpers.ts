import { IntegrationAuthRequiredError, type AuthRequirement } from "../../models/errors.ts";
import { getLogger } from "../../utils/logger.ts";
import type { IntegrationInfo } from "../prompts/index.ts";
import {
  createGetGlobalIntegrations,
  createGetOrganizationIntegrations,
} from "../tools/discovery.ts";
import {
  createInspectIntegrationProvided,
  createInspectIntegrationDiscovery,
} from "../tools/inspect-integration.ts";
import { createManageMcpIntegration } from "../tools/manage-integration.ts";
import { createWriteCodeTool } from "../tools/write-code.ts";
import type { McpContext, SubroutineCapture } from "./types.ts";
const logger = getLogger("api/agent/utils/generation-helpers.ts", "warn");

export type ToolCreationOptions = {
  mcpContext?: McpContext;
  /** Integrations provided to the agent (MCP or GraphQL) */
  integrations?: IntegrationInfo[];
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
      integrations: options.integrations,
    }),
  };

  if (options.mcpContext) {
    const mcpContext = options.mcpContext;
    const hasProvidedIntegrations = options.integrations && options.integrations.length > 0;

    if (hasProvidedIntegrations) {
      // Provided mode: integrations were explicitly passed, use inspectIntegration
      tools.inspectIntegration = createInspectIntegrationProvided(
        mcpContext,
        capturedAuthRequirements,
        usedIntegrationIds
      );
    } else {
      // Discovery mode: agent must discover integrations
      logger.debug(`Discovery mode enabled - adding discovery tools`);
      tools.getOrganizationIntegrations = createGetOrganizationIntegrations(mcpContext);
      tools.getGlobalIntegrations = createGetGlobalIntegrations(mcpContext);
      tools.inspectIntegration = createInspectIntegrationDiscovery(
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
  logger.info(`Completed in ${steps.length} step(s)`);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    logger.debug(`Step ${i + 1}:`);
    if (step.toolCalls && step.toolCalls.length > 0) {
      for (const tc of step.toolCalls) {
        const args = "args" in tc ? tc.args : {};
        logger.debug(`  - Tool call: ${tc.toolName}`);
        logger.debug(`    Args: ${JSON.stringify(args, null, 2)}`);
      }
    }
    if (step.toolResults && step.toolResults.length > 0) {
      for (const tr of step.toolResults) {
        logger.debug(`  - Tool result: ${tr.toolName}`);
        const resultData = "result" in tr ? tr.result : tr;
        logger.debug(`    Result: ${JSON.stringify(resultData, null, 2)}`);
      }
    }
    if (step.text) {
      logger.debug(`  - Text response: "${step.text}"`);
    }
  }
};

/**
 * Checks if code uses a given integration (MCP or GraphQL).
 */
const codeUsesIntegration = (code: string, integrationName: string): boolean => {
  // MCP: getMcpClient("name") or getMcpClient('name')
  const usesMcp =
    code.includes(`getMcpClient("${integrationName}")`) ||
    code.includes(`getMcpClient('${integrationName}')`);

  // GraphQL: import from "subroutine:integration/name" or graphql from integration
  const usesGraphQL =
    code.includes(`subroutine:integration/${integrationName}`) ||
    code.includes(`"${integrationName}"`) && code.includes("graphql");

  return usesMcp || usesGraphQL;
};

export const checkAuthRequirements = (
  capturedResult: SubroutineCapture | null,
  capturedAuthRequirements: AuthRequirement[],
  viewerId: string
) => {
  // If no code generated, strictly enforce any captured requirements
  if (capturedResult === null) {
    if (capturedAuthRequirements.length > 0) {
      logger.warn(
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
      const usesIntegration = codeUsesIntegration(code, req.integrationName);
      logger.debug(
        `[generateCode] Auth requirement for "${req.integrationName}" - used in code: ${usesIntegration}`
      );
      return usesIntegration;
    });

    if (relevantAuthRequirements.length > 0) {
      logger.warn(
        `[generateCode] Throwing auth error for integrations used in code: ${relevantAuthRequirements.map((r) => r.integrationName).join(", ")}`
      );
      throw new IntegrationAuthRequiredError({
        viewerId,
        requirements: relevantAuthRequirements,
      });
    } else {
      logger.debug(
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
  logger.debug(
    `[generateCode] Used integration IDs (from tools): ${Array.from(usedIntegrationIds).join(", ") || "none"}`
  );

  // Filter usedIntegrationIds to only include integrations actually referenced in the code
  const actuallyUsedIds = new Set<string>();
  for (const [name, id] of mcpContext?.integrationNameToId ?? new Map()) {
    if (codeUsesIntegration(code, name)) {
      actuallyUsedIds.add(id);
      logger.debug(`Integration "${name}" (${id}) is used in generated code`);
    }
  }

  // Only use the filtered set if we found any matches (fallback to original if parsing fails)
  const finalUsedIds =
    actuallyUsedIds.size > 0 ? Array.from(actuallyUsedIds) : Array.from(usedIntegrationIds);
  logger.debug(`Final used integration IDs: ${finalUsedIds.join(", ") || "none"}`);

  return finalUsedIds;
};
