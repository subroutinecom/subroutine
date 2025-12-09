import SchemaBuilder from "@pothos/core";
import { auth } from "../auth.ts";
import {
  type ApiKey as ApiKeyModel,
  createApiKey,
  deleteApiKey,
  getApiKey,
  listApiKeys,
  updateApiKey,
} from "../models/apikey.ts";
import {
  createIntegration,
  deleteIntegration,
  getIntegration,
  getPublicIntegrationAuthConfig,
  type IntegrationWithConfig,
  type IntegrationVisibility,
  updateIntegration,
  getAvailableIntegrations,
  setIntegrationVisibility,
  updateIntegrationDescription,
  introspectAndStoreSchema,
  getIntegrationSchema,
  introspectAndStoreOpenAPISpec,
  getOpenAPIIntegrationSpec,
} from "../models/integration.ts";
import { isSuperadminOrg } from "../utils/superadmin.ts";
import {
  type ConnectedAccountWithCredentials,
  createConnectedAccount,
  deleteConnectedAccount,
  getConnectedAccount,
  listConnectedAccountsByOrganization,
  listConnectedAccountsByIntegration,
} from "../models/connected-account.ts";
import {
  getAllProviderDefinitions,
  type IntegrationDefinition,
  type IntegrationProvider,
} from "../integrations/providers.ts";
import { discoverMcpOAuth, type McpOAuthDiscoveryResult } from "../services/mcp-oauth-discovery.ts";
import { validateSlug, type SlugValidationWithAvailabilityResult } from "../validation/slug";
import {
  runIntegrationTests,
  getAvailableTestCases,
  type IntegrationTestCase,
  type TestCaseResult,
  type TestRunResult,
} from "../integrations/testing";

type User = {
  id: string;
  email: string;
  name: string;
};

type Session = {
  id: string;
  userId: string;
  activeOrganizationId: string;
};

type Context = {
  user: User;
  session: Session;
};

const builder = new SchemaBuilder<{
  Context: Context;
}>({});

const ApiKeyType = builder.objectRef<ApiKeyModel>("ApiKey");

ApiKeyType.implement({
  fields: (t) => ({
    id: t.exposeString("id"),
    name: t.exposeString("name", { nullable: true }),
    start: t.exposeString("start", { nullable: true }),
    prefix: t.exposeString("prefix", { nullable: true }),
    organizationId: t.exposeString("organizationId"),
    enabled: t.exposeBoolean("enabled", { nullable: true }),
    expiresAt: t.exposeString("expiresAt", { nullable: true }),
    permissions: t.exposeString("permissions", { nullable: true }),
    metadata: t.field({
      type: "String",
      nullable: true,
      resolve: (parent) => (parent.metadata ? JSON.stringify(parent.metadata) : null),
    }),
    createdAt: t.exposeString("createdAt"),
    updatedAt: t.exposeString("updatedAt"),
  }),
});

const CreatedApiKeyType = builder.objectRef<ApiKeyModel>("CreatedApiKey");

CreatedApiKeyType.implement({
  fields: (t) => ({
    id: t.exposeString("id"),
    name: t.exposeString("name", { nullable: true }),
    start: t.exposeString("start", { nullable: true }),
    prefix: t.exposeString("prefix", { nullable: true }),
    key: t.exposeString("key"), // Full key exposed only on creation
    organizationId: t.exposeString("organizationId"),
    enabled: t.exposeBoolean("enabled", { nullable: true }),
    expiresAt: t.exposeString("expiresAt", { nullable: true }),
    permissions: t.exposeString("permissions", { nullable: true }),
    metadata: t.field({
      type: "String",
      nullable: true,
      resolve: (parent) => (parent.metadata ? JSON.stringify(parent.metadata) : null),
    }),
    createdAt: t.exposeString("createdAt"),
    updatedAt: t.exposeString("updatedAt"),
  }),
});

// Integration Types
const IntegrationType = builder.objectRef<IntegrationWithConfig>("Integration");

