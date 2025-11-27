import type { LanguageModel } from "ai";
import { streamText } from "ai";
import { z } from "zod";
import type { CodeGenerationResult } from "./types";
import { CODE_GENERATION_USER_PROMPT, SYSTEM_PROMPT, type McpIntegrationInfo } from "./prompts";
import { IntegrationAuthRequiredError, type AuthRequirement } from "../models/errors";
import {
  getIntegration,
  getIntegrationByName,
  listIntegrationsByProvider,
  type McpAuthConfig,
} from "../models/integration";
import { getConnectedAccountByViewer } from "../models/connected-account";
import { listMcpTools as listMcpToolsUtil } from "../utils/mcp-client";
import { generateAuthorizationUrl } from "../services/oauth";
import { generatePatLinkUrl } from "../models/pat-link";
import type { IntegrationProvider } from "../integrations/providers";
import { runMcpIntegrator } from "./mcp-integrator";

/**
 * Context for MCP tool discovery during code generation.
 * Provides the information needed to look up integrations and check auth.
 */
export type McpContext = {
  organizationId: string;
  viewerId: string;
  /** Maps integration names to their IDs for quick lookup */
  integrationNameToId: Map<string, string>;
};

type GenerateCodeOptions = {
  needsImmediateInputs?: boolean;
  integrations?: string[];
  mcpIntegrations?: McpIntegrationInfo[];
  /** Context for MCP tool discovery - required if mcpIntegrations is non-empty */
  mcpContext?: McpContext;
};

