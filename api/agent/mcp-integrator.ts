/**
 * MCP Integrator Sub-Agent
 *
 * An autonomous agent that discovers, configures, tests, and creates MCP integrations.
 * Called by the main generation agent when a needed integration doesn't exist.
 *
 * The general flow is this:
 * 1. When we need a new integration, the agent looks into Subroutine registry (this isn't yet implemented)
 * 2. If it doesn't find an integration there, it looks for one using web_search. (here we can consider
 *    expanding this and allowing the agent to use specific MCP registries later on)
 * 3. If it finds one, it runs probing to discover the auth mechanism and if the dynamic integration is even
 *    feasible.
 */

import type { LanguageModel } from "ai";
import { generateText } from "ai";
import { z } from "zod";
import { createModel, getWebSearchTools } from "./providers";
import {
  createDynamicIntegration,
  updateDynamicIntegration,
  getIntegration,
  getIntegrationByName,
  type McpAuthConfig,
} from "../models/integration";
import { listMcpTools } from "../utils/mcp-client";
import type { McpTransport, McpAuthStrategy } from "../integrations/providers";

export type McpIntegratorResult = {
  success: boolean;
  integrationId?: string;
  integrationName?: string;

  authRequired?: "none" | "api_key" | "oauth";

  // we will wanna pass these to the user when integration is set up.
  authInstructions?: string;
  error?: string;
};

export type McpIntegratorParams = {
  organizationId: string;
  viewerId: string;

  // describe what the user actually needs here in as much details as possible
  need: string;

  /** If provided, fix this existing dynamic integration instead of creating a new one */
  existingIntegrationId?: string;
};

const MCP_INTEGRATOR_SYSTEM_PROMPT = `You are an MCP Integration "spelunker" - a specialist that discovers and configures NEW MCP servers when no existing integration fits the user's needs.

## Context: You Are the Last Resort
You are called ONLY when:
1. The user's organization has no suitable private (org-specific) integration
2. The global first-party registry has no suitable integration
3. A new integration must be discovered and configured from scratch

## Your Goal
Discover and set up a working MCP integration so users can accomplish their tasks. Minimize user friction - don't ask users to do things AIs can figure out.

## Critical Constraint
Subroutine can ONLY integrate with **remote MCP servers** that have publicly accessible HTTP or HTTPS endpoints. We cannot:
- Run local MCP servers
- Execute npx or npm commands

Only look for MCP servers that are already hosted and accessible via URL.

## Auth Strategy Priority (ALWAYS prefer lower friction)
1. **NO AUTH** - If the server works without auth, use it. User is never bothered.
2. **API_KEY (viewer-scoped)** - User provides a personal access token. Simple and clear.
3. **OAUTH with shared app** - Complex, avoid if possible for now.
4. **OAUTH requiring client setup** - AVOID. User would need to create their own app - unacceptable UX.

## Your Workflow
1. Use the web_search tool to search for **hosted/remote MCP servers** (e.g., "github remote mcp server", "brave search mcp api endpoint")
2. Look for:
   - Remote MCP server endpoints (HTTP/HTTPS URLs)
   - Hosted MCP services with public URLs
3. Extract the server URL (must be http:// or https://)
4. Pick the best option (prioritize low-friction auth)
5. Use testMcpConnection to verify the server is reachable
6. If it works, use createDynamicIntegration to save it
7. Call complete with the result

## Common MCP Server Patterns
- Remote servers use URLs like: https://mcp.example.com/sse or https://api.example.com/mcp
- Most MCP servers use "streamable-http" or "sse" transport
- For API key auth, the header is usually "Authorization" with value "Bearer <token>"
- Skip any servers that only offer local/stdio transport or require npx to run

## When Auth is Required
If auth is needed (api_key), provide clear, helpful instructions:
- For GitHub: "Please provide a GitHub Personal Access Token (PAT) with 'repo' and 'read:user' scopes. Create one at https://github.com/settings/tokens"
- For Slack: "Please provide a Slack Bot Token. Get one at https://api.slack.com/apps"
- For Brave Search: "Please provide a Brave Search API key. Get one at https://brave.com/search/api/"
- For other services: Explain what token/key is needed and where to get it

## Error Handling
If something fails:
1. Search the web for more options
2. Try a different server if available
3. Try a different auth configuration
4. If all options fail, call complete with success=false and a clear error message

## Important Rules
- ONLY integrate with remote MCP servers that have HTTP/HTTPS URLs - never local servers
- NEVER suggest that users create OAuth applications
- NEVER suggest configuring redirect URIs or webhooks
- ALWAYS prefer simpler auth over complex auth
- ALWAYS test the connection before creating an integration
- If fixing an existing integration, use updateDynamicIntegration instead of creating new
- Use web_search liberally to find information about MCP servers`;

