import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

export const createTestAuthClient = () => {
  return createAuthClient({
    baseURL: "http://api:80",
    plugins: [organizationClient()],
  });
};

export const generateTestEmail = (prefix = "test") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
};

export const generateOrgName = (prefix = "TestOrg") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
};
