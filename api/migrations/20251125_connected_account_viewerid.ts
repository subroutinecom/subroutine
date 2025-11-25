import type { Kysely } from "kysely";
import { sql } from "kysely";

export const up = async (db: Kysely<any>): Promise<void> => {
  // Step 1: Add viewerId column (nullable initially to handle existing data)
  await db.schema.alterTable("connected_account").addColumn("viewerId", "text").execute();

  // Step 2: Migrate existing data - extract viewerId from accountIdentifier
  // (accountIdentifier was already storing viewerId in the OAuth flow)
  await sql`
    UPDATE connected_account
    SET "viewerId" = COALESCE("accountIdentifier", "userId")
    WHERE "viewerId" IS NULL
  `.execute(db);

  // Step 3: Make viewerId not null
  await db.schema
    .alterTable("connected_account")
    .alterColumn("viewerId", (col) => col.setNotNull())
    .execute();

  // Step 4: Drop the old unique constraint (userId, integrationId)
  await db.schema
    .alterTable("connected_account")
    .dropConstraint("connected_account_user_integration_unique")
    .execute();

  // Step 5: Drop the userId index
  await db.schema.dropIndex("idx_connected_account_user_id").ifExists().execute();

  // Step 6: Drop the userId column
  await db.schema.alterTable("connected_account").dropColumn("userId").execute();

  // Step 7: Add new unique constraint (integrationId, organizationId, viewerId)
  await db.schema
    .alterTable("connected_account")
    .addUniqueConstraint("connected_account_integration_org_viewer_unique", [
      "integrationId",
      "organizationId",
      "viewerId",
    ])
    .execute();

  // Step 8: Add index on viewerId for efficient lookups
  await db.schema
    .createIndex("idx_connected_account_viewer_id")
    .ifNotExists()
    .on("connected_account")
    .column("viewerId")
    .execute();
};

export const down = async (db: Kysely<any>): Promise<void> => {
  // Drop the new index
  await db.schema.dropIndex("idx_connected_account_viewer_id").ifExists().execute();

  // Drop the new unique constraint
  await db.schema
    .alterTable("connected_account")
    .dropConstraint("connected_account_integration_org_viewer_unique")
    .execute();

  // Add userId column back (nullable since we can't recover the original data)
  await db.schema.alterTable("connected_account").addColumn("userId", "text").execute();

  // Add back the old unique constraint
  await db.schema
    .alterTable("connected_account")
    .addUniqueConstraint("connected_account_user_integration_unique", ["userId", "integrationId"])
    .execute();

  // Create index on userId
  await db.schema
    .createIndex("idx_connected_account_user_id")
    .ifNotExists()
    .on("connected_account")
    .column("userId")
    .execute();

  // Drop viewerId column
  await db.schema.alterTable("connected_account").dropColumn("viewerId").execute();
};