const testMcpConnection = async (
  serverUrl: string,
  transport: McpTransport
): Promise<{
  success: boolean;
  tools?: Array<{ name: string; description?: string }>;
  error?: string;
}> => {
  if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
    return {
      success: false,
      error:
        "Only remote HTTP/HTTPS MCP servers are supported. Local servers (stdio, npx) are not supported.",
    };
  }

  try {
    const config: McpAuthConfig = {
      type: "mcp",
      serverUrl,
      transport,
      authStrategy: { type: "none" },
    };

    const tools = await listMcpTools(config, undefined, 15000); // 15s timeout for testing
    return {
      success: true,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
};

const buildTools = (params: McpIntegratorParams) => {
  let capturedResult: McpIntegratorResult | null = null;

  const tools = {
    testMcpConnection: {
      description: "Test if an MCP server is reachable and can list tools (without auth)",
      inputSchema: z.object({
        serverUrl: z.string().describe("The MCP server URL to test"),
        transport: z
          .enum(["streamable-http", "sse"])
          .describe("Transport protocol")
          .default("streamable-http"),
      }),
      execute: async ({ serverUrl, transport }: { serverUrl: string; transport: McpTransport }) => {
        return await testMcpConnection(serverUrl, transport);
      },
    },

    createDynamicIntegration: {
      description: "Create a new dynamic MCP integration in the database",
      inputSchema: z.object({
        name: z.string().describe("Name for the integration (e.g., 'github', 'slack')"),
        serverUrl: z.string().describe("The MCP server URL"),
        transport: z
          .enum(["streamable-http", "sse"])
          .describe("Transport protocol")
          .default("streamable-http"),
        authType: z.enum(["none", "api_key"]).describe("Authentication type").default("none"),
        viewerScoped: z
          .boolean()
          .describe("Whether auth is per-user (true) or org-level (false)")
          .default(true),
        authHeaderName: z
          .string()
          .describe("Header name for API key (default: Authorization)")
          .optional(),
      }),
      execute: async ({
        name,
        serverUrl,
        transport,
        authType,
        viewerScoped,
        authHeaderName,
      }: {
        name: string;
        serverUrl: string;
        transport: McpTransport;
        authType: "none" | "api_key";
        viewerScoped: boolean;
        authHeaderName?: string;
      }) => {
        const existing = await getIntegrationByName(name, params.organizationId);
        if (existing) {
          return {
            success: false,
            error: `Integration with name "${name}" already exists`,
          };
        }

        let authStrategy: McpAuthStrategy;
        if (authType === "none") {
          authStrategy = { type: "none" };
        } else {
          authStrategy = {
            type: "api_key",
            viewerScoped,
            headerName: authHeaderName,
          };
        }

        const authConfig: McpAuthConfig = {
          type: "mcp",
          serverUrl,
          transport,
          authStrategy,
        };

        try {
          const integration = await createDynamicIntegration({
            organizationId: params.organizationId,
            name,
            authConfig,
          });

          return {
            success: true,
            integrationId: integration.id,
            integrationName: integration.name,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create integration",
          };
        }
      },
    },

    updateDynamicIntegration: {
      description: "Update an existing dynamic integration's configuration",
      inputSchema: z.object({
        integrationId: z.string().describe("ID of the integration to update"),
        serverUrl: z.string().describe("New MCP server URL").optional(),
        transport: z.enum(["streamable-http", "sse"]).describe("New transport").optional(),
        authType: z.enum(["none", "api_key"]).describe("New auth type").optional(),
        viewerScoped: z.boolean().describe("New viewerScoped setting").optional(),
      }),
      execute: async ({
        integrationId,
        serverUrl,
        transport,
        authType,
        viewerScoped,
      }: {
        integrationId: string;
        serverUrl?: string;
        transport?: McpTransport;
        authType?: "none" | "api_key";
        viewerScoped?: boolean;
      }) => {
        const existing = await getIntegration(integrationId, params.organizationId);
        if (!existing) {
          return { success: false, error: "Integration not found" };
        }

        if (existing.authConfig.type !== "mcp") {
          return { success: false, error: "Not an MCP integration" };
        }

        const newConfig: McpAuthConfig = {
          ...existing.authConfig,
          serverUrl: serverUrl ?? existing.authConfig.serverUrl,
          transport: transport ?? existing.authConfig.transport,
        };

        if (authType !== undefined) {
          if (authType === "none") {
            newConfig.authStrategy = { type: "none" };
          } else {
            newConfig.authStrategy = {
              type: "api_key",
              viewerScoped: viewerScoped ?? true,
            };
          }
        }

        try {
          const updated = await updateDynamicIntegration(
            integrationId,
            params.organizationId,
            newConfig
          );

          if (!updated) {
            return { success: false, error: "Failed to update integration" };
          }

          return {
            success: true,
            integrationId: updated.id,
            integrationName: updated.name,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update integration",
          };
        }
      },
    },

    complete: {
      description: "Signal that integration setup is complete (success or failure)",
      inputSchema: z.object({
        success: z.boolean().describe("Whether the setup was successful"),
        integrationId: z.string().describe("ID of the created/updated integration").optional(),
        integrationName: z.string().describe("Name of the integration").optional(),
        authRequired: z
          .enum(["none", "api_key", "oauth"])
          .describe("What auth the user needs to provide")
          .optional(),
        authInstructions: z
          .string()
          .describe("Human-readable instructions for the user")
          .optional(),
        error: z.string().describe("Error message if setup failed").optional(),
      }),
      execute: (result: McpIntegratorResult) => {
        capturedResult = result;
        return { done: true };
      },
    },
  };

  return { tools, getCapturedResult: () => capturedResult };
};

/**
 * Run the MCP Integrator sub-agent.
 *
 * @param params - Parameters for the integration setup
 * @returns Result of the integration setup
 */
export const runMcpIntegrator = async (
  params: McpIntegratorParams
): Promise<McpIntegratorResult> => {
  const model = await createModel();
  if (!model) {
    return {
      success: false,
      error: "Failed to create AI model for MCP Integrator",
    };
  }

  const webSearchTools = await getWebSearchTools();

  return await runMcpIntegratorWithModel(model, params, webSearchTools);
};

export const runMcpIntegratorWithModel = async (
  model: LanguageModel,
  params: McpIntegratorParams,
  webSearchTools: Record<string, unknown> = {}
): Promise<McpIntegratorResult> => {
  const { tools, getCapturedResult } = buildTools(params);

  const allTools = {
    ...webSearchTools,
    ...tools,
  };

  let userPrompt: string;
  if (params.existingIntegrationId) {
    userPrompt = `Fix the existing dynamic integration with ID "${params.existingIntegrationId}".
The user needs: "${params.need}"
The integration may have a wrong server URL, transport, or auth configuration.
Investigate and fix it, or find a better alternative server.`;
  } else {
    userPrompt = `Set up a new MCP integration for: "${params.need}"
Search for available servers, pick the best one with the simplest auth, test it, and create the integration.`;
  }

  try {
    await generateText({
      model,
      system: MCP_INTEGRATOR_SYSTEM_PROMPT,
      prompt: userPrompt,
      tools: allTools as Parameters<typeof generateText>[0]["tools"],
      stopWhen: () => getCapturedResult() !== null,
    });

    const capturedResult = getCapturedResult();
    if (capturedResult) {
      return capturedResult;
    }

    return {
      success: false,
      error: "MCP Integrator did not complete the setup process",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error in MCP Integrator",
    };
  }
};
