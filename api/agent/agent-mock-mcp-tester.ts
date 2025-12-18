import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import {
  dynamicTool,
  generateText,
  stepCountIs,
} from "ai";
import { createModel, Capability } from "./utils/providers.ts";
import { getLogger } from "../utils/logger.ts";

const logger = getLogger("api/agent/agent-mock-mcp-tester.ts");

type McpTool = {
  description?: Parameters<typeof dynamicTool>[0]["description"];
  providerOptions?: Parameters<typeof dynamicTool>[0]["providerOptions"];
  inputSchema: Parameters<typeof dynamicTool>[0]["inputSchema"];
  execute: Parameters<typeof dynamicTool>[0]["execute"];
};

const normalizeMcpTools = (
  tools: Record<string, McpTool>
): Record<string, ReturnType<typeof dynamicTool>> => {
  const normalized: Record<string, ReturnType<typeof dynamicTool>> = {};

  for (const name in tools) {
    const tool = tools[name];
    normalized[name] = dynamicTool({
      description: tool.description,
      providerOptions: tool.providerOptions,
      inputSchema: tool.inputSchema,
      execute: tool.execute,
    });
  }

  return normalized;
};

export interface MockMcpTestResult {
  response?: string;
  toolCalls?: unknown[];
  success: boolean;
  error?: string;
}

export const testMockMcpServers = async (port: number, prompt: string): Promise<MockMcpTestResult> => {
  const baseUrl = `http://localhost:${port}`;
  logger.info(`Testing mock MCP servers at ${baseUrl} with prompt: "${prompt}"`);

  try {
    // 1. Connect to Mock Servers
    const clients = await Promise.all([
      createMCPClient({ transport: { type: "http", url: `${baseUrl}/mockMCP/weather` } }),
      createMCPClient({ transport: { type: "http", url: `${baseUrl}/mockMCP/mail` } }),
      createMCPClient({ transport: { type: "http", url: `${baseUrl}/mockMCP/codeRepo` } }),
    ]);

    // 2. Aggregate Tools
    const weatherTools: Record<string, McpTool> = await clients[0].tools();
    const mailTools: Record<string, McpTool> = await clients[1].tools();
    const repoTools: Record<string, McpTool> = await clients[2].tools();
    const tools = normalizeMcpTools({
      ...weatherTools,
      ...mailTools,
      ...repoTools,
    });

    logger.info(`Aggregated tools: ${Object.keys(tools).join(", ")}`);

    // 3. Create Model
    // Use GENERAL capability, falling back to CODING if needed (though providers.ts handles fallback)
    const model = await createModel(Capability.GENERAL);
    if (!model) {
      throw new Error("Failed to create language model for agent");
    }

    // 4. Run Agent
    const result = await generateText({
      model,
      tools,
      stopWhen: stepCountIs(5),
      prompt,
    });

    logger.info(`Agent finished. Steps: ${result.steps.length}`);

    return {
      response: result.text,
      toolCalls: result.steps.flatMap(s => s.toolCalls),
      success: true,
    };

  } catch (error) {
    logger.error("Mock MCP Agent Test Failed", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
