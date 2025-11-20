import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import type { IntegrationTable } from "../db/schema.ts";
import { decrypt, encrypt } from "../utils/encryption.ts";
import type { IntegrationProvider } from "../integrations/providers.ts";
import { isValidProvider } from "../integrations/providers.ts";

export interface IntegrationAuthConfig {
  type: "oauth2";
  clientId: string;
  clientSecret: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  metadata?: Record<string, unknown>;
}

export interface IntegrationWithConfig extends Omit<IntegrationTable, "authConfig"> {
  authConfig: IntegrationAuthConfig;
}

const validateIntegrationAuthConfig = (config: IntegrationAuthConfig) => {
  if (config.type !== "oauth2") {
    throw new Error(`Unsupported auth config type: ${config.type}`);
  }
  if (!config.clientId) {
    throw new Error("authConfig.clientId is required");
  }
  if (!config.clientSecret) {
    throw new Error("authConfig.clientSecret is required");
  }
  if (!config.authUrl) {
    throw new Error("authConfig.authUrl is required");
  }
  if (!config.tokenUrl) {
    throw new Error("authConfig.tokenUrl is required");
  }
  if (!config.redirectUri) {
    throw new Error("authConfig.redirectUri is required");
  }
};

export const getPublicIntegrationAuthConfig = (
  config: IntegrationAuthConfig
): Omit<IntegrationAuthConfig, "clientSecret"> => {
  const { clientSecret: _clientSecret, ...rest } = config;
  return rest;
};

export type CreateIntegrationRequest = {
  organizationId: string;
  provider: IntegrationProvider;
  name: string;
  authConfig: IntegrationAuthConfig;
};

export type UpdateIntegrationRequest = {
  id: string;
  organizationId: string;
  name?: string;
  authConfig?: Partial<IntegrationAuthConfig>;
  enabled?: boolean;
};

export const createIntegration = async (
  params: CreateIntegrationRequest
): Promise<IntegrationWithConfig> => {
  if (!isValidProvider(params.provider)) {
    throw new Error(`Invalid provider: ${params.provider}`);
  }

  validateIntegrationAuthConfig(params.authConfig);
  const id = nanoid();
  const now = new Date().toISOString();

  const encryptedAuthConfig = encrypt(JSON.stringify(params.authConfig));

  await db
    .insertInto("integration")
    .values({
      id,
      organizationId: params.organizationId,
      provider: params.provider,
      name: params.name,
      authConfig: encryptedAuthConfig,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  return {
    id,
    organizationId: params.organizationId,
    provider: params.provider,
    name: params.name,
    authConfig: params.authConfig,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
};

export const listIntegrations = async (
  organizationId: string
): Promise<IntegrationWithConfig[]> => {
  const rows = await db
    .selectFrom("integration")
    .selectAll()
    .where("organizationId", "=", organizationId)
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    name: row.name,
    authConfig: JSON.parse(decrypt(row.authConfig)),
    enabled: row.enabled ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
};

export const listIntegrationsByProvider = async (
  organizationId: string,
  provider: IntegrationProvider
): Promise<IntegrationWithConfig[]> => {
  const rows = await db
    .selectFrom("integration")
    .selectAll()
    .where("organizationId", "=", organizationId)
    .where("provider", "=", provider)
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    name: row.name,
    authConfig: JSON.parse(decrypt(row.authConfig)),
    enabled: row.enabled ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
};

export const getIntegration = async (
  id: string,
  organizationId: string
): Promise<IntegrationWithConfig | null> => {
  const row = await db
    .selectFrom("integration")
    .selectAll()
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    name: row.name,
    authConfig: JSON.parse(decrypt(row.authConfig)),
    enabled: row.enabled ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const updateIntegration = async (
  params: UpdateIntegrationRequest
): Promise<IntegrationWithConfig | null> => {
  const existing = await getIntegration(params.id, params.organizationId);

  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();

  const updateValues: {
    name?: string;
    authConfig?: string;
    enabled?: boolean;
    updatedAt: string;
  } = {
    updatedAt: now,
  };

  if (params.name !== undefined) {
    updateValues.name = params.name;
  }

  if (params.authConfig !== undefined) {
    const mergedConfig = {
      ...existing.authConfig,
      ...params.authConfig,
    } as IntegrationAuthConfig;
    validateIntegrationAuthConfig(mergedConfig);
    updateValues.authConfig = encrypt(JSON.stringify(mergedConfig));
  }

  if (params.enabled !== undefined) {
    updateValues.enabled = params.enabled;
  }

  await db
    .updateTable("integration")
    .set(updateValues)
    .where("id", "=", params.id)
    .where("organizationId", "=", params.organizationId)
    .execute();

  return getIntegration(params.id, params.organizationId);
};

export const deleteIntegration = async (id: string, organizationId: string): Promise<boolean> => {
  const result = await db
    .deleteFrom("integration")
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  return (result?.numDeletedRows ?? 0n) > 0n;
};

export const integrationExists = async (
  organizationId: string,
  provider: IntegrationProvider,
  name: string
): Promise<boolean> => {
  const row = await db
    .selectFrom("integration")
    .select("id")
    .where("organizationId", "=", organizationId)
    .where("provider", "=", provider)
    .where("name", "=", name)
    .executeTakeFirst();

  return !!row;
};