// TODO(greg) Move validation to be performed a bit smarter (eslint/ast-grep)
const validateCode = (code: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!code.includes("export")) {
    errors.push("Code must export the main function");
  }

  if (!code.includes("async function main")) {
    errors.push("Code must define an async function named 'main'");
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

  if (code.includes("ctx.") || code.includes("ctx,")) {
    errors.push(
      "Code should not use ctx parameter. The main function signature is: main(integrations: Integrations, inputs: Inputs)"
    );
  }

  const integrationsTypeMatch = code.match(/type\s+Integrations\s*=\s*\{([^}]+)\}/);
  if (integrationsTypeMatch) {
    const typeBody = integrationsTypeMatch[1];
    if (!typeBody.includes("getMcpClient")) {
      errors.push(
        "Wrong Integrations type! The Integrations type must have getMcpClient method. " +
          "Correct type: type Integrations = { getMcpClient(name: string): Promise<McpClient>; }; " +
          "DO NOT define integration names as properties."
      );
    }
  }

  const wrongUsagePattern = /integrations\.(?!getMcpClient)[a-zA-Z_][a-zA-Z0-9_]*\s*\./;
  if (wrongUsagePattern.test(code)) {
    errors.push(
      "Wrong integrations usage! Do NOT access integrations like 'integrations.github.method()'. " +
        'The ONLY way to use integrations is: const client = await integrations.getMcpClient("name"); ' +
        'then client.callTool({ name: "tool_name", arguments: {...} });'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Checks if an MCP auth strategy requires viewer-scoped authentication.
 */
const requiresViewerAuth = (config: McpAuthConfig): boolean => {
  if (config.authStrategy.type === "bearer_passthrough") {
    return true;
  }
  if (config.authStrategy.type === "api_key" && config.authStrategy.viewerScoped) {
    return true;
  }
  return false;
};

/**
 * Handles the listMcpTools tool call from the agent.
 * Checks auth and returns tools if authorized, or captures auth requirement.
 */
const handleListMcpTools = async (
  integrationName: string,
  mcpContext: McpContext,
  capturedAuthRequirements: AuthRequirement[]
): Promise<{
  success: boolean;
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  error?: string;
}> => {
  const integrationId = mcpContext.integrationNameToId.get(integrationName);
  if (!integrationId) {
    return {
      success: false,
      error: `Unknown integration: "${integrationName}". Valid integrations are: ${Array.from(mcpContext.integrationNameToId.keys()).join(", ")}`,
    };
  }

  const integration = await getIntegration(integrationId, mcpContext.organizationId);
  if (!integration) {
    return {
      success: false,
      error: `Integration "${integrationName}" not found`,
    };
  }

  if (integration.authConfig.type !== "mcp") {
    return {
      success: false,
      error: `Integration "${integrationName}" is not an MCP integration`,
    };
  }

  const mcpConfig = integration.authConfig;

  // Check if viewer auth is required
  if (requiresViewerAuth(mcpConfig)) {
    const connectedAccount = await getConnectedAccountByViewer(
      mcpContext.viewerId,
      integrationId,
      mcpContext.organizationId
    );

    if (!connectedAccount) {
      // No connected account - capture auth requirement
      if (mcpConfig.authStrategy.type === "bearer_passthrough" && mcpConfig.oauthConfig) {
        const auth = await generateAuthorizationUrl({
          integrationId,
          organizationId: mcpContext.organizationId,
          viewerId: mcpContext.viewerId,
        });

        // Check if we already have this requirement captured
        if (!capturedAuthRequirements.some((r) => r.integrationId === integrationId)) {
          capturedAuthRequirements.push({
            integrationId,
            integrationName: integration.name,
            provider: integration.provider as IntegrationProvider,
            authorizationUrl: auth.url,
            state: auth.state,
          });
        }
      } else if (mcpConfig.authStrategy.type === "api_key" && mcpConfig.authStrategy.viewerScoped) {
        // viewerScoped api_key - generate PAT link
        if (!capturedAuthRequirements.some((r) => r.integrationId === integrationId)) {
          const patLink = await generatePatLinkUrl({
            integrationId,
            viewerId: mcpContext.viewerId,
            organizationId: mcpContext.organizationId,
          });

          const metadata = mcpConfig.metadata || {};

          capturedAuthRequirements.push({
            integrationId,
            integrationName: integration.name,
            provider: integration.provider as IntegrationProvider,
            authorizationUrl: "",
            state: "",
            patLinkUrl: patLink.url,
            authInstructions: metadata.authInstructions as string | undefined,
          });
        }
      }

      return {
        success: false,
        error: `Integration "${integrationName}" requires user authorization. The user will be prompted to authenticate.`,
      };
    }

    // Have connected account - list tools with user's token
    try {
      const tools = await listMcpToolsUtil(mcpConfig, connectedAccount.credentials.accessToken);
      return { success: true, tools };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to list tools from "${integrationName}": ${message}`,
      };
    }
  } else {
    // No viewer auth needed (none, org-level api_key, custom_headers)
    try {
      const tools = await listMcpToolsUtil(mcpConfig);
      return { success: true, tools };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to list tools from "${integrationName}": ${message}`,
      };
    }
  }
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
    type CapturedResult = {
      inputsSchema: Record<string, unknown>;
      outputsSchema: Record<string, unknown>;
      code: string;
      immediateInputs?: Record<string, unknown>;
    };

    let capturedResult: CapturedResult | null = null;

    // Track auth requirements captured during listMcpTools calls
    const capturedAuthRequirements: AuthRequirement[] = [];

    // the agent may end up generating/experimenting with a bunch of integrations to fulfill the request.
    // Utlimately, it may not use all of them, and we should track that in case we need some auth for them.
    const usedIntegrationIds: Set<string> = new Set();

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

    // Build the tools object
    const tools: Record<string, unknown> = {
      generateSubroutine: {
        description: "Submit a generated TypeScript subroutine with schemas",
        inputSchema: toolSchema,
        execute: (params: z.infer<typeof toolSchema>) => {
          console.log(`[tool:generateSubroutine] Called`);
          console.log(`[tool:generateSubroutine] Code length: ${params.code.length} chars`);
          const { inputsSchema, outputsSchema, code } = params;
          const immediateInputs =
            "immediateInputs" in params
              ? (params.immediateInputs as Record<string, unknown>)
              : undefined;
          const validation = validateCode(code);

          if (!validation.valid) {
            console.log(`[tool:generateSubroutine] Validation failed:`, validation.errors);
            return {
              success: false,
              errors: validation.errors,
            };
          }

          const result: CapturedResult = {
            inputsSchema,
            outputsSchema,
            code,
            immediateInputs,
          };
          capturedResult = result;
          console.log(`[tool:generateSubroutine] Success - code captured`);
          return {
            success: true,
            message: "Subroutine generated successfully",
          };
        },
      },
    };

    if (options?.mcpContext) {
      const mcpContext = options.mcpContext;
      // this basically means we either have predefined set of integrations that the agent is allowed to use,
      // or we are in "discovery mode" where an agent can use whichever integrations the organization has to offer,
      // or just use a subagent to even generate some integrations dynamically as the request comes through.
      const hasProvidedIntegrations = options.mcpIntegrations && options.mcpIntegrations.length > 0;

      // listMcpTools - available when integrations are provided
      if (hasProvidedIntegrations) {
        tools.listMcpTools = {
          description:
            "Discover the available tools from an MCP integration. Call this before writing code that uses MCP tools to understand what tools are available and their input schemas.",
          inputSchema: z.object({
            integrationName: z
              .string()
              .describe("The name of the MCP integration to list tools from"),
          }),
          execute: async (params: { integrationName: string }) => {
            console.log(`[tool:listMcpTools] Called for integration: "${params.integrationName}"`);
            const result = await handleListMcpTools(
              params.integrationName,
              mcpContext,
              capturedAuthRequirements
            );
            console.log(
              `[tool:listMcpTools] Result: success=${result.success}, tools=${result.tools?.length ?? 0}`
            );

            if (result.success) {
              const integrationId = mcpContext.integrationNameToId.get(params.integrationName);
              if (integrationId) {
                usedIntegrationIds.add(integrationId);
                console.log(`[tool:listMcpTools] Tracked integration ID: ${integrationId}`);
              }
            }
            return result;
          },
        };
      }

      // Discovery mode: no integrations provided, agent must discover what's available
      if (!hasProvidedIntegrations) {
        console.log(`[generateCode] Discovery mode enabled - adding discovery tools`);
        tools.listAvailableIntegrations = {
          description: `List all MCP integrations configured for this organization.
Call this FIRST when the user's request requires an external service (GitHub, Slack, database, etc.).
This tells you what integrations already exist that you can use.`,
          inputSchema: z.object({}),
          execute: async () => {
            console.log(`[tool:listAvailableIntegrations] Called`);
            const integrations = await listIntegrationsByProvider(mcpContext.organizationId, "mcp");
            const enabled = integrations.filter((i) => i.enabled);
            console.log(
              `[tool:listAvailableIntegrations] Found ${enabled.length} enabled integrations`
            );

            if (enabled.length === 0) {
              return {
                integrations: [],
                message: "No MCP integrations configured. Use manageMcpIntegration to set one up.",
              };
            }

            return {
              integrations: enabled.map((i) => ({
                name: i.name,
                status: i.status,
              })),
              message: `Found ${enabled.length} integration(s). Use listMcpTools to see what tools each provides.`,
            };
          },
        };

        // Also provide listMcpTools in discovery mode (for after they find integrations)
        // TODO(greg) This can probably folded and simplified with the above - I just wanna
        // take a pause and figure out registry path first.
        tools.listMcpTools = {
          description:
            "Discover the available tools from an MCP integration. Call this after listAvailableIntegrations to see what tools an integration provides.",
          inputSchema: z.object({
            integrationName: z
              .string()
              .describe("The name of the MCP integration to list tools from"),
          }),
          execute: async (params: { integrationName: string }) => {
            console.log(
              `[tool:listMcpTools:discovery] Called for integration: "${params.integrationName}"`
            );
            const integration = await getIntegrationByName(
              params.integrationName,
              mcpContext.organizationId
            );
            if (integration) {
              mcpContext.integrationNameToId.set(integration.name, integration.id);
            }
            const result = await handleListMcpTools(
              params.integrationName,
              mcpContext,
              capturedAuthRequirements
            );
            console.log(
              `[tool:listMcpTools:discovery] Result: success=${result.success}, tools=${result.tools?.length ?? 0}`
            );
            // Track successful integration usage
            if (result.success && integration) {
              usedIntegrationIds.add(integration.id);
              console.log(
                `[tool:listMcpTools:discovery] Tracked integration ID: ${integration.id}`
              );
            }
            return result;
          },
        };

        tools.manageMcpIntegration = {
          description: `Set up a NEW MCP integration when none exists for the service you need.
Call this ONLY after listAvailableIntegrations shows the service you need is not configured.

This spawns a specialist agent that will:
1. Search for MCP servers that provide the needed capability
2. Select the best option with simplest authentication
3. Test the connection works
4. Create the integration

The result tells you what authentication the user needs to provide:
- authRequired: "none" → integration ready to use
- authRequired: "api_key" → tell user what credentials they need (see authInstructions)`,
          inputSchema: z.object({
            need: z
              .string()
              .describe(
                "The service or capability needed, e.g. 'github' for repository access, 'slack' for messaging, 'postgres' for database"
              ),
          }),
          execute: async (params: { need: string }) => {
            console.log(`[tool:manageMcpIntegration] Called with need: "${params.need}"`);
            // Check if an integration with this name already exists
            const existing = await getIntegrationByName(params.need, mcpContext.organizationId);

            if (existing && existing.status === "dynamic") {
              console.log(`[tool:manageMcpIntegration] Found existing dynamic integration, fixing`);
              // Fix existing dynamic integration
              const result = await runMcpIntegrator({
                organizationId: mcpContext.organizationId,
                viewerId: mcpContext.viewerId,
                need: params.need,
                existingIntegrationId: existing.id,
              });
              console.log(`[tool:manageMcpIntegration] Fix result:`, JSON.stringify(result));
              // Track the integration ID if successful
              if (result.success && result.integrationId) {
                usedIntegrationIds.add(result.integrationId);
                mcpContext.integrationNameToId.set(
                  result.integrationName || params.need,
                  result.integrationId
                );
                console.log(
                  `[tool:manageMcpIntegration] Tracked fixed integration ID: ${result.integrationId}`
                );
              }
              return result;
            }

            console.log(`[tool:manageMcpIntegration] Creating new integration`);
            // Create new integration
            const result = await runMcpIntegrator({
              organizationId: mcpContext.organizationId,
              viewerId: mcpContext.viewerId,
              need: params.need,
            });
            console.log(`[tool:manageMcpIntegration] Create result:`, JSON.stringify(result));
            // Track the integration ID if successful
            if (result.success && result.integrationId) {
              usedIntegrationIds.add(result.integrationId);
              mcpContext.integrationNameToId.set(
                result.integrationName || params.need,
                result.integrationId
              );
              console.log(
                `[tool:manageMcpIntegration] Tracked new integration ID: ${result.integrationId}`
              );
            }
            return result;
          },
        };
      }
    }

    console.log(`[generateCode] Available tools: ${Object.keys(tools).join(", ")}`);

    const result = await streamText({
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

    const { code, inputsSchema, outputsSchema, immediateInputs } = capturedResult as CapturedResult;

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
