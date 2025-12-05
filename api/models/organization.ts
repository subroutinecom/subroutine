import { db } from "../db/index.ts";

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
}

export const getOrganizationBySlug = async (slug: string): Promise<OrganizationInfo | null> => {
  const result = await db
    .selectFrom("organization")
    .select(["id", "name", "slug"])
    .where("slug", "=", slug)
    .executeTakeFirst();

  return result || null;
};

export const isUserMemberOfOrganization = async (
  userId: string,
  organizationId: string
): Promise<boolean> => {
  const result = await db
    .selectFrom("member")
    .select("id")
    .where("userId", "=", userId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  return !!result;
};
