import { vertex as vertexProvider } from "@ai-sdk/google-vertex";
import type { LanguageModel, ToolSet } from "ai";
import { generateText } from "ai";
import { z } from "zod";
import { createModel, getProvider } from "./utils/providers.ts";
import { Capability } from "./utils/types.ts";

export type WebSearchResult = {
  success: boolean;
  results?: string;
  error?: string;
};

const WEB_SEARCH_SYSTEM_PROMPT = `You are a web search assistant. Your job is to search the web for information based on the user's query and return relevant results.

Instructions:
1. Use the google_search tool to search for the requested information
2. Summarize the key findings from the search results
3. Include relevant URLs when available
4. Focus on the most relevant and recent information
5. If the search doesn't return useful results, explain what was found or suggest alternative search terms

Be concise but comprehensive in your response.`;

export const runWebSearchSubagent = async (
  query: string,
  model?: LanguageModel
): Promise<WebSearchResult> => {
  console.log(`[web-search-subagent] Starting web search for: "${query}"`);
  const aiModel = model ?? (await createModel(Capability.WEB_SEARCH));
  if (!aiModel) {
    console.log(`[web-search-subagent] Failed to create AI model`);
    return {
      success: false,
      error: "Failed to create AI model for web search",
    };
  }
  console.log(`[web-search-subagent] Using model (created successfully)`);

  const tools: ToolSet = {
    google_search: vertexProvider.tools.googleSearch({}),
  } as ToolSet;

  try {
    console.log(`[web-search-subagent] Calling generateText with google_search tool`);
    const result = await generateText({
      model: aiModel,
      system: WEB_SEARCH_SYSTEM_PROMPT,
      prompt: `Search the web for: ${query}`,
      tools,
    });

    console.log(`[web-search-subagent] Success, result length: ${result.text.length}`);
    return {
      success: true,
      results: result.text,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : String(error);
    console.log(`[web-search-subagent] Error: ${errorMessage}`);
    console.log(`[web-search-subagent] Full error: ${errorStack}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Web search failed",
    };
  }
};

export const createWebSearchTool = () => ({
  description: `Search the web for information. Use this tool to find current information about:
- MCP servers and their URLs
- API documentation
- Service configurations
- Any other publicly available information

Returns a summary of relevant search results.`,
  inputSchema: z.object({
    query: z.string().describe("The search query to find information about"),
  }),
  execute: async ({ query }: { query: string }): Promise<WebSearchResult> => {
    console.log(`[tool:web_search] Searching for: "${query}"`);
    const result = await runWebSearchSubagent(query);
    console.log(`[tool:web_search] Result: success=${result.success}`);
    return result;
  },
});

export const requiresWebSearchSubagent = async (): Promise<boolean> => {
  const provider = await getProvider(Capability.WEB_SEARCH);
  return provider === "vertex-gemini";
};
