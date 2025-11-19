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

export const authConfigSchema = z.object({
  baseUrl: z.string().url("Base URL must be a valid URL").optional(),
  allowedOrigins: z.array(z.string().url()).default(["http://localhost:3001"]),
  providers: z.object({
    github: z.object({
      enabled: z.boolean(),
      clientId: z.string().optional(),
    }),
    google: z.object({
      enabled: z.boolean(),
      clientId: z.string().optional(),
    }),
    emailPassword: z.object({
      enabled: z.boolean(),
    }),
  }),
});

export const configSchema = z.object({
  baseUrl: z.string().url("Base URL must be a valid URL").optional(),
  adminPanelUrl: z.string().url("Admin panel URL must be a valid URL").optional(),
  apiUrl: z.string().url("API URL must be a valid URL").optional(),
  ai: aiConfigSchema,
  auth: authConfigSchema,
});

export type ModelProvider = z.infer<typeof aiConfigSchema>["provider"];
export type AIConfig = z.infer<typeof aiConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
export type Config = z.infer<typeof configSchema>;
