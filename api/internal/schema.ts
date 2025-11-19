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
  listIntegrations,
  updateIntegration,
} from "../models/integration.ts";
import {
  type ConnectedAccountWithCredentials,
  createConnectedAccount,
  deleteConnectedAccount,
  getConnectedAccount,
  listConnectedAccounts,
  listConnectedAccountsByIntegration,
} from "../models/connected-account.ts";
import {
  getAllProviderDefinitions,
  type IntegrationDefinition,
  type IntegrationProvider,
} from "../integrations/providers.ts";

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
      resolve: (parent) => parent.metadata ? JSON.stringify(parent.metadata) : null,
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
      resolve: (parent) => parent.metadata ? JSON.stringify(parent.metadata) : null,
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
    authConfig: t.field({
      type: "String",
      resolve: (parent) => JSON.stringify(getPublicIntegrationAuthConfig(parent.authConfig)),
    }),
    enabled: t.exposeBoolean("enabled"),
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
    userId: t.exposeString("userId"),
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
    defaultRedirectPath: t.exposeString("defaultRedirectPath", { nullable: true }),
  }),
});

const IntegrationProviderDefinitionType = builder.objectRef<IntegrationDefinition>(
  "IntegrationProviderDefinition",
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
      resolve: (parent) => parent.auth.type === "oauth2" ? parent.auth : null,
    }),
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
      resolve: async (_parent, _args, ctx) => {
        return listIntegrations(ctx.session.activeOrganizationId);
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
    integrationProviders: t.field({
      type: [IntegrationProviderDefinitionType],
      resolve: () => getAllProviderDefinitions(),
    }),
    connectedAccounts: t.field({
      type: [ConnectedAccountType],
      resolve: async (_parent, _args, ctx) => {
        return listConnectedAccounts(ctx.user.id, ctx.session.activeOrganizationId);
      },
    }),
    connectedAccount: t.field({
      type: ConnectedAccountType,
      nullable: true,
      args: {
        id: t.arg.string({ required: true }),
      },
      resolve: async (_parent, args, ctx) => {
        return getConnectedAccount(args.id, ctx.user.id, ctx.session.activeOrganizationId);
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
          ctx.session.activeOrganizationId,
        );
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
        return deleteApiKey(
          args.id,
          ctx.user.id,
          ctx.session.activeOrganizationId,
        );
      },
    }),
    createIntegration: t.field({
      type: IntegrationType,
      args: {
        provider: t.arg.string({ required: true }),
        name: t.arg.string({ required: true }),
        authConfig: t.arg.string({
          required: true,
          description: "JSON string of IntegrationAuthConfig",
        }),
      },
      resolve: async (_parent, args, ctx) => {
        const authConfig = JSON.parse(args.authConfig);

        return createIntegration({
          organizationId: ctx.session.activeOrganizationId,
          provider: args.provider as IntegrationProvider,
          name: args.name,
          authConfig,
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
        return deleteIntegration(args.id, ctx.session.activeOrganizationId);
      },
    }),
    createConnectedAccount: t.field({
      type: ConnectedAccountType,
      args: {
        integrationId: t.arg.string({ required: true }),
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
          userId: ctx.user.id,
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
        return deleteConnectedAccount(
          args.id,
          ctx.user.id,
          ctx.session.activeOrganizationId,
        );
      },
    }),
  }),
});

export const schema = builder.toSchema();

export const buildContext = async (
  headers: Headers,
): Promise<Context> => {
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
