/**
 * Custom Google Search Tool
 *
 * Uses the official @googleapis/customsearch library to provide web search
 * capabilities that work uniformly across all AI providers.
 *
 * Setup:
 * 1. Create a Programmable Search Engine at https://programmablesearchengine.google.com/
 * 2. Get API key at https://console.cloud.google.com/apis/credentials
 * 3. Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID env vars
 *
 * Pricing: 100 free queries/day, then $5 per 1,000 queries (up to 10k/day)
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { customsearch } from "@googleapis/customsearch";

const getConfigFromEnv = () => {
  const apiKey = Deno.env.get("GOOGLE_CUSTOM_SEARCH_API_KEY");
  const searchEngineId = Deno.env.get("GOOGLE_CUSTOM_SEARCH_ENGINE_ID");

  if (!apiKey || !searchEngineId) {
    return null;
  }

  return { apiKey, searchEngineId };
};

const googleSearchInputSchema = z.object({
  query: z.string().describe("The search query to execute"),
  numResults: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Number of results to return (1-10, default 5)"),
});

type GoogleSearchInput = z.infer<typeof googleSearchInputSchema>;

export const createGoogleSearchTool = () => {
  const config = getConfigFromEnv();

  if (!config) {
    console.warn(
      "[GoogleSearch] Not configured. Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID environment variables."
    );
    return null;
  }

  console.log(`[GoogleSearch] Configured with engine ID: ${config.searchEngineId.slice(0, 8)}...`);
  const client = customsearch({ version: "v1", auth: config.apiKey });

  return {
    description:
      "Search the web using Google Search. Returns relevant web pages with titles, URLs, and snippets. Use this to find current information, documentation, news, or any web content.",
    inputSchema: googleSearchInputSchema,
    execute: async (input: GoogleSearchInput) => {
      console.log(
        `[GoogleSearch] Searching for: "${input.query}" (limit: ${input.numResults ?? 5})`
      );

      try {
        const res = await client.cse.list({
          cx: config.searchEngineId,
          q: input.query,
          num: input.numResults ?? 5,
        });

        const items = res.data.items ?? [];
        console.log(`[GoogleSearch] Found ${items.length} results`);

        if (items.length === 0) {
          return `No results found for query: "${input.query}"`;
        }

        const header = `Search results for "${input.query}" (${res.data.searchInformation?.totalResults ?? "unknown"} total results):`;

        const formattedResults = items
          .map(
            (item, index) =>
              `[${index + 1}] ${item.title}\n    URL: ${item.link}\n    ${item.snippet ?? ""}`
          )
          .join("\n\n");

        return `${header}\n\n${formattedResults}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[GoogleSearch] Error:`, message);
        throw new Error(`Search Tool Error: ${message}`);
      }
    },
  };
};

export const getGoogleSearchTool = (): ToolSet => {
  const searchTool = createGoogleSearchTool();

  if (!searchTool) {
    return {};
  }

  return {
    google_search: searchTool,
  };
};
