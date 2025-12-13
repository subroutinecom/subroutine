import type { Kysely } from "kysely";
import { sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .createTable("userApproval")
    .ifNotExists()
    .addColumn("userId", "text", (col) =>
      col.primaryKey().references("user.id").onDelete("cascade")
    )
    .addColumn("approved", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("approvedBy", "text", (col) => col.references("user.id"))
    .addColumn("createdAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db.schema.dropTable("userApproval").ifExists().execute();
};
