import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import type { IntegrationTable } from "../db/schema.ts";
import type {
  AuthStrategy,
  IntegrationProvider,
  McpTransport,
  AuthBlock,
} from "../integrations/providers.ts";
import type { OAuthConfig } from "../../packages/shared-types/integration";
import { isValidProvider } from "../integrations/providers.ts";
import { decrypt, encrypt } from "../utils/encryption.ts";

// Re-export for convenience
export type { AuthStrategy, AuthBlock, OAuthConfig };

/**
 * OAuth2 native integration config (Gmail, GitHub, Calendar, etc.)
 * For these, OAuth IS the integration - there's no separate auth block.
 */
export interface OAuth2IntegrationConfig {
  type: "oauth2";
  clientId: string;
  clientSecret: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  metadata?: Record<string, unknown>;
}

/**
 * MCP integration config.
 * Protocol-specific fields + a dedicated auth block.
 */
export interface McpIntegrationConfig {
  type: "mcp";
  serverUrl: string;
  transport: McpTransport;
  auth: AuthBlock;
  metadata?: Record<string, unknown>;
}

/**
 * GraphQL integration config.
 * Protocol-specific fields + a dedicated auth block.
 */
export interface GraphQLIntegrationConfig {
  type: "graphql";
  endpoint: string;
  auth: AuthBlock;
  metadata?: Record<string, unknown>;
}

/**
 * Union type for all integration configurations.
 * The `type` field identifies the protocol, and `auth` (when present)
 * is a standardized block for authentication - orthogonal to protocol.
 */
export type IntegrationConfig =
  | OAuth2IntegrationConfig
  | McpIntegrationConfig
  | GraphQLIntegrationConfig;

export type IntegrationStatus = "static" | "dynamic";
export type IntegrationVisibility = "private" | "global";

export interface IntegrationWithConfig
  extends Omit<IntegrationTable, "authConfig" | "status" | "visibility"> {
  authConfig: IntegrationConfig;
  status: IntegrationStatus;
  visibility: IntegrationVisibility;
}

// =============================================================================
// Validation
// =============================================================================

