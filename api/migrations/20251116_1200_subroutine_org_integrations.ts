import type { Kysely } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .alterTable("subroutine")
    .addColumn(
      "organization_id",
      "text",
      (col) => col.references("organization.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .alterTable("run")
    .addColumn(
      "organization_id",
      "text",
      (col) => col.references("organization.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .createTable("subroutine_integration")
    .ifNotExists()
    .addColumn("subroutine_id", "text", (col) =>
      col
        .notNull()
        .references("subroutine.id")
        .onDelete("cascade"))
    .addColumn("integration_id", "text", (col) =>
      col
        .notNull()
        .references("integration.id")
        .onDelete("cascade"))
    .addColumn("organization_id", "text", (col) =>
      col
        .notNull()
        .references("organization.id")
        .onDelete("cascade"))
    .addColumn("created_at", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("subroutine_integration_pkey", [
      "subroutine_id",
      "integration_id",
    ])
    .execute();

  await db.schema
    .createIndex("idx_subroutine_integration_org")
    .ifNotExists()
    .on("subroutine_integration")
    .column("organization_id")
    .execute();

  await db.schema
    .createIndex("idx_subroutine_integration_integration")
    .ifNotExists()
    .on("subroutine_integration")
    .column("integration_id")
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .dropIndex("idx_subroutine_integration_integration")
    .ifExists()
    .execute();

  await db.schema
    .dropIndex("idx_subroutine_integration_org")
    .ifExists()
    .execute();

  await db.schema
    .dropTable("subroutine_integration")
    .ifExists()
    .execute();

  await db.schema
    .alterTable("run")
    .dropColumn("organization_id")
    .execute();

  await db.schema
    .alterTable("subroutine")
    .dropColumn("organization_id")
    .execute();
};
