import type { Kysely } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .createTable("apikey")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text")
    .addColumn("start", "text")
    .addColumn("prefix", "text")
    .addColumn("key", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("organizationId", "text", (col) =>
      col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("enabled", "boolean")
    .addColumn("expiresAt", "text")
    .addColumn("permissions", "text")
    .addColumn("metadata", "text")
    .addColumn("rateLimitEnabled", "boolean")
    .addColumn("rateLimitTimeWindow", "integer")
    .addColumn("rateLimitMax", "integer")
    .addColumn("requestCount", "integer")
    .addColumn("remaining", "integer")
    .addColumn("lastRequest", "text")
    .addColumn("refillInterval", "integer")
    .addColumn("refillAmount", "integer")
    .addColumn("lastRefillAt", "text")
    .addColumn("createdAt", "text", (col) => col.notNull())
    .addColumn("updatedAt", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("apikey_userId_organizationId_idx")
    .ifNotExists()
    .on("apikey")
    .columns(["userId", "organizationId"])
    .execute();

  await db.schema
    .createIndex("apikey_start_idx")
    .ifNotExists()
    .on("apikey")
    .column("start")
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db.schema.dropIndex("apikey_start_idx").ifExists().execute();
  await db.schema
    .dropIndex("apikey_userId_organizationId_idx")
    .ifExists()
    .execute();
  await db.schema.dropTable("apikey").ifExists().execute();
};
