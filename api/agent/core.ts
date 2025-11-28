import type { LanguageModel } from "ai";
import { streamText } from "ai";
import { z } from "zod";
import type { CodeGenerationResult } from "./types";
import { CODE_GENERATION_USER_PROMPT, SYSTEM_PROMPT, type McpIntegrationInfo } from "./prompts";
import { IntegrationAuthRequiredError, type AuthRequirement } from "../models/errors";
import {
  getIntegrationByName,
  getAvailableIntegrations,
  getIntegrationOrGlobal,
  type McpAuthConfig,
} from "../models/integration";
import {
  getConnectedAccountByViewer,
  getConnectedIntegrationIds,
} from "../models/connected-account";
import { listMcpTools as listMcpToolsUtil } from "../utils/mcp-client";
import { generateAuthorizationUrl } from "../services/oauth";
import { generatePatLinkUrl } from "../models/pat-link";
import type { IntegrationProvider } from "../integrations/providers";
import { runMcpIntegrator } from "./mcp-integrator";
import { validateCode } from "./validation";

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

  const integration = await getIntegrationOrGlobal(integrationId, mcpContext.organizationId);
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
            const errorMessages = validation.errors.map((e) =>
              e.line ? `Line ${e.line}: ${e.message}` : e.message
            );
            console.log(`[tool:generateSubroutine] Validation failed:`, errorMessages);
            return {
              success: false,
              errors: errorMessages,
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

        const connectedIntegrationIds = await getConnectedIntegrationIds(
          mcpContext.viewerId,
          mcpContext.organizationId
        );

        const fetchIntegrationsWithStatus = async (
          visibilityFilter: "private" | "global" | "all"
        ) => {
          const integrations = await getAvailableIntegrations(
            mcpContext.organizationId,
            visibilityFilter
          );
          const mcpIntegrations = integrations.filter(
            (i) => i.enabled && i.authConfig.type === "mcp"
          );

          return mcpIntegrations.map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            visibility: i.visibility,
            status: i.status,
            hasConnection: connectedIntegrationIds.has(i.id),
          }));
        };

        tools.getOrganizationIntegrations = {
          description: `STEP 1 (CALL THIS FIRST): List organization-specific MCP integrations.

These are custom integrations configured by the organization - ALWAYS check these first.
If a matching integration exists here, USE IT. Do not check global integrations unless needed.

Only proceed to getGlobalIntegrations if no suitable org-specific integration is found.`,
          inputSchema: z.object({}),
          execute: async () => {
            console.log(`[tool:getOrganizationIntegrations] Called`);
            const integrations = await fetchIntegrationsWithStatus("private");
            console.log(
              `[tool:getOrganizationIntegrations] Found ${integrations.length} org-specific MCP integrations`
            );

            if (integrations.length === 0) {
              return {
                integrations: [],
                count: 0,
                message:
                  "No organization-specific integrations found. Call getGlobalIntegrations to check the first-party registry.",
              };
            }

            return {
              integrations,
              count: integrations.length,
              message: `Found ${integrations.length} organization-specific integration(s). Use one of these if it matches your need. Only call getGlobalIntegrations if none of these work.`,
            };
          },
        };

        tools.getGlobalIntegrations = {
          description: `STEP 2: List global (first-party registry) MCP integrations.

Only call this AFTER checking getOrganizationIntegrations first!

These are pre-configured integrations from the first-party registry with OAuth already set up.
Use one of these if no organization-specific integration exists for your need.

Only use manageMcpIntegration if neither org nor global integrations have what you need.`,
          inputSchema: z.object({}),
          execute: async () => {
            console.log(`[tool:getGlobalIntegrations] Called`);
            const integrations = await fetchIntegrationsWithStatus("global");
            console.log(
              `[tool:getGlobalIntegrations] Found ${integrations.length} global MCP integrations`
            );

            if (integrations.length === 0) {
              return {
                integrations: [],
                count: 0,
                message:
                  "No global integrations available. Use manageMcpIntegration as a LAST RESORT to discover and set one up.",
              };
            }

            return {
              integrations,
              count: integrations.length,
              message: `Found ${integrations.length} global integration(s) from the first-party registry. Use one of these if it matches your need. Only use manageMcpIntegration if none of these work.`,
            };
          },
        };

        tools.listMcpTools = {
          description:
            "Discover the available tools from an MCP integration. Call this after getOrganizationIntegrations or getGlobalIntegrations to see what tools an integration provides. Works with both org-specific and global integrations.",
          inputSchema: z.object({
            integrationName: z
              .string()
              .describe(
                "The name of the MCP integration to list tools from (from listAvailableIntegrations)"
              ),
            integrationId: z
              .string()
              .optional()
              .describe(
                "The ID of the integration (recommended for global integrations to avoid name collisions)"
              ),
          }),
          execute: async (params: { integrationName: string; integrationId?: string }) => {
            console.log(
              `[tool:listMcpTools:discovery] Called for integration: "${params.integrationName}" (id: ${params.integrationId ?? "not provided"})`
            );

            // If integrationId provided, use it directly; otherwise look up by name
            let integration;
            if (params.integrationId) {
              integration = await getIntegrationOrGlobal(
                params.integrationId,
                mcpContext.organizationId
              );
            } else {
              // Try org-specific first, then fall back to searching all available
              integration = await getIntegrationByName(
                params.integrationName,
                mcpContext.organizationId
              );
              if (!integration) {
                // Check global integrations by name
                const allAvailable = await getAvailableIntegrations(mcpContext.organizationId);
                integration = allAvailable.find(
                  (i) => i.name.toLowerCase() === params.integrationName.toLowerCase()
                );
              }
            }

            if (integration) {
              mcpContext.integrationNameToId.set(integration.name, integration.id);
            } else {
              return {
                success: false,
                error: `Integration "${params.integrationName}" not found. Call getOrganizationIntegrations or getGlobalIntegrations first to see available integrations.`,
              };
            }

            const result = await handleListMcpTools(
              integration.name,
              mcpContext,
              capturedAuthRequirements
            );
            console.log(
              `[tool:listMcpTools:discovery] Result: success=${result.success}, tools=${result.tools?.length ?? 0}`
            );
            // Track successful integration usage
            if (result.success) {
              usedIntegrationIds.add(integration.id);
              console.log(
                `[tool:listMcpTools:discovery] Tracked integration ID: ${integration.id}`
              );
            }
            return result;
          },
        };

        tools.manageMcpIntegration = {
          description: `STEP 3 (LAST RESORT): Discover and set up a NEW MCP integration when no suitable one exists.

CRITICAL: Only use this tool AFTER calling BOTH:
1. getOrganizationIntegrations - checked org-specific integrations FIRST
2. getGlobalIntegrations - checked global registry SECOND
...and confirmed NEITHER has what you need.

This tool "spelunks" the web to find and configure MCP servers. It's expensive and slow.
Always prefer existing integrations over creating new ones.

Only call this tool when:
1. getOrganizationIntegrations shows NO matching org-specific integration
2. getGlobalIntegrations shows NO matching global integration
3. You need a capability not covered by any existing integration

This spawns a specialist agent that will:
1. Search the web for remote MCP servers that provide the needed capability
2. Select the best option with simplest authentication
3. Test the connection works
4. Create a new dynamic integration for this organization

The result tells you what authentication the user needs to provide:
- authRequired: "none" → integration ready to use immediately
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
