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

const IntegrationProviderDefinitionType = builder.objectRef<IntegrationDefinition>(
  "IntegrationProviderDefinition"
);

IntegrationProviderDefinitionType.implement({
  fields: (t) => ({
    id: t.exposeString("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
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
