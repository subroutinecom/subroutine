import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";

type ModelProvider =
  | "anthropic"
  | "openai"
  | "vertex-anthropic"
  | "vertex-gemini";

type ProviderConfig = {
  provider: ModelProvider;
  model: string;
};

const getProviderFromEnv = (): ProviderConfig | null => {
  const provider = Deno.env.get("MODEL_PROVIDER") as ModelProvider | undefined;

  const model = Deno.env.get("MODEL_NAME");

  if (!provider || !model) {
    throw new Error("Both MODEL_PROVIDER and MODEL_NAME must be set");
  }

  return {
    provider,
    model,
  };
};

export const createModel = (): LanguageModel | null => {
  const config = getProviderFromEnv();

  if (!config) {
    console.log(
      "No model provider configured. Please set appropriate environment variables.",
    );
    return null;
  }

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

    case "vertex-anthropic": {
      const project = Deno.env.get("VERTEX_PROJECT");
      const location = Deno.env.get("VERTEX_LOCATION") ?? "us-east5";

      if (!project) {
        console.error("VERTEX_PROJECT not set");
        return null;
      }

      const vertexAnthropic = createVertexAnthropic({
        project,
        location,
      });

      return vertexAnthropic(config.model);
    }

    case "vertex-gemini": {
      const project = Deno.env.get("VERTEX_PROJECT");
      const location = Deno.env.get("VERTEX_LOCATION") ?? "us-central1";

      if (!project) {
        console.error("VERTEX_PROJECT not set");
        return null;
      }

      const vertex = createVertex({
        project,
        location,
      });

      return vertex(config.model);
    }

    default: {
      const _exhaustive: never = config.provider;
      console.error(`Unknown provider: ${_exhaustive}`);
      return null;
    }
  }
};
