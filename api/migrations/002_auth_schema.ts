import type { Kysely } from "kysely";
import { sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .createTable("user")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("emailVerified", "boolean", (col) => col.notNull())
    .addColumn("image", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable("organization")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("logo", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("metadata", "text")
    .execute();

  await db.schema
    .createTable("session")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("ipAddress", "text")
    .addColumn("userAgent", "text")
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("activeOrganizationId", "text")
    .execute();

  await db.schema
    .createTable("account")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("accountId", "text", (col) => col.notNull())
    .addColumn("providerId", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("accessToken", "text")
    .addColumn("refreshToken", "text")
    .addColumn("idToken", "text")
    .addColumn("accessTokenExpiresAt", "timestamptz")
    .addColumn("refreshTokenExpiresAt", "timestamptz")
    .addColumn("scope", "text")
    .addColumn("password", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("verification")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("identifier", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable("member")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn(
      "organizationId",
      "text",
      (col) => col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("invitation")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn(
      "organizationId",
      "text",
      (col) => col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("role", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn(
      "inviterId",
      "text",
      (col) => col.notNull().references("user.id").onDelete("cascade"),
    )
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  await db.schema.dropTable("invitation").ifExists().execute();
  await db.schema.dropTable("member").ifExists().execute();
  await db.schema.dropTable("verification").ifExists().execute();
  await db.schema.dropTable("account").ifExists().execute();
  await db.schema.dropTable("session").ifExists().execute();
  await db.schema.dropTable("organization").ifExists().execute();
  await db.schema.dropTable("user").ifExists().execute();
};