const validateOAuth2Config = (config: OAuth2IntegrationConfig) => {
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

/**
 * Validates OAuth configuration for bearer_oauth strategy.
 */
const validateOAuthConfig = (
  oauthConfig: OAuthConfig | undefined,
  opts: { required: boolean }
) => {
  if (!oauthConfig) {
    if (opts.required) {
      throw new Error(
        "auth.oauthConfig is required when using bearer_oauth auth strategy"
      );
    }
    return;
  }

  if (!oauthConfig.clientId) {
    throw new Error("auth.oauthConfig.clientId is required");
  }
  if (!oauthConfig.clientSecret) {
    throw new Error("auth.oauthConfig.clientSecret is required");
  }
  if (!oauthConfig.authUrl) {
    throw new Error("auth.oauthConfig.authUrl is required");
  }
  if (!oauthConfig.tokenUrl) {
    throw new Error("auth.oauthConfig.tokenUrl is required");
  }
  if (!oauthConfig.redirectUri) {
    throw new Error("auth.oauthConfig.redirectUri is required");
  }
  if (!oauthConfig.scopes || oauthConfig.scopes.length === 0) {
    throw new Error("auth.oauthConfig.scopes must have at least one scope");
  }

  // Validate URLs
  try {
    new URL(oauthConfig.authUrl);
  } catch {
    throw new Error("auth.oauthConfig.authUrl must be a valid URL");
  }
  try {
    new URL(oauthConfig.tokenUrl);
  } catch {
    throw new Error("auth.oauthConfig.tokenUrl must be a valid URL");
  }
};

/**
 * Validates the auth block - same logic for MCP, GraphQL, REST, etc.
 * This is the single source of truth for auth validation.
 */
const validateAuthBlock = (auth: AuthBlock) => {
  if (!auth) {
    throw new Error("auth block is required");
  }
  if (!auth.strategy) {
    throw new Error("auth.strategy is required");
  }

  switch (auth.strategy.type) {
    case "none":
      // No additional validation needed
      break;
    case "api_key":
      // apiKey is only required for org-level (non-viewer-scoped)
      if (!auth.strategy.viewerScoped && !auth.apiKey) {
        throw new Error("auth.apiKey is required when using org-level api_key auth strategy");
      }
      break;
    case "bearer_oauth":
      validateOAuthConfig(auth.oauthConfig, { required: true });
      break;
    case "custom_headers":
      if (!auth.strategy.headers || Object.keys(auth.strategy.headers).length === 0) {
        throw new Error("auth.strategy.headers must have at least one header");
      }
      break;
    default:
      throw new Error(`Unknown auth strategy type: ${(auth.strategy as { type: string }).type}`);
  }
};

const validateMcpConfig = (config: McpIntegrationConfig) => {
  if (!config.serverUrl) {
    throw new Error("serverUrl is required");
  }

  try {
    new URL(config.serverUrl);
  } catch {
    throw new Error("serverUrl must be a valid URL");
  }

  if (!config.transport) {
    throw new Error("transport is required");
  }
  if (config.transport !== "sse" && config.transport !== "streamable-http") {
    throw new Error("transport must be 'sse' or 'streamable-http'");
  }

  validateAuthBlock(config.auth);
};

const validateGraphQLConfig = (config: GraphQLIntegrationConfig) => {
  if (!config.endpoint) {
    throw new Error("endpoint is required");
  }

  try {
    new URL(config.endpoint);
  } catch {
    throw new Error("endpoint must be a valid URL");
  }

  validateAuthBlock(config.auth);
};

const validateIntegrationConfig = (config: IntegrationConfig) => {
  switch (config.type) {
    case "oauth2":
      validateOAuth2Config(config);
      break;
    case "mcp":
      validateMcpConfig(config);
      break;
    case "graphql":
      validateGraphQLConfig(config);
      break;
    default:
      throw new Error(`Unsupported config type: ${(config as { type: string }).type}`);
  }
};

// =============================================================================
// Public Config (secrets stripped)
// =============================================================================

type PublicOAuth2Config = Omit<OAuth2IntegrationConfig, "clientSecret">;
type PublicMcpConfig = Omit<McpIntegrationConfig, "auth"> & {
  auth: Omit<AuthBlock, "apiKey" | "oauthConfig"> & {
    oauthConfig?: Omit<OAuthConfig, "clientSecret">;
  };
};
type PublicGraphQLConfig = Omit<GraphQLIntegrationConfig, "auth"> & {
  auth: Omit<AuthBlock, "apiKey" | "oauthConfig"> & {
    oauthConfig?: Omit<OAuthConfig, "clientSecret">;
  };
};

export type PublicIntegrationConfig =
  | PublicOAuth2Config
  | PublicMcpConfig
  | PublicGraphQLConfig;

/**
 * Returns a sanitized version of the config without secrets.
 */
export const getPublicIntegrationConfig = (
  config: IntegrationConfig
): PublicIntegrationConfig => {
  if (config.type === "oauth2") {
    const { clientSecret: _clientSecret, ...rest } = config;
    return rest;
  }

  if (config.type === "mcp" || config.type === "graphql") {
    const { auth, ...rest } = config;
    const { apiKey: _apiKey, oauthConfig, ...authRest } = auth;

    const publicAuth: PublicMcpConfig["auth"] = { ...authRest };
    if (oauthConfig) {
      const { clientSecret: _clientSecret, ...oauthRest } = oauthConfig;
      publicAuth.oauthConfig = oauthRest;
    }

    return { ...rest, auth: publicAuth } as PublicMcpConfig | PublicGraphQLConfig;
  }

  return config as PublicIntegrationConfig;
};

// Legacy export name for backward compatibility
export const getPublicIntegrationAuthConfig = getPublicIntegrationConfig;

// =============================================================================
// CRUD Operations
// =============================================================================

export type CreateIntegrationRequest = {
  organizationId: string;
  provider: IntegrationProvider;
  name: string;
  description?: string;
  authConfig: IntegrationConfig;
  visibility?: IntegrationVisibility;
};

export type UpdateIntegrationRequest = {
  id: string;
  organizationId: string;
  name?: string;
  authConfig?: Partial<IntegrationConfig>;
  enabled?: boolean;
};

export const createIntegration = async (
  params: CreateIntegrationRequest
): Promise<IntegrationWithConfig> => {
  if (!isValidProvider(params.provider)) {
    throw new Error(`Invalid provider: ${params.provider}`);
  }

  validateIntegrationConfig(params.authConfig);
  const id = nanoid();
  const now = new Date().toISOString();
  const visibility = params.visibility ?? "private";

  const encryptedAuthConfig = encrypt(JSON.stringify(params.authConfig));

  await db
    .insertInto("integration")
    .values({
      id,
      organizationId: params.organizationId,
      provider: params.provider,
      name: params.name,
      description: params.description ?? null,
      authConfig: encryptedAuthConfig,
      enabled: true,
      status: "static",
      visibility,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  return {
    id,
    organizationId: params.organizationId,
    provider: params.provider,
    name: params.name,
    description: params.description ?? null,
    authConfig: params.authConfig,
    enabled: true,
    status: "static" as IntegrationStatus,
    visibility,
    createdAt: now,
    updatedAt: now,
  };
};

const mapRowToIntegration = (row: IntegrationTable): IntegrationWithConfig => ({
  id: row.id,
  organizationId: row.organizationId,
  provider: row.provider,
  name: row.name,
  description: row.description,
  authConfig: JSON.parse(decrypt(row.authConfig)),
  enabled: row.enabled ?? true,
  status: (row.status ?? "static") as IntegrationStatus,
  visibility: (row.visibility ?? "private") as IntegrationVisibility,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const listIntegrations = async (
  organizationId: string
): Promise<IntegrationWithConfig[]> => {
  const rows = await db
    .selectFrom("integration")
    .selectAll()
    .where("organizationId", "=", organizationId)
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map(mapRowToIntegration);
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

  return mapRowToIntegration(row);
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
    } as IntegrationConfig;
    validateIntegrationConfig(mergedConfig);
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

// =============================================================================
// Dynamic Integrations
// =============================================================================

export type CreateDynamicIntegrationRequest = {
  organizationId: string;
  name: string;
  authConfig: McpIntegrationConfig;
};

export const createDynamicIntegration = async (
  params: CreateDynamicIntegrationRequest
): Promise<IntegrationWithConfig> => {
  validateMcpConfig(params.authConfig);

  const id = nanoid();
  const now = new Date().toISOString();
  const encryptedAuthConfig = encrypt(JSON.stringify(params.authConfig));

  await db
    .insertInto("integration")
    .values({
      id,
      organizationId: params.organizationId,
      provider: "mcp",
      name: params.name,
      description: null,
      authConfig: encryptedAuthConfig,
      enabled: true,
      status: "dynamic",
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  return {
    id,
    organizationId: params.organizationId,
    provider: "mcp",
    name: params.name,
    description: null,
    authConfig: params.authConfig,
    enabled: true,
    status: "dynamic",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  };
};

export const updateDynamicIntegration = async (
  id: string,
  organizationId: string,
  authConfig: McpIntegrationConfig
): Promise<IntegrationWithConfig | null> => {
  const existing = await getIntegration(id, organizationId);

  if (!existing) {
    return null;
  }

  if (existing.status !== "dynamic") {
    throw new Error("Only dynamic integrations can be updated via this method");
  }

  validateMcpConfig(authConfig);
  const now = new Date().toISOString();
  const encryptedAuthConfig = encrypt(JSON.stringify(authConfig));

  await db
    .updateTable("integration")
    .set({
      authConfig: encryptedAuthConfig,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .where("status", "=", "dynamic")
    .execute();

  return getIntegration(id, organizationId);
};

export const isDynamicIntegration = async (
  id: string,
  organizationId: string
): Promise<boolean> => {
  const row = await db
    .selectFrom("integration")
    .select("status")
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  return row?.status === "dynamic";
};

export const getIntegrationByName = async (
  name: string,
  organizationId: string
): Promise<IntegrationWithConfig | null> => {
  const row = await db
    .selectFrom("integration")
    .selectAll()
    .where("name", "=", name)
    .where("organizationId", "=", organizationId)
    .where("enabled", "=", true)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return mapRowToIntegration(row);
};

// =============================================================================
// Global Integrations (first-party registry)
// =============================================================================

export type IntegrationVisibilityFilter = "private" | "global" | "all";

export const getAvailableIntegrations = async (
  organizationId: string,
  visibilityFilter: IntegrationVisibilityFilter = "all"
): Promise<IntegrationWithConfig[]> => {
  let query = db.selectFrom("integration").selectAll().where("enabled", "=", true);

  switch (visibilityFilter) {
    case "private":
      query = query
        .where("organizationId", "=", organizationId)
        .where("visibility", "=", "private");
      break;
    case "global":
      query = query.where("visibility", "=", "global");
      break;
    case "all":
    default:
      query = query.where((eb) =>
        eb.or([eb("organizationId", "=", organizationId), eb("visibility", "=", "global")])
      );
      break;
  }

  const rows = await query
    .orderBy("visibility", "asc")
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map(mapRowToIntegration);
};

export const getGlobalIntegrations = async (): Promise<IntegrationWithConfig[]> => {
  const rows = await db
    .selectFrom("integration")
    .selectAll()
    .where("visibility", "=", "global")
    .where("enabled", "=", true)
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map(mapRowToIntegration);
};

export const getGlobalIntegrationById = async (
  id: string
): Promise<IntegrationWithConfig | null> => {
  const row = await db
    .selectFrom("integration")
    .selectAll()
    .where("id", "=", id)
    .where("visibility", "=", "global")
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return mapRowToIntegration(row);
};

export const getIntegrationOrGlobal = async (
  id: string,
  organizationId: string
): Promise<IntegrationWithConfig | null> => {
  const orgIntegration = await getIntegration(id, organizationId);
  if (orgIntegration) {
    return orgIntegration;
  }
  return getGlobalIntegrationById(id);
};

export const setIntegrationVisibility = async (
  id: string,
  organizationId: string,
  visibility: IntegrationVisibility
): Promise<IntegrationWithConfig | null> => {
  const existing = await getIntegration(id, organizationId);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();

  await db
    .updateTable("integration")
    .set({
      visibility,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .execute();

  return getIntegration(id, organizationId);
};

export const updateIntegrationDescription = async (
  id: string,
  organizationId: string,
  description: string | null
): Promise<IntegrationWithConfig | null> => {
  const existing = await getIntegration(id, organizationId);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();

  await db
    .updateTable("integration")
    .set({
      description,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .execute();

  return getIntegration(id, organizationId);
};

// =============================================================================
// Legacy Type Aliases (for gradual migration)
// =============================================================================

/** @deprecated Use McpIntegrationConfig instead */
export type McpAuthConfig = McpIntegrationConfig;

/** @deprecated Use GraphQLIntegrationConfig instead */
export type GraphQLAuthConfig = GraphQLIntegrationConfig;

/** @deprecated Use IntegrationConfig instead */
export type IntegrationAuthConfig = IntegrationConfig;
