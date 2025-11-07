import type { Kysely } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .createTable("subroutine")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("inputs_schema", "text")
    .addColumn("outputs_schema", "text")
    .addColumn("created_from_request", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("run")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("subroutine_id", "text", (col) =>
      col.notNull().references("subroutine.id"),
    )
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("started_at", "text")
    .addColumn("ended_at", "text")
    .addColumn("outputs", "text")
    .addColumn("error", "text")
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db.schema.dropTable("run").ifExists().execute();
  await db.schema.dropTable("subroutine").ifExists().execute();
};
