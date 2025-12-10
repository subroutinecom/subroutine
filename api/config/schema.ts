import { z } from "zod";

export const modelConfigSchema = z.object({
  provider: z.enum(["anthropic", "openai", "vertex-anthropic", "vertex-gemini"]),
  model: z.string().min(1, "Model name cannot be empty"),
  apiKey: z.string().optional(),
  endpoint: z.string().optional(),
  apiVersion: z.string().optional(),
});

export const capabilitiesConfigSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())])
);

export const rateLimitRuleSchema = z.object({
  windowMs: z.number().min(1000).default(60000),
  limit: z.number().min(1).default(60),
});

export const rateLimitConfigSchema = z.object({
  enabled: z.boolean().default(false),
  patLinkGet: rateLimitRuleSchema.default({ windowMs: 60000, limit: 30 }),
  patLinkSubmit: rateLimitRuleSchema.default({ windowMs: 60000, limit: 5 }),
});

export const crossSubDomainCookiesSchema = z.object({
  enabled: z.boolean(),
  domain: z.string().min(1, "Domain is required when cross-subdomain cookies are enabled"),
});

export const authConfigSchema = z.object({
  baseUrl: z.string().url("Base URL must be a valid URL").optional(),
  allowedOrigins: z.array(z.string().url()).default(["http://localhost:3001"]),
  crossSubDomainCookies: crossSubDomainCookiesSchema.optional(),
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

export const superadminConfigSchema = z.object({
  // Organization IDs that have superadmin privileges
  // Superadmins can create global integrations (first-party registry)
  organizationIds: z.array(z.string()).default([]),
});

export const configSchema = z.object({
  baseUrl: z.string().url("Base URL must be a valid URL").optional(),
  adminPanelUrl: z.string().url("Admin panel URL must be a valid URL").optional(),
  apiUrl: z.string().url("API URL must be a valid URL").optional(),
  internalSandboxUrl: z.string().url().default("http://sandbox.subroutine.internal"),
  models: z.record(z.string(), modelConfigSchema),
  capabilities: capabilitiesConfigSchema,
  auth: authConfigSchema,
  rateLimit: rateLimitConfigSchema.optional(),
  superadmin: superadminConfigSchema.optional(),
});

export type ModelProvider = z.infer<typeof modelConfigSchema>["provider"];
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type CapabilitiesConfig = z.infer<typeof capabilitiesConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;
export type SuperadminConfig = z.infer<typeof superadminConfigSchema>;
export type Config = z.infer<typeof configSchema>;
