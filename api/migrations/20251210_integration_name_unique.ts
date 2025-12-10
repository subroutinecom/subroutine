import { Kysely } from "kysely";

export const up = async (db: Kysely<unknown>): Promise<void> => {
  // Drop old constraint (org + provider + name)
  await db.schema
    .alterTable("integration")
    .dropConstraint("integration_org_provider_name_unique")
    .execute();

  // Add new constraint (org + name only) - names must be unique per organization
  await db.schema
    .alterTable("integration")
    .addUniqueConstraint("integration_org_name_unique", [
      "organizationId",
      "name",
    ])
    .execute();
};

export const down = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema
    .alterTable("integration")
    .dropConstraint("integration_org_name_unique")
    .execute();

  await db.schema
    .alterTable("integration")
    .addUniqueConstraint("integration_org_provider_name_unique", [
      "organizationId",
      "provider",
      "name",
    ])
    .execute();
};
