import type { LanguageModel, ToolSet } from "ai";
import { createAnthropic, anthropic as anthropicProvider } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import { getConfig } from "../config/loader.ts";
import { getGoogleSearchTool } from "./tools/google-search";

export type ModelProvider = "anthropic" | "openai" | "vertex-anthropic" | "vertex-gemini";

type ProviderConfig = {
  provider: ModelProvider;
  model: string;
};

const getProviderFromConfig = async (): Promise<ProviderConfig> => {
  const config = await getConfig();

  return {
    provider: config.ai.provider,
    model: config.ai.model,
  };
};

export const getProvider = async (): Promise<ModelProvider> => {
  const config = await getProviderFromConfig();
  return config.provider;
};

export const getWebSearchTools = async (options?: { forceCustom?: boolean }): Promise<ToolSet> => {
  const config = await getProviderFromConfig();

  // just leave it here for now, though probably should make this configurable
  if (
    !options?.forceCustom &&
    (config.provider === "anthropic" || config.provider === "vertex-anthropic")
  ) {
    return {
      web_search: anthropicProvider.tools.webSearch_20250305({
        maxUses: 5,
      }),
    } as ToolSet;
  }

  return getGoogleSearchTool();
};

export const createModel = async (): Promise<LanguageModel | null> => {
  const config = await getProviderFromConfig();

  switch (config.provider) {
    case "anthropic": {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) {
        console.error("ANTHROPIC_API_KEY not set");
        return null;
      }
      const anthropic = createAnthropic({ apiKey });
      return anthropic(config.model);
    }

    case "openai": {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        console.error("OPENAI_API_KEY not set");
        return null;
      }
      const openai = createOpenAI({ apiKey });
      return openai(config.model);
    }

    case "vertex-gemini":
    case "vertex-anthropic": {
      const project = Deno.env.get("GOOGLE_VERTEX_PROJECT");
      const defaultLocation = config.provider === "vertex-anthropic" ? "us-east5" : "global";
      const location = Deno.env.get("GOOGLE_VERTEX_LOCATION") ?? defaultLocation;
      const googleServiceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
      const googleServiceAccountPrivateKey = Deno.env
        .get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")
        ?.replace(/\\n/g, "\n");

      if (!project) {
        console.error("GOOGLE_VERTEX_PROJECT not set");
        return null;
      }

      let googleAuthOptions:
        | NonNullable<Parameters<typeof createVertex>[0]>["googleAuthOptions"]
        | undefined = undefined;

      if (googleServiceAccountEmail && googleServiceAccountPrivateKey) {
        googleAuthOptions = {
          credentials: {
            client_email: googleServiceAccountEmail,
            private_key: googleServiceAccountPrivateKey,
          },
        };
      }

      const providerFactory =
        config.provider === "vertex-anthropic" ? createVertexAnthropic : createVertex;

      const headers =
        config.provider === "vertex-anthropic"
          ? { "anthropic-beta": "web-search-2025-03-05,fine-grained-tool-streaming-2025-05-14" }
          : undefined;

      const provider = providerFactory({
        project,
        location,
        googleAuthOptions,
        headers,
      });

      return provider(config.model);
    }

    default: {
      const _exhaustive: never = config.provider;
      console.error(`Unknown provider: ${_exhaustive}`);
      return null;
    }
  }
};
