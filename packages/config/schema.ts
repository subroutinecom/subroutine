import { z } from "zod";

export const aiConfigSchema = z.object({
  provider: z.enum([
    "anthropic",
    "openai",
    "vertex-anthropic",
    "vertex-gemini",
  ]),
  model: z.string().min(1, "Model name cannot be empty"),
});

export const configSchema = z.object({
  ai: aiConfigSchema,
});

export type ModelProvider = z.infer<typeof aiConfigSchema>["provider"];
export type AIConfig = z.infer<typeof aiConfigSchema>;
export type Config = z.infer<typeof configSchema>;
