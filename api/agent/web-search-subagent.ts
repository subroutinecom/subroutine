import type { LanguageModel, ToolSet } from "ai";
import { generateText } from "ai";
import { vertex as vertexProvider } from "@ai-sdk/google-vertex";
import { z } from "zod";
import { createModel, getProvider } from "./providers";

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
  const aiModel = model ?? (await createModel());
  if (!aiModel) {
    return {
      success: false,
      error: "Failed to create AI model for web search",
    };
  }

  const tools: ToolSet = {
    google_search: vertexProvider.tools.googleSearch({}),
  } as ToolSet;

  try {
    const result = await generateText({
      model: aiModel,
      system: WEB_SEARCH_SYSTEM_PROMPT,
      prompt: `Search the web for: ${query}`,
      tools,
    });

    return {
      success: true,
      results: result.text,
    };
  } catch (error) {
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
  const provider = await getProvider();
  return provider === "vertex-gemini";
};
