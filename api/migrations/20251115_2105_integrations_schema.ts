import type { Kysely } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .createTable("integration")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn(
      "organizationId",
      "text",
      (col) => col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("authConfig", "text", (col) => col.notNull())
    .addColumn("enabled", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("createdAt", "text", (col) => col.notNull())
    .addColumn("updatedAt", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_integration_org_id")
    .ifNotExists()
    .on("integration")
    .column("organizationId")
    .execute();

  await db.schema
    .createIndex("idx_integration_provider")
    .ifNotExists()
    .on("integration")
    .column("provider")
    .execute();

  await db.schema
    .alterTable("integration")
    .addUniqueConstraint("integration_org_provider_name_unique", [
      "organizationId",
      "provider",
      "name",
    ])
    .execute();

  await db.schema
    .createTable("connected_account")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn(
      "integrationId",
      "text",
      (col) => col.notNull().references("integration.id").onDelete("cascade"),
    )
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn(
      "organizationId",
      "text",
      (col) => col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("credentials", "text", (col) => col.notNull())
    .addColumn("accountIdentifier", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("lastUsedAt", "text")
    .addColumn("createdAt", "text", (col) => col.notNull())
    .addColumn("updatedAt", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_connected_account_integration_id")
    .ifNotExists()
    .on("connected_account")
    .column("integrationId")
    .execute();

  await db.schema
    .createIndex("idx_connected_account_user_id")
    .ifNotExists()
    .on("connected_account")
    .column("userId")
    .execute();

  await db.schema
    .createIndex("idx_connected_account_org_id")
    .ifNotExists()
    .on("connected_account")
    .column("organizationId")
    .execute();

  await db.schema
    .createIndex("idx_connected_account_status")
    .ifNotExists()
    .on("connected_account")
    .column("status")
    .execute();

  await db.schema
    .alterTable("connected_account")
    .addUniqueConstraint("connected_account_user_integration_unique", [
      "userId",
      "integrationId",
    ])
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db.schema.dropTable("connected_account").ifExists().execute();
  await db.schema.dropTable("integration").ifExists().execute();
};
