import type { Kysely } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .createTable("pat_link")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("integrationId", "text", (col) =>
      col.notNull().references("integration.id").onDelete("cascade")
    )
    .addColumn("viewerId", "text", (col) => col.notNull())
    .addColumn("organizationId", "text", (col) =>
      col.notNull().references("organization.id").onDelete("cascade")
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("expiresAt", "text", (col) => col.notNull())
    .addColumn("usedAt", "text")
    .addColumn("createdAt", "text", (col) => col.notNull())
    .addColumn("updatedAt", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_pat_link_integration_id")
    .ifNotExists()
    .on("pat_link")
    .column("integrationId")
    .execute();

  await db.schema
    .createIndex("idx_pat_link_viewer_id")
    .ifNotExists()
    .on("pat_link")
    .column("viewerId")
    .execute();

  await db.schema
    .createIndex("idx_pat_link_org_id")
    .ifNotExists()
    .on("pat_link")
    .column("organizationId")
    .execute();

  await db.schema
    .createIndex("idx_pat_link_status")
    .ifNotExists()
    .on("pat_link")
    .column("status")
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db.schema.dropTable("pat_link").ifExists().execute();
};
