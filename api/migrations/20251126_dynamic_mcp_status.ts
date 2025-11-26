import type { Kysely } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  // Add status column with default 'static' for existing integrations
  // "static" = manually configured integrations
  // "dynamic" = AI-managed integrations that can be auto-fixed
  await db.schema
    .alterTable("integration")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("static"))
    .execute();

  // Add index for efficient status queries
  await db.schema
    .createIndex("idx_integration_status")
    .ifNotExists()
    .on("integration")
    .column("status")
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  // Drop the index
  await db.schema.dropIndex("idx_integration_status").ifExists().execute();

  // Drop the status column
  await db.schema.alterTable("integration").dropColumn("status").execute();
};
