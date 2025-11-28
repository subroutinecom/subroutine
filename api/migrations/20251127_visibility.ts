import type { Kysely } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  // Add visibility column with default 'private' for existing integrations
  // "private" = org-specific integration (default, existing behavior)
  // "global" = first-party registry integration available to all orgs
  await db.schema
    .alterTable("integration")
    .addColumn("visibility", "text", (col) => col.notNull().defaultTo("private"))
    .execute();

  // Add description column for AI-readable integration descriptions
  // This helps the AI agent make informed decisions about which integration to use
  await db.schema.alterTable("integration").addColumn("description", "text").execute();

  // Add index for efficient visibility queries (finding global integrations)
  await db.schema
    .createIndex("idx_integration_visibility")
    .ifNotExists()
    .on("integration")
    .column("visibility")
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db.schema.dropIndex("idx_integration_visibility").ifExists().execute();
  await db.schema.alterTable("integration").dropColumn("description").execute();
  await db.schema.alterTable("integration").dropColumn("visibility").execute();
};
