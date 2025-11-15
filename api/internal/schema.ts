import SchemaBuilder from "@pothos/core";
import { auth } from "../auth.ts";
import {
  createApiKey,
  deleteApiKey,
  getApiKey,
  listApiKeys,
  updateApiKey,
  type ApiKey as ApiKeyModel,
} from "../models/apikey.ts";

type User = {
  id: string;
  email: string;
  name: string;
};

type Session = {
  id: string;
  userId: string;
  activeOrganizationId?: string | null;
};

type Context = {
  user: User | null;
  session: Session | null;
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
      resolve: (parent) =>
        parent.metadata ? JSON.stringify(parent.metadata) : null,
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
      resolve: (parent) =>
        parent.metadata ? JSON.stringify(parent.metadata) : null,
    }),
    createdAt: t.exposeString("createdAt"),
    updatedAt: t.exposeString("updatedAt"),
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
        if (!ctx.user || !ctx.session?.activeOrganizationId) {
          throw new Error("Unauthorized: No active organization");
        }

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
        if (!ctx.user || !ctx.session?.activeOrganizationId) {
          throw new Error("Unauthorized: No active organization");
        }

        return getApiKey(args.id, ctx.user.id, ctx.session.activeOrganizationId);
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
        if (!ctx.user) {
          throw new Error("Unauthorized");
        }
        if (!ctx.session?.activeOrganizationId) {
          throw new Error("No active organization");
        }

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
        if (!ctx.user || !ctx.session?.activeOrganizationId) {
          throw new Error("Unauthorized: No active organization");
        }

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
        if (!ctx.user || !ctx.session?.activeOrganizationId) {
          throw new Error("Unauthorized: No active organization");
        }

        return deleteApiKey(
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
  try {
    const sessionData = await auth.api.getSession({
      headers,
    });

    if (!sessionData?.session || !sessionData?.user) {
      return { user: null, session: null };
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
  } catch (error) {
    console.error("Error building GraphQL context:", error);
    return { user: null, session: null };
  }
};