IntegrationType.implement({
  fields: (t) => ({
    id: t.exposeString("id"),
    organizationId: t.exposeString("organizationId"),
    provider: t.exposeString("provider"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    authConfig: t.field({
      type: "String",
      resolve: (parent) => JSON.stringify(getPublicIntegrationAuthConfig(parent.authConfig)),
    }),
    enabled: t.exposeBoolean("enabled"),
    visibility: t.exposeString("visibility"),
    createdAt: t.exposeString("createdAt"),
    updatedAt: t.exposeString("updatedAt"),
  }),
});

// Connected Account Types
const ConnectedAccountType = builder.objectRef<ConnectedAccountWithCredentials>("ConnectedAccount");

ConnectedAccountType.implement({
  fields: (t) => ({
    id: t.exposeString("id"),
    integrationId: t.exposeString("integrationId"),
    viewerId: t.exposeString("viewerId"),
    organizationId: t.exposeString("organizationId"),
    credentials: t.field({
      type: "String",
      resolve: (parent) => JSON.stringify(parent.credentials),
    }),
    accountIdentifier: t.exposeString("accountIdentifier", { nullable: true }),
    status: t.exposeString("status"),
    lastUsedAt: t.exposeString("lastUsedAt", { nullable: true }),
    createdAt: t.exposeString("createdAt"),
    updatedAt: t.exposeString("updatedAt"),
  }),
});

const OAuthIntegrationConfigType = builder.objectRef<
  Extract<IntegrationDefinition["auth"], { type: "oauth2" }>
>("IntegrationProviderOAuthConfig");

OAuthIntegrationConfigType.implement({
  fields: (t) => ({
    authUrl: t.exposeString("authUrl"),
    tokenUrl: t.exposeString("tokenUrl"),
    defaultScopes: t.stringList({
      resolve: (parent) => parent.defaultScopes,
    }),
    requiredScopes: t.stringList({
      nullable: true,
      resolve: (parent) => parent.requiredScopes ?? null,
    }),
    defaultRedirectPath: t.exposeString("defaultRedirectPath", {
      nullable: true,
    }),
  }),
});

// MCP Auth Strategy Type - serialized as JSON string for flexibility
const McpAuthStrategyType = builder.objectRef<{
  type: string;
  headerName?: string;
  headers?: Record<string, string>;
}>("McpAuthStrategy");

McpAuthStrategyType.implement({
  fields: (t) => ({
    type: t.exposeString("type"),
    headerName: t.exposeString("headerName", { nullable: true }),
    headers: t.field({
      type: "String",
      nullable: true,
      resolve: (parent) => (parent.headers ? JSON.stringify(parent.headers) : null),
    }),
  }),
});

const McpIntegrationConfigType = builder.objectRef<
  Extract<IntegrationDefinition["auth"], { type: "mcp" }>
>("IntegrationProviderMcpConfig");

McpIntegrationConfigType.implement({
  fields: (t) => ({
    serverUrl: t.exposeString("serverUrl"),
    transport: t.exposeString("transport"),
    authStrategy: t.field({
      type: McpAuthStrategyType,
      resolve: (parent) => parent.authStrategy,
    }),
  }),
});

// GraphQL Provider Config Type
const GraphQLIntegrationConfigType = builder.objectRef<
  Extract<IntegrationDefinition["auth"], { type: "graphql" }>
>("IntegrationProviderGraphQLConfig");

GraphQLIntegrationConfigType.implement({
  fields: (t) => ({
    endpoint: t.exposeString("endpoint"),
    authStrategy: t.field({
      type: McpAuthStrategyType,
      resolve: (parent) => parent.authStrategy,
    }),
    oauthConfig: t.field({
      type: OAuthIntegrationConfigType,
      nullable: true,
      resolve: (parent) => {
        // Expose nested OAuth config for bearer_oauth strategy
        if (parent.authStrategy.type === "bearer_oauth" && parent.oauthConfig) {
          // Return as oauth2 type shape for compatibility with OAuthIntegrationConfigType
          return {
            type: "oauth2" as const,
            authUrl: parent.oauthConfig.authUrl,
            tokenUrl: parent.oauthConfig.tokenUrl,
            defaultScopes: parent.oauthConfig.defaultScopes,
            requiredScopes: parent.oauthConfig.requiredScopes,
            defaultRedirectPath: parent.oauthConfig.defaultRedirectPath,
            supportsCustomConfig: false,
          };
        }
        return null;
      },
    }),
  }),
});

// OpenAPI Provider Config Type
const OpenAPIIntegrationConfigType = builder.objectRef<
  Extract<IntegrationDefinition["auth"], { type: "openapi" }>
>("IntegrationProviderOpenAPIConfig");

OpenAPIIntegrationConfigType.implement({
  fields: (t) => ({
    baseUrl: t.exposeString("baseUrl"),
    authStrategy: t.field({
      type: McpAuthStrategyType,
      resolve: (parent) => parent.authStrategy,
    }),
    oauthConfig: t.field({
      type: OAuthIntegrationConfigType,
      nullable: true,
      resolve: (parent) => {
        // Expose nested OAuth config for bearer_oauth strategy
        if (parent.authStrategy.type === "bearer_oauth" && parent.oauthConfig) {
          return {
            type: "oauth2" as const,
            authUrl: parent.oauthConfig.authUrl,
            tokenUrl: parent.oauthConfig.tokenUrl,
            defaultScopes: parent.oauthConfig.defaultScopes,
            requiredScopes: parent.oauthConfig.requiredScopes,
            defaultRedirectPath: parent.oauthConfig.defaultRedirectPath,
            supportsCustomConfig: false,
          };
        }
        return null;
      },
    }),
  }),
});

const IntegrationProviderDefinitionType = builder.objectRef<IntegrationDefinition>(
  "IntegrationProviderDefinition"
);

IntegrationProviderDefinitionType.implement({
  fields: (t) => ({
    id: t.exposeString("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    category: t.exposeString("category", { nullable: true }),
    viewerScoped: t.boolean({
      resolve: (parent) => parent.viewerScoped ?? false,
    }),
    authType: t.string({
      resolve: (parent) => parent.auth.type,
    }),
    oauthConfig: t.field({
      type: OAuthIntegrationConfigType,
      nullable: true,
      resolve: (parent) => (parent.auth.type === "oauth2" ? parent.auth : null),
    }),
    mcpConfig: t.field({
      type: McpIntegrationConfigType,
      nullable: true,
      resolve: (parent) => (parent.auth.type === "mcp" ? parent.auth : null),
    }),
    graphqlConfig: t.field({
      type: GraphQLIntegrationConfigType,
      nullable: true,
      resolve: (parent) => (parent.auth.type === "graphql" ? parent.auth : null),
    }),
    openapiConfig: t.field({
      type: OpenAPIIntegrationConfigType,
      nullable: true,
      resolve: (parent) => (parent.auth.type === "openapi" ? parent.auth : null),
    }),
  }),
});

// Slug Validation Result Type
const SlugValidationResultType =
  builder.objectRef<SlugValidationWithAvailabilityResult>("SlugValidationResult");

SlugValidationResultType.implement({
  fields: (t) => ({
    valid: t.exposeBoolean("valid"),
    error: t.exposeString("error", { nullable: true }),
    available: t.exposeBoolean("available", { nullable: true }),
  }),
});

// MCP OAuth Discovery Result Type
const McpOAuthDiscoveryResultType =
  builder.objectRef<McpOAuthDiscoveryResult>("McpOAuthDiscoveryResult");

McpOAuthDiscoveryResultType.implement({
  fields: (t) => ({
    success: t.exposeBoolean("success"),
    serverName: t.exposeString("serverName", { nullable: true }),
    authorizationServer: t.exposeString("authorizationServer", { nullable: true }),
    authorizationEndpoint: t.exposeString("authorizationEndpoint", { nullable: true }),
    tokenEndpoint: t.exposeString("tokenEndpoint", { nullable: true }),
    registrationEndpoint: t.exposeString("registrationEndpoint", { nullable: true }),
    scopesSupported: t.stringList({
      nullable: true,
      resolve: (parent) => parent.scopesSupported ?? null,
    }),
    pkceSupported: t.exposeBoolean("pkceSupported", { nullable: true }),
    dynamicRegistrationSupported: t.exposeBoolean("dynamicRegistrationSupported", {
      nullable: true,
    }),
    error: t.exposeString("error", { nullable: true }),
  }),
});

// GraphQL Schema Introspection Result Type
type IntrospectionResultModel =
  | { success: true; schema: string; fetchedAt: number }
  | { success: false; error: string; code: string };

const IntegrationSchemaResultType =
  builder.objectRef<IntrospectionResultModel>("IntegrationSchemaResult");

IntegrationSchemaResultType.implement({
  fields: (t) => ({
    success: t.boolean({
      resolve: (parent) => parent.success,
    }),
    schema: t.string({
      nullable: true,
      resolve: (parent) => (parent.success ? parent.schema : null),
    }),
    fetchedAt: t.int({
      nullable: true,
      resolve: (parent) => (parent.success ? parent.fetchedAt : null),
    }),
    error: t.string({
      nullable: true,
      resolve: (parent) => (!parent.success ? parent.error : null),
    }),
    code: t.string({
      nullable: true,
      resolve: (parent) => (!parent.success ? parent.code : null),
    }),
  }),
});

// Stored Schema Type
const StoredSchemaType = builder.objectRef<{ schema: string; fetchedAt: number }>("StoredSchema");

StoredSchemaType.implement({
  fields: (t) => ({
    schema: t.exposeString("schema"),
    fetchedAt: t.int({
      resolve: (parent) => parent.fetchedAt,
    }),
  }),
});

// OpenAPI Operation Type
const OpenAPIOperationType = builder.objectRef<{
  method: string;
  path: string;
  summary?: string;
}>("OpenAPIOperation");

OpenAPIOperationType.implement({
  fields: (t) => ({
    method: t.exposeString("method"),
    path: t.exposeString("path"),
    summary: t.exposeString("summary", { nullable: true }),
  }),
});

// OpenAPI Introspection Result Type
type OpenAPIIntrospectionResultModel =
  | { success: true; spec: string; version: "3.0" | "3.1"; fetchedAt: number; operations: Array<{ method: string; path: string; summary?: string }> }
  | { success: false; error: string; code: string };

const OpenAPIIntrospectionResultType =
  builder.objectRef<OpenAPIIntrospectionResultModel>("OpenAPIIntrospectionResult");

OpenAPIIntrospectionResultType.implement({
  fields: (t) => ({
    success: t.boolean({
      resolve: (parent) => parent.success,
    }),
    spec: t.string({
      nullable: true,
      resolve: (parent) => (parent.success ? parent.spec : null),
    }),
    version: t.string({
      nullable: true,
      resolve: (parent) => (parent.success ? parent.version : null),
    }),
    fetchedAt: t.int({
      nullable: true,
      resolve: (parent) => (parent.success ? parent.fetchedAt : null),
    }),
    operations: t.field({
      type: [OpenAPIOperationType],
      nullable: true,
      resolve: (parent) => (parent.success ? parent.operations : null),
    }),
    error: t.string({
      nullable: true,
      resolve: (parent) => (!parent.success ? parent.error : null),
    }),
    code: t.string({
      nullable: true,
      resolve: (parent) => (!parent.success ? parent.code : null),
    }),
  }),
});

// Stored OpenAPI Spec Type
const StoredOpenAPISpecType = builder.objectRef<{
  spec: string;
  version: "3.0" | "3.1";
  fetchedAt: number;
  operations: Array<{ method: string; path: string; summary?: string }>;
}>("StoredOpenAPISpec");

StoredOpenAPISpecType.implement({
  fields: (t) => ({
    spec: t.exposeString("spec"),
    version: t.exposeString("version"),
    fetchedAt: t.int({
      resolve: (parent) => parent.fetchedAt,
    }),
    operations: t.field({
      type: [OpenAPIOperationType],
      resolve: (parent) => parent.operations,
    }),
  }),
});

// Integration Testing Types
const IntegrationTestCaseType = builder.objectRef<IntegrationTestCase>("IntegrationTestCase");

IntegrationTestCaseType.implement({
  fields: (t) => ({
    id: t.exposeString("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description"),
    providerId: t.exposeString("providerId"),
    readonly: t.exposeBoolean("readonly"),
  }),
});

const TestCaseErrorType = builder.objectRef<{
  name: string;
  message: string;
  stack?: string;
}>("TestCaseError");

TestCaseErrorType.implement({
  fields: (t) => ({
    name: t.exposeString("name"),
    message: t.exposeString("message"),
    stack: t.exposeString("stack", { nullable: true }),
  }),
});

const TestCaseResultType = builder.objectRef<TestCaseResult>("TestCaseResult");

TestCaseResultType.implement({
  fields: (t) => ({
    testCaseId: t.exposeString("testCaseId"),
    success: t.exposeBoolean("success"),
    message: t.exposeString("message"),
    details: t.field({
      type: "String",
      nullable: true,
      resolve: (parent) => (parent.details ? JSON.stringify(parent.details) : null),
    }),
    durationMs: t.int({
      resolve: (parent) => parent.durationMs,
    }),
    error: t.field({
      type: TestCaseErrorType,
      nullable: true,
      resolve: (parent) => parent.error ?? null,
    }),
  }),
});

const TestRunSummaryType = builder.objectRef<{
  total: number;
  passed: number;
  failed: number;
  totalDurationMs: number;
}>("TestRunSummary");

TestRunSummaryType.implement({
  fields: (t) => ({
    total: t.int({ resolve: (parent) => parent.total }),
    passed: t.int({ resolve: (parent) => parent.passed }),
    failed: t.int({ resolve: (parent) => parent.failed }),
    totalDurationMs: t.int({ resolve: (parent) => parent.totalDurationMs }),
  }),
});

const TestRunResultType = builder.objectRef<TestRunResult>("TestRunResult");

TestRunResultType.implement({
  fields: (t) => ({
    integrationId: t.exposeString("integrationId"),
    providerId: t.exposeString("providerId"),
    results: t.field({
      type: [TestCaseResultType],
      resolve: (parent) => parent.results,
    }),
    summary: t.field({
      type: TestRunSummaryType,
      resolve: (parent) => parent.summary,
    }),
    executedAt: t.exposeString("executedAt"),
  }),
});

builder.queryType({
  fields: (t) => ({
    ping: t.string({
      resolve: () => "pong",
    }),
    apiKeys: t.field({
      type: [ApiKeyType],
      resolve: async (_parent, _args, ctx) => {
        return listApiKeys(ctx.user.id, ctx.session.activeOrganizationId);
      },
    }),
    apiKey: t.field({
      type: ApiKeyType,
      nullable: true,
      args: {
        id: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        return getApiKey(args.id, ctx.user.id, ctx.session.activeOrganizationId);
      },
    }),
    integrations: t.field({
      type: [IntegrationType],
      description:
        "Get integrations with optional visibility filter. " +
        "Filter: 'private' (org-specific only), 'global' (registry only), 'all' or omit for both.",
      args: {
        visibility: t.arg.string({
          required: false,
          description: "Filter by visibility: 'private', 'global', or 'all' (default)",
        }),
      },
      resolve: async (_parent, args, ctx) => {
        const visibilityFilter = (args.visibility ?? "all") as "private" | "global" | "all";
        return getAvailableIntegrations(ctx.session.activeOrganizationId, visibilityFilter);
      },
    }),
    integration: t.field({
      type: IntegrationType,
      nullable: true,
      args: {
        id: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        return getIntegration(args.id, ctx.session.activeOrganizationId);
      },
    }),
    isSuperadmin: t.field({
      type: "Boolean",
      description: "Check if the current organization has superadmin privileges",
      resolve: async (_parent, _args, ctx) => {
        return isSuperadminOrg(ctx.session.activeOrganizationId);
      },
    }),
    integrationProviders: t.field({
      type: [IntegrationProviderDefinitionType],
      resolve: () => getAllProviderDefinitions(),
    }),
    connectedAccounts: t.field({
      type: [ConnectedAccountType],
      resolve: async (_parent, _args, ctx) => {
        return listConnectedAccountsByOrganization(ctx.session.activeOrganizationId);
      },
    }),
    connectedAccount: t.field({
      type: ConnectedAccountType,
      nullable: true,
      args: {
        id: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        return getConnectedAccount(args.id, ctx.session.activeOrganizationId);
      },
    }),
    connectedAccountsByIntegration: t.field({
      type: [ConnectedAccountType],
      args: {
        integrationId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        return listConnectedAccountsByIntegration(
          args.integrationId,
          ctx.session.activeOrganizationId
        );
      },
    }),
    discoverMcpOAuth: t.field({
      type: McpOAuthDiscoveryResultType,
      args: {
        serverUrl: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        return discoverMcpOAuth(args.serverUrl);
      },
    }),
    validateSlug: t.field({
      type: SlugValidationResultType,
      description: "Validate an organization slug for format and availability",
      args: {
        slug: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args) => {
        return validateSlug(args.slug);
      },
    }),
    introspectGraphQLEndpoint: t.field({
      type: IntegrationSchemaResultType,
      description:
        "Introspect a GraphQL endpoint to verify connectivity and fetch schema. " +
        "Used during integration creation to validate the endpoint.",
      args: {
        endpoint: t.arg.string({ required: true }),
        headers: t.arg.string({
          required: false,
          description: "JSON string of headers to include in the request",
        }),
      },
      resolve: async (_parent, args) => {
        const { introspectSchema } = await import("../integrations/introspection.ts");
        const headers = args.headers ? JSON.parse(args.headers) : {};

        const result = await introspectSchema(args.endpoint, headers);

        if (result.ok) {
          return {
            success: true as const,
            schema: result.result.schema,
            fetchedAt: result.result.fetchedAt,
          };
        } else {
          return {
            success: false as const,
            error: result.error.message,
            code: result.error.code,
          };
        }
      },
    }),
    integrationSchema: t.field({
      type: StoredSchemaType,
      nullable: true,
      description: "Get the stored GraphQL schema for a GraphQL integration",
      args: {
        integrationId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        return getIntegrationSchema(args.integrationId, ctx.session.activeOrganizationId);
      },
    }),
    introspectOpenAPIEndpoint: t.field({
      type: OpenAPIIntrospectionResultType,
      description:
        "Introspect an OpenAPI endpoint to verify connectivity and fetch spec. " +
        "Used during integration creation to validate the endpoint.",
      args: {
        specUrl: t.arg.string({ required: true }),
        headers: t.arg.string({
          required: false,
          description: "JSON string of headers to include in the request",
        }),
      },
      resolve: async (_parent, args) => {
        const { fetchOpenAPISpec } = await import("../integrations/openapi-introspection.ts");
        const headers = args.headers ? JSON.parse(args.headers) : {};

        const result = await fetchOpenAPISpec(args.specUrl, headers);

        if (result.ok) {
          return {
            success: true as const,
            spec: result.result.spec,
            version: result.result.version,
            fetchedAt: result.result.fetchedAt,
            operations: result.result.operations.map((op) => ({
              method: op.method,
              path: op.path,
              summary: op.summary,
            })),
          };
        } else {
          return {
            success: false as const,
            error: result.error.message,
            code: result.error.code,
          };
        }
      },
    }),
    integrationOpenAPISpec: t.field({
      type: StoredOpenAPISpecType,
      nullable: true,
      description: "Get the stored OpenAPI spec for an OpenAPI integration",
      args: {
        integrationId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        return getOpenAPIIntegrationSpec(args.integrationId, ctx.session.activeOrganizationId);
      },
    }),
    integrationTestCases: t.field({
      type: [IntegrationTestCaseType],
      description: "Get available test cases for a provider",
      args: {
        providerId: t.arg.string({ required: true }),
      },
      resolve: (_parent, args) => {
        return getAvailableTestCases(args.providerId);
      },
    }),
  }),
});

builder.mutationType({
  fields: (t) => ({
    createApiKey: t.field({
      type: CreatedApiKeyType,
      args: {
        name: t.arg.string({ required: false }),
        prefix: t.arg.string({ required: false }),
        metadata: t.arg.string({
          required: false,
          description: "JSON string of metadata",
        }),
      },
      resolve: async (_parent, args, ctx) => {
        const metadata = args.metadata ? JSON.parse(args.metadata) : undefined;

        return createApiKey({
          userId: ctx.user.id,
          organizationId: ctx.session.activeOrganizationId,
          name: args.name || undefined,
          prefix: args.prefix || undefined,
          metadata,
        });
      },
    }),
    updateApiKey: t.field({
      type: ApiKeyType,
      nullable: true,
      args: {
        id: t.arg.string({ required: true }),
        name: t.arg.string({ required: false }),
        metadata: t.arg.string({
          required: false,
          description: "JSON string of metadata",
        }),
      },
      resolve: async (_parent, args, ctx) => {
        const metadata = args.metadata ? JSON.parse(args.metadata) : undefined;

        return updateApiKey({
          id: args.id,
          userId: ctx.user.id,
          organizationId: ctx.session.activeOrganizationId,
          name: args.name || undefined,
          metadata,
        });
      },
    }),
    deleteApiKey: t.field({
      type: "Boolean",
      args: {
        id: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        return deleteApiKey(args.id, ctx.user.id, ctx.session.activeOrganizationId);
      },
    }),
    createIntegration: t.field({
      type: IntegrationType,
      args: {
        provider: t.arg.string({ required: true }),
        name: t.arg.string({ required: true }),
        description: t.arg.string({ required: false }),
        authConfig: t.arg.string({
          required: true,
          description: "JSON string of IntegrationAuthConfig",
        }),
        visibility: t.arg.string({
          required: false,
          description: "Integration visibility: 'private' (default) or 'global' (superadmin only)",
        }),
      },
      resolve: async (_parent, args, ctx) => {
        const authConfig = JSON.parse(args.authConfig);
        const visibility = (args.visibility ?? "private") as IntegrationVisibility;

        // Only superadmins can create global integrations
        if (visibility === "global") {
          const isSuperadmin = await isSuperadminOrg(ctx.session.activeOrganizationId);
          if (!isSuperadmin) {
            throw new Error("Only superadmins can create global integrations");
          }
        }

        return createIntegration({
          organizationId: ctx.session.activeOrganizationId,
          provider: args.provider as IntegrationProvider,
          name: args.name,
          description: args.description ?? undefined,
          authConfig,
          visibility,
        });
      },
    }),
    updateIntegration: t.field({
      type: IntegrationType,
      nullable: true,
      args: {
        id: t.arg.string({ required: true }),
        name: t.arg.string({ required: false }),
        authConfig: t.arg.string({
          required: false,
          description: "JSON string of IntegrationAuthConfig",
        }),
        enabled: t.arg.boolean({ required: false }),
      },
      resolve: async (_parent, args, ctx) => {
        // Check if integration is global - only superadmins can modify global integrations
        const existing = await getIntegration(args.id, ctx.session.activeOrganizationId);
        if (existing?.visibility === "global") {
          const isSuperadmin = await isSuperadminOrg(ctx.session.activeOrganizationId);
          if (!isSuperadmin) {
            throw new Error("Only superadmins can modify global integrations");
          }
        }

        const authConfig = args.authConfig ? JSON.parse(args.authConfig) : undefined;

        return updateIntegration({
          id: args.id,
          organizationId: ctx.session.activeOrganizationId,
          name: args.name || undefined,
          authConfig,
          enabled: args.enabled !== null && args.enabled !== undefined ? args.enabled : undefined,
        });
      },
    }),
    deleteIntegration: t.field({
      type: "Boolean",
      args: {
        id: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        // Check if integration is global - only superadmins can delete global integrations
        const existing = await getIntegration(args.id, ctx.session.activeOrganizationId);
        if (existing?.visibility === "global") {
          const isSuperadmin = await isSuperadminOrg(ctx.session.activeOrganizationId);
          if (!isSuperadmin) {
            throw new Error("Only superadmins can delete global integrations");
          }
        }

        return deleteIntegration(args.id, ctx.session.activeOrganizationId);
      },
    }),
    setIntegrationVisibility: t.field({
      type: IntegrationType,
      nullable: true,
      description: "Set integration visibility (superadmin only for 'global')",
      args: {
        id: t.arg.string({ required: true }),
        visibility: t.arg.string({
          required: true,
          description: "'private' or 'global'",
        }),
      },
      resolve: async (_parent, args, ctx) => {
        const visibility = args.visibility as IntegrationVisibility;

        // Only superadmins can set visibility to global
        if (visibility === "global") {
          const isSuperadmin = await isSuperadminOrg(ctx.session.activeOrganizationId);
          if (!isSuperadmin) {
            throw new Error("Only superadmins can make integrations global");
          }
        }

        return setIntegrationVisibility(args.id, ctx.session.activeOrganizationId, visibility);
      },
    }),
    updateIntegrationDescription: t.field({
      type: IntegrationType,
      nullable: true,
      description: "Update integration description",
      args: {
        id: t.arg.string({ required: true }),
        description: t.arg.string({ required: false }),
      },
      resolve: async (_parent, args, ctx) => {
        // Check if integration is global - only superadmins can modify global integrations
        const existing = await getIntegration(args.id, ctx.session.activeOrganizationId);
        if (existing?.visibility === "global") {
          const isSuperadmin = await isSuperadminOrg(ctx.session.activeOrganizationId);
          if (!isSuperadmin) {
            throw new Error("Only superadmins can modify global integrations");
          }
        }

        return updateIntegrationDescription(
          args.id,
          ctx.session.activeOrganizationId,
          args.description ?? null
        );
      },
    }),
    createConnectedAccount: t.field({
      type: ConnectedAccountType,
      args: {
        integrationId: t.arg.string({ required: true }),
        viewerId: t.arg.string({ required: true }),
        credentials: t.arg.string({
          required: true,
          description: "JSON string of ConnectedAccountCredentials",
        }),
        accountIdentifier: t.arg.string({ required: false }),
      },
      resolve: async (_parent, args, ctx) => {
        const credentials = JSON.parse(args.credentials);

        return createConnectedAccount({
          integrationId: args.integrationId,
          viewerId: args.viewerId,
          organizationId: ctx.session.activeOrganizationId,
          credentials,
          accountIdentifier: args.accountIdentifier || undefined,
        });
      },
    }),
    deleteConnectedAccount: t.field({
      type: "Boolean",
      args: {
        id: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        return deleteConnectedAccount(args.id, ctx.session.activeOrganizationId);
      },
    }),
    introspectIntegrationSchema: t.field({
      type: IntegrationSchemaResultType,
      description:
        "Introspect a GraphQL endpoint and store the schema. " +
        "Only works for GraphQL integrations with appropriate auth configured.",
      args: {
        integrationId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        const result = await introspectAndStoreSchema(
          args.integrationId,
          ctx.session.activeOrganizationId
        );

        if (result.ok) {
          return {
            success: true as const,
            schema: result.schema,
            fetchedAt: result.fetchedAt,
          };
        } else {
          return {
            success: false as const,
            error: result.error,
            code: result.code,
          };
        }
      },
    }),
    introspectIntegrationOpenAPISpec: t.field({
      type: OpenAPIIntrospectionResultType,
      description:
        "Fetch an OpenAPI spec and store it for an integration. " +
        "Only works for OpenAPI integrations with specUrl configured.",
      args: {
        integrationId: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        const result = await introspectAndStoreOpenAPISpec(
          args.integrationId,
          ctx.session.activeOrganizationId
        );

        if (result.ok) {
          return {
            success: true as const,
            spec: result.spec,
            version: result.version,
            fetchedAt: result.fetchedAt,
            operations: result.operations.map((op) => ({
              method: op.method,
              path: op.path,
              summary: op.summary,
            })),
          };
        } else {
          return {
            success: false as const,
            error: result.error,
            code: result.code,
          };
        }
      },
    }),
    runIntegrationTests: t.field({
      type: TestRunResultType,
      description:
        "Run integration tests for a specific integration. " +
        "Requires a connected account with valid OAuth tokens.",
      args: {
        integrationId: t.arg.string({ required: true }),
        testCaseIds: t.arg.stringList({
          required: false,
          description: "Specific test case IDs to run. If omitted, runs all tests for the provider.",
        }),
      },
      resolve: async (_parent, args, ctx) => {
        return runIntegrationTests({
          integrationId: args.integrationId,
          organizationId: ctx.session.activeOrganizationId,
          viewerId: ctx.user.id,
          testCaseIds: args.testCaseIds ?? undefined,
        });
      },
    }),
  }),
});

export const schema = builder.toSchema();

export const buildContext = async (headers: Headers): Promise<Context> => {
  const allowIntrospectionBypass = Deno.env.get("NODE_ENV") !== "production";
  const isIntrospectionBypass = headers.get("x-graphql-introspection") === "1";

  if (allowIntrospectionBypass && isIntrospectionBypass) {
    return {
      user: {
        id: "introspection-user",
        email: "introspection@example.com",
        name: "Introspection User",
      },
      session: {
        id: "introspection-session",
        userId: "introspection-user",
        activeOrganizationId: "introspection-org",
      },
    };
  }

  const sessionData = await auth.api.getSession({ headers });

  if (!sessionData?.session || !sessionData?.user) {
    throw new Error("Unauthorized");
  }

  if (!sessionData.session.activeOrganizationId) {
    throw new Error("No active organization");
  }

  return {
    user: {
      id: sessionData.user.id,
      email: sessionData.user.email,
      name: sessionData.user.name,
    },
    session: {
      id: sessionData.session.id,
      userId: sessionData.session.userId,
      activeOrganizationId: sessionData.session.activeOrganizationId,
    },
  };
};
