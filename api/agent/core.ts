import type { LanguageModel } from "ai";
import { streamText } from "ai";
import { z } from "zod";
import type { CodeGenerationResult } from "./types";
import { CODE_GENERATION_USER_PROMPT, SYSTEM_PROMPT, type McpIntegrationInfo } from "./prompts";
import { IntegrationAuthRequiredError, type AuthRequirement } from "../models/errors";
import { getIntegration, type McpAuthConfig } from "../models/integration";
import { getConnectedAccountByViewer } from "../models/connected-account";
import { listMcpTools as listMcpToolsUtil } from "../utils/mcp-client";
import { generateAuthorizationUrl } from "../services/oauth";
import type { IntegrationProvider } from "../integrations/providers";

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

const validateCode = (code: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!code.includes("export")) {
    errors.push("Code must export the main function");
  }

  if (!code.includes("async function main")) {
    errors.push("Code must define an async function named 'main'");
  }

  if (!code.includes("type Context") && !code.includes("interface Context")) {
    errors.push("Code must define a Context type");
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
      } else {
        // viewerScoped api_key without OAuth
        if (!capturedAuthRequirements.some((r) => r.integrationId === integrationId)) {
          capturedAuthRequirements.push({
            integrationId,
            integrationName: integration.name,
            provider: integration.provider as IntegrationProvider,
            authorizationUrl: "",
            state: "",
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
          const { inputsSchema, outputsSchema, code } = params;
          const immediateInputs =
            "immediateInputs" in params
              ? (params.immediateInputs as Record<string, unknown>)
              : undefined;
          const validation = validateCode(code);

          if (!validation.valid) {
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
          return {
            success: true,
            message: "Subroutine generated successfully",
          };
        },
      },
    };

    // Add listMcpTools tool if MCP context is available
    if (options?.mcpContext && options.mcpIntegrations && options.mcpIntegrations.length > 0) {
      const mcpContext = options.mcpContext;
      tools.listMcpTools = {
        description:
          "Discover the available tools from an MCP integration. Call this before writing code that uses MCP tools to understand what tools are available and their input schemas.",
        inputSchema: z.object({
          integrationName: z
            .string()
            .describe("The name of the MCP integration to list tools from"),
        }),
        execute: async (params: { integrationName: string }) => {
          return await handleListMcpTools(
            params.integrationName,
            mcpContext,
            capturedAuthRequirements
          );
        },
      };
    }

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

    // If any auth requirements were captured during tool discovery, throw them
    if (capturedAuthRequirements.length > 0) {
      throw new IntegrationAuthRequiredError({
        viewerId: options?.mcpContext?.viewerId ?? "",
        requirements: capturedAuthRequirements,
      });
    }

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

    const { code, inputsSchema, outputsSchema, immediateInputs } = capturedResult as CapturedResult;

    return {
      success: true,
      source: code,
      inputsSchema,
      outputsSchema,
      immediateInputs,
      iterations: steps.length,
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
