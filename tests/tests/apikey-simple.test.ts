import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import {
  createTestAuthClient,
  generateTestEmail,
  generateOrgName,
} from "../utils/auth-client.ts";

describe(
  "API Key Simple Test",
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    it("should create an API key with active organization", async () => {
      const client = createTestAuthClient();
      const email = generateTestEmail();
      const password = "TestPassword123!";
      const orgName = generateOrgName();

      const signUp = await client.signUp.email({
        email: email,
        password: password,
        name: email,
      });
      console.log("SignUp:", JSON.stringify(signUp, null, 2));

      const org = await client.organization.create({
        name: orgName,
        slug: orgName.toLowerCase(),
      });
      console.log("Org:", JSON.stringify(org, null, 2));

      const setActive = await client.organization.setActive({
        organizationId: org.data!.id,
      });
      console.log("SetActive result:", setActive);
      console.log("SetActive error:", setActive.error);
      console.log("SetActive data:", setActive.data);

      const session = await client.getSession();
      console.log("Session:", JSON.stringify(session, null, 2));

      // Use $fetch instead of apiKey.create() because apiKeyClient doesn't support session auth
      const response = await client.$fetch("/api-key/create", {
        method: "POST",
        body: {
          name: "Test API Key",
        },
      });
      console.log("API Key response:", JSON.stringify(response, null, 2));

      // Better-auth returns { data: {...}, error: null }
      const result = response as { data?: { id?: string; key?: string; name?: string }; error?: any };

      expect(result.data, "API key should be created").toBeDefined();
      expect(result.data?.id, "API key should have an ID").toBeDefined();
      expect(result.data?.key, "API key should have a key").toBeDefined();
      expect(result.data?.name, "API key name should match").toBe("Test API Key");

      console.log("✅ SUCCESS: API key created with ID:", result.data?.id);
    });
  },
);
