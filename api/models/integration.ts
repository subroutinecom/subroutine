import { nanoid } from "nanoid";
import { sql } from "kysely";
import { db } from "../db/index";
import type { IntegrationTable } from "../db/schema";
import { validateIntegrationName } from "../validation/integration-name";
import type {
  AuthStrategy,
  IntegrationProvider,
  McpTransport,
  AuthBlock,
} from "../integrations/providers";
import type { OAuthConfig } from "../../packages/shared-types/integration";
import { isValidProvider } from "../integrations/providers";
import { decrypt, encrypt } from "../utils/encryption";
import { introspectSchema } from "../integrations/introspection";
import { buildAuthHeadersFromBlock } from "../integrations/auth-utils";
import { validateExternalUrl } from "../integrations/url-validation";

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
 * MCP tool definition (cached from server).
 */
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
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
  /** Cached list of tools from the MCP server */
  tools?: McpToolDefinition[];
  /** Timestamp when tools were last fetched */
  toolsFetchedAt?: number;
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
  /** GraphQL schema in SDL format (fetched via introspection) */
  schema?: string;
  /** Timestamp when the schema was last fetched */
  schemaFetchedAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * OpenAPI integration config.
 * Protocol-specific fields + a dedicated auth block.
 */
export interface OpenAPIIntegrationConfig {
  type: "openapi";
  /** Base URL of the API (e.g., "https://api.example.com/v1") */
  baseUrl: string;
  /** URL to fetch the OpenAPI spec from (optional - can be uploaded directly) */
  specUrl?: string;
  auth: AuthBlock;
  /** OpenAPI specification as JSON string */
  spec?: string;
  /** Detected OpenAPI version */
  specVersion?: "3.0" | "3.1";
  /** Timestamp when the spec was last fetched */
  specFetchedAt?: number;
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
  | GraphQLIntegrationConfig
  | OpenAPIIntegrationConfig;

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

