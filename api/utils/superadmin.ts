import { getConfig } from "../config/loader";

export const isSuperadminOrg = async (organizationId: string): Promise<boolean> => {
  const config = await getConfig();
  return config.superadmin?.organizationIds?.includes(organizationId) ?? false;
};
