import { anthropic as anthropicProvider, createAnthropic } from "@ai-sdk/anthropic";
import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, ToolSet } from "ai";
import { getConfig } from "../../config/loader.ts";
import type { ModelConfig, ModelProvider } from "../../config/schema.ts";
import { createWebSearchTool } from "../agent-web-search.ts";

import { Capability } from "./types";
import { getLogger } from "../../utils/logger.ts";
const logger = getLogger("api/agent/utils/providers.ts");


export { Capability };

const getModelConfig = async (capability: Capability): Promise<ModelConfig> => {
  const config = await getConfig();

  // 1. Try to find the capability, walking up the hierarchy recursively
  let modelNames = config.capabilities[capability];
  let currentCapability: string = capability;

  // 2. Recursive fallback: keep stripping segments until we find a match
  while (!modelNames && currentCapability.includes(".")) {
    const segments = currentCapability.split(".");
    segments.pop(); // Remove last segment
    currentCapability = segments.join(".");
    modelNames = config.capabilities[currentCapability];
  }

  // 3. Ultimate fallback to 'general' if nothing found
  if (!modelNames && capability !== Capability.GENERAL) {
    modelNames = config.capabilities["general"];
    if (modelNames) {
      logger.info(
        `[getModelConfig] Capability "${capability}" not found, falling back to 'general'`
      );
    }
  }

  // 4. Error if still no model found
  if (!modelNames) {
    const availableCapabilities = Object.keys(config.capabilities).join(", ");
    throw new Error(
      `No model mapped for capability: ${capability}. Available capabilities: ${availableCapabilities}`
    );
  }

  // Handle array of models (take first for now, could implement retry logic later)
  const modelName = Array.isArray(modelNames) ? modelNames[0] : modelNames;

  // 5. Resolve model name to model config
  const modelConfig = config.models[modelName];
  if (!modelConfig) {
    const availableModels = Object.keys(config.models).join(", ");
    throw new Error(
      `Model definition not found for: ${modelName}. Available models: ${availableModels}`
    );
  }

  return {
    provider: modelConfig.provider,
    model: modelConfig.model,
    apiKey: modelConfig.apiKey,
    endpoint: modelConfig.endpoint,
    apiVersion: modelConfig.apiVersion,
  };
};

export const getProvider = async (
  capability: Capability = Capability.GENERAL
): Promise<ModelProvider> => {
  const config = await getModelConfig(capability);
  return config.provider;
};

// TODO(greg) - probably instead of using that, we should just have a single
// google-search tool or alike.
export const getWebSearchTools = async (): Promise<ToolSet> => {
  const config = await getModelConfig(Capability.WEB_SEARCH);

  switch (config.provider) {
    case "anthropic":
    case "vertex-anthropic":
      // Anthropic's built-in web search tool
      // Supported on both direct API and Vertex AI (for Claude 3.5+/4.x models)
      // See: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude/web-search
      // Type assertion needed due to AI SDK TypeScript issue with provider-defined tools
      // See: https://github.com/vercel/ai/issues/7369
      return {
        web_search: anthropicProvider.tools.webSearch_20250305({
          maxUses: 5,
        }),
      } as ToolSet;

    case "vertex-gemini":
      return {
        web_search: createWebSearchTool(),
      } as ToolSet;

    case "openai":
      // TODO(greg) Didn't test with OpenAI yet.
      return {};

    default: {
      const _exhaustive: never = config.provider;
      logger.warn(`No web search tools available for provider: ${_exhaustive}`);
      return {};
    }
  }
};

export const createModel = async (
  capability: Capability,
  options?: { model?: string }
): Promise<LanguageModel | null> => {
  // If specific model override is provided, we bypass capability lookup
  // But we still need to find the model config for that model name
  let config: ModelConfig;

  if (options?.model) {
    const fullConfig = await getConfig();
    const modelConfig = fullConfig.models[options.model];
    if (!modelConfig) {
      logger.error(`Model definition not found for override: ${options.model}`);
      return null;
    }
    config = {
      provider: modelConfig.provider,
      model: modelConfig.model,
      apiKey: modelConfig.apiKey,
      endpoint: modelConfig.endpoint,
      apiVersion: modelConfig.apiVersion,
    };
  } else {
    try {
      config = await getModelConfig(capability);
    } catch (e) {
      logger.error("Failed to get model config:", e);
      return null;
    }
  }

  switch (config.provider) {
    case "anthropic": {
      const apiKey = config.apiKey || Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) {
        logger.error("ANTHROPIC_API_KEY not set");
        return null;
      }
      const anthropic = createAnthropic({ apiKey, baseURL: config.endpoint });
      return anthropic(config.model);
    }

    case "openai": {
      const apiKey = config.apiKey || Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        logger.error("OPENAI_API_KEY not set");
        return null;
      }
      const openai = createOpenAI({ apiKey, baseURL: config.endpoint });
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
        logger.error("GOOGLE_VERTEX_PROJECT not set");
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
      logger.error(`Unknown provider: ${_exhaustive}`);
      return null;
    }
  }
};