  // Validate serverUrl format and check for SSRF
  const urlValidation = validateExternalUrl(config.serverUrl);
  if (!urlValidation.valid) {
    throw new Error(`serverUrl: ${urlValidation.error}`);
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

  // Validate endpoint format and check for SSRF
  const urlValidation = validateExternalUrl(config.endpoint);
  if (!urlValidation.valid) {
    throw new Error(`endpoint: ${urlValidation.error}`);
  }

  validateAuthBlock(config.auth);
};

const validateOpenAPIConfig = (config: OpenAPIIntegrationConfig) => {
  if (!config.baseUrl) {
    throw new Error("baseUrl is required");
  }

  // Validate baseUrl format and check for SSRF
  const baseUrlValidation = validateExternalUrl(config.baseUrl);
  if (!baseUrlValidation.valid) {
    throw new Error(`baseUrl: ${baseUrlValidation.error}`);
  }

  // Validate specUrl if provided
  if (config.specUrl) {
    const specUrlValidation = validateExternalUrl(config.specUrl);
    if (!specUrlValidation.valid) {
      throw new Error(`specUrl: ${specUrlValidation.error}`);
    }
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
    case "openapi":
      validateOpenAPIConfig(config);
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
type PublicOpenAPIConfig = Omit<OpenAPIIntegrationConfig, "auth"> & {
  auth: Omit<AuthBlock, "apiKey" | "oauthConfig"> & {
    oauthConfig?: Omit<OAuthConfig, "clientSecret">;
  };
};

export type PublicIntegrationConfig =
  | PublicOAuth2Config
  | PublicMcpConfig
  | PublicGraphQLConfig
  | PublicOpenAPIConfig;

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

  if (config.type === "mcp" || config.type === "graphql" || config.type === "openapi") {
    const { auth, ...rest } = config;
    const { apiKey: _apiKey, oauthConfig, ...authRest } = auth;

    const publicAuth: PublicMcpConfig["auth"] = { ...authRest };
    if (oauthConfig) {
      const { clientSecret: _clientSecret, ...oauthRest } = oauthConfig;
      publicAuth.oauthConfig = oauthRest;
    }

    // Redact custom_headers values - they may contain secrets like API keys
    if (publicAuth.strategy.type === "custom_headers" && publicAuth.strategy.headers) {
      const redactedHeaders: Record<string, string> = {};
      for (const key of Object.keys(publicAuth.strategy.headers)) {
        redactedHeaders[key] = "[REDACTED]";
      }
      publicAuth.strategy = { ...publicAuth.strategy, headers: redactedHeaders };
    }

    return { ...rest, auth: publicAuth } as PublicMcpConfig | PublicGraphQLConfig | PublicOpenAPIConfig;
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

  const nameValidation = validateIntegrationName(params.name);
  if (!nameValidation.valid) {
    throw new Error(nameValidation.error);
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
    const nameValidation = validateIntegrationName(params.name);
    if (!nameValidation.valid) {
      throw new Error(nameValidation.error);
    }
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

export const deleteIntegration = async (
  id: string,
  organizationId: string
): Promise<boolean> => {
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
  const nameValidation = validateIntegrationName(params.name);
  if (!nameValidation.valid) {
    throw new Error(nameValidation.error);
  }

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
    .where(sql`LOWER(name)`, "=", name.toLowerCase())
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
// MCP Tools Introspection
// =============================================================================

/**
 * Result type for MCP tools introspection operations.
 */
export type IntrospectMcpToolsResult =
  | {
      ok: true;
      tools: McpToolDefinition[];
      toolCount: number;
      fetchedAt: number;
    }
  | { ok: false; error: string; code: string };

/**
 * Introspect the tools for an MCP integration and store them.
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @returns The introspection result
 */
export const introspectAndStoreMcpTools = async (
  id: string,
  organizationId: string
): Promise<IntrospectMcpToolsResult> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration) {
    return { ok: false, error: "Integration not found", code: "NOT_FOUND" };
  }

  if (integration.authConfig.type !== "mcp") {
    return { ok: false, error: "Integration is not an MCP integration", code: "INVALID_TYPE" };
  }

  const config = integration.authConfig;

  // Import dynamically to avoid circular dependency
  const { listMcpTools } = await import("../utils/mcp-client.ts");

  try {
    const tools = await listMcpTools(config);
    const fetchedAt = Date.now();

    // Update the integration with the tools
    const updatedConfig: McpIntegrationConfig = {
      ...config,
      tools,
      toolsFetchedAt: fetchedAt,
    };

    const now = new Date().toISOString();
    const encryptedAuthConfig = encrypt(JSON.stringify(updatedConfig));

    await db
      .updateTable("integration")
      .set({
        authConfig: encryptedAuthConfig,
        updatedAt: now,
      })
      .where("id", "=", id)
      .where("organizationId", "=", organizationId)
      .execute();

    return {
      ok: true,
      tools,
      toolCount: tools.length,
      fetchedAt,
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to fetch tools from MCP server: ${error instanceof Error ? error.message : String(error)}`,
      code: "MCP_ERROR",
    };
  }
};

/**
 * Get the stored tools for an MCP integration.
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @returns The tools list and fetch timestamp, or null if not available
 */
export const getMcpIntegrationTools = async (
  id: string,
  organizationId: string
): Promise<{ tools: McpToolDefinition[]; fetchedAt: number } | null> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration) {
    return null;
  }

  if (integration.authConfig.type !== "mcp") {
    return null;
  }

  const config = integration.authConfig;

  if (!config.tools) {
    return null;
  }

  return {
    tools: config.tools,
    fetchedAt: config.toolsFetchedAt ?? 0,
  };
};

/**
 * Store tools on an MCP integration (store-only, no fetch).
 * Used by discovery flow to cache tools after they've already been fetched.
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @param tools - The tools to store
 */
export const storeMcpToolsOnIntegration = async (
  id: string,
  organizationId: string,
  tools: McpToolDefinition[]
): Promise<void> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration || integration.authConfig.type !== "mcp") {
    return;
  }

  const config = integration.authConfig;
  const updatedConfig: McpIntegrationConfig = {
    ...config,
    tools,
    toolsFetchedAt: Date.now(),
  };

  const now = new Date().toISOString();
  const encryptedAuthConfig = encrypt(JSON.stringify(updatedConfig));

  await db
    .updateTable("integration")
    .set({
      authConfig: encryptedAuthConfig,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .execute();
};

// =============================================================================
// Schema Introspection (GraphQL)
// =============================================================================

/**
 * Result type for introspection operations.
 */
export type IntrospectIntegrationResult =
  | { ok: true; schema: string; fetchedAt: number }
  | { ok: false; error: string; code: string };

/**
 * Introspect the schema for a GraphQL integration and store it.
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @returns The introspection result
 */
export const introspectAndStoreSchema = async (
  id: string,
  organizationId: string
): Promise<IntrospectIntegrationResult> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration) {
    return { ok: false, error: "Integration not found", code: "NOT_FOUND" };
  }

  if (integration.authConfig.type !== "graphql") {
    return { ok: false, error: "Integration is not a GraphQL integration", code: "INVALID_TYPE" };
  }

  const config = integration.authConfig;
  const headers = buildAuthHeadersFromBlock(config.auth);

  const result = await introspectSchema(config.endpoint, headers);

  if (!result.ok) {
    return { ok: false, error: result.error.message, code: result.error.code };
  }

  // Update the integration with the schema
  const updatedConfig: GraphQLIntegrationConfig = {
    ...config,
    schema: result.result.schema,
    schemaFetchedAt: result.result.fetchedAt,
  };

  const now = new Date().toISOString();
  const encryptedAuthConfig = encrypt(JSON.stringify(updatedConfig));

  await db
    .updateTable("integration")
    .set({
      authConfig: encryptedAuthConfig,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .execute();

  return {
    ok: true,
    schema: result.result.schema,
    fetchedAt: result.result.fetchedAt,
  };
};

/**
 * Get the stored schema for a GraphQL integration.
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @returns The schema SDL and fetch timestamp, or null if not available
 */
export const getIntegrationSchema = async (
  id: string,
  organizationId: string
): Promise<{ schema: string; fetchedAt: number } | null> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration) {
    return null;
  }

  if (integration.authConfig.type !== "graphql") {
    return null;
  }

  const config = integration.authConfig;

  if (!config.schema) {
    return null;
  }

  return {
    schema: config.schema,
    fetchedAt: config.schemaFetchedAt ?? 0,
  };
};

/**
 * Store schema on a GraphQL integration (store-only, no introspect).
 * Used by discovery flow to cache schema after it's already been fetched.
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @param schema - The schema SDL to store
 * @param fetchedAt - Timestamp when schema was fetched
 */
export const storeGraphQLSchemaOnIntegration = async (
  id: string,
  organizationId: string,
  schema: string,
  fetchedAt: number
): Promise<void> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration || integration.authConfig.type !== "graphql") {
    return;
  }

  const config = integration.authConfig;
  const updatedConfig: GraphQLIntegrationConfig = {
    ...config,
    schema,
    schemaFetchedAt: fetchedAt,
  };

  const now = new Date().toISOString();
  const encryptedAuthConfig = encrypt(JSON.stringify(updatedConfig));

  await db
    .updateTable("integration")
    .set({
      authConfig: encryptedAuthConfig,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .execute();
};

// =============================================================================
// OpenAPI Introspection
// =============================================================================

/**
 * Result type for OpenAPI introspection operations.
 */
export type IntrospectOpenAPIResult =
  | {
      ok: true;
      spec: string;
      version: "3.0" | "3.1";
      title?: string;
      baseUrl?: string;
      operationCount: number;
      operations: Array<{ method: string; path: string; summary?: string }>;
      fetchedAt: number;
    }
  | { ok: false; error: string; code: string };

/**
 * Introspect the OpenAPI spec for an integration and store it.
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @returns The introspection result
 */
export const introspectAndStoreOpenAPISpec = async (
  id: string,
  organizationId: string
): Promise<IntrospectOpenAPIResult> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration) {
    return { ok: false, error: "Integration not found", code: "NOT_FOUND" };
  }

  if (integration.authConfig.type !== "openapi") {
    return { ok: false, error: "Integration is not an OpenAPI integration", code: "INVALID_TYPE" };
  }

  const config = integration.authConfig;

  if (!config.specUrl) {
    return { ok: false, error: "No spec URL configured for this integration", code: "NO_SPEC_URL" };
  }

  const headers = buildAuthHeadersFromBlock(config.auth);

  // Import dynamically to avoid circular dependency
  const { fetchOpenAPISpec } = await import("../integrations/openapi-introspection.ts");
  const result = await fetchOpenAPISpec(config.specUrl, headers);

  if (!result.ok) {
    return { ok: false, error: result.error.message, code: result.error.code };
  }

  // Update the integration with the spec
  const updatedConfig: OpenAPIIntegrationConfig = {
    ...config,
    spec: result.result.spec,
    specVersion: result.result.version,
    specFetchedAt: result.result.fetchedAt,
  };

  const now = new Date().toISOString();
  const encryptedAuthConfig = encrypt(JSON.stringify(updatedConfig));

  await db
    .updateTable("integration")
    .set({
      authConfig: encryptedAuthConfig,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .execute();

  return {
    ok: true,
    spec: result.result.spec,
    version: result.result.version,
    title: result.result.title,
    baseUrl: result.result.baseUrl,
    operationCount: result.result.operations.length,
    operations: result.result.operations.map((op) => ({
      method: op.method,
      path: op.path,
      summary: op.summary,
    })),
    fetchedAt: result.result.fetchedAt,
  };
};

/**
 * Store an OpenAPI spec directly (for uploaded specs).
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @param specContent - The OpenAPI spec as a string (JSON or YAML)
 * @returns The introspection result
 */
export const storeOpenAPISpec = async (
  id: string,
  organizationId: string,
  specContent: string
): Promise<IntrospectOpenAPIResult> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration) {
    return { ok: false, error: "Integration not found", code: "NOT_FOUND" };
  }

  if (integration.authConfig.type !== "openapi") {
    return { ok: false, error: "Integration is not an OpenAPI integration", code: "INVALID_TYPE" };
  }

  const config = integration.authConfig;

  // Import dynamically to avoid circular dependency
  const { parseOpenAPISpec } = await import("../integrations/openapi-introspection.ts");
  const result = await parseOpenAPISpec(specContent);

  if (!result.ok) {
    return { ok: false, error: result.error.message, code: result.error.code };
  }

  // Update the integration with the spec
  const updatedConfig: OpenAPIIntegrationConfig = {
    ...config,
    spec: result.result.spec,
    specVersion: result.result.version,
    specFetchedAt: result.result.fetchedAt,
  };

  const now = new Date().toISOString();
  const encryptedAuthConfig = encrypt(JSON.stringify(updatedConfig));

  await db
    .updateTable("integration")
    .set({
      authConfig: encryptedAuthConfig,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .execute();

  return {
    ok: true,
    spec: result.result.spec,
    version: result.result.version,
    title: result.result.title,
    baseUrl: result.result.baseUrl,
    operationCount: result.result.operations.length,
    operations: result.result.operations.map((op) => ({
      method: op.method,
      path: op.path,
      summary: op.summary,
    })),
    fetchedAt: result.result.fetchedAt,
  };
};

/**
 * Get the stored OpenAPI spec for an integration.
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @returns The spec and metadata, or null if not available
 */
export const getOpenAPIIntegrationSpec = async (
  id: string,
  organizationId: string
): Promise<{
  spec: string;
  version: "3.0" | "3.1";
  fetchedAt: number;
  operations: Array<{ method: string; path: string; summary?: string }>;
} | null> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration) {
    return null;
  }

  if (integration.authConfig.type !== "openapi") {
    return null;
  }

  const config = integration.authConfig;

  if (!config.spec || !config.specVersion) {
    return null;
  }

  // Parse operations from the spec (import dynamically to avoid circular dependency)
  const { parseOpenAPISpec } = await import("../integrations/openapi-introspection.ts");
  const parseResult = await parseOpenAPISpec(config.spec);
  const operations = parseResult.ok ? parseResult.result.operations : [];

  return {
    spec: config.spec,
    version: config.specVersion,
    fetchedAt: config.specFetchedAt ?? 0,
    operations: operations.map((op: { method: string; path: string; summary?: string }) => ({
      method: op.method,
      path: op.path,
      summary: op.summary,
    })),
  };
};

/**
 * Store spec on an OpenAPI integration (store-only, no fetch).
 * Used by discovery flow to cache spec after it's already been fetched.
 *
 * @param id - Integration ID
 * @param organizationId - Organization ID
 * @param spec - The OpenAPI spec JSON string to store
 * @param version - The OpenAPI version
 * @param fetchedAt - Timestamp when spec was fetched
 */
export const storeOpenAPISpecOnIntegration = async (
  id: string,
  organizationId: string,
  spec: string,
  version: "3.0" | "3.1",
  fetchedAt: number
): Promise<void> => {
  const integration = await getIntegration(id, organizationId);

  if (!integration || integration.authConfig.type !== "openapi") {
    return;
  }

  const config = integration.authConfig;
  const updatedConfig: OpenAPIIntegrationConfig = {
    ...config,
    spec,
    specVersion: version,
    specFetchedAt: fetchedAt,
  };

  const now = new Date().toISOString();
  const encryptedAuthConfig = encrypt(JSON.stringify(updatedConfig));

  await db
    .updateTable("integration")
    .set({
      authConfig: encryptedAuthConfig,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .execute();
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
