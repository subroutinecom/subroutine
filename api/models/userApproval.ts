import { db } from "../db/index";
import { getConfig } from "../config/loader";
import { isSuperadminOrg } from "../utils/superadmin";

export class ApprovalRequiredError extends Error {
  readonly code = "APPROVAL_REQUIRED";
  constructor(public readonly userId: string) {
    super("User is not approved. Please wait for account approval.");
    this.name = "ApprovalRequiredError";
  }
}

export const isUserApproved = async (
  userId: string,
  organizationId: string
): Promise<boolean> => {
  const config = await getConfig();

  // If approvals not required, everyone is approved
  if (!config.features?.approvalsRequired) {
    return true;
  }

  // Superadmin orgs bypass approval checks
  if (await isSuperadminOrg(organizationId)) {
    return true;
  }

  // Check userApproval table - no row or approved=false means not approved
  const approval = await db
    .selectFrom("userApproval")
    .select("approved")
    .where("userId", "=", userId)
    .executeTakeFirst();

  return approval?.approved === true;
};

export const requireApproval = async (
  userId: string,
  organizationId: string
): Promise<void> => {
  const approved = await isUserApproved(userId, organizationId);
  if (!approved) {
    throw new ApprovalRequiredError(userId);
  }
};
